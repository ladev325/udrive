using System.Collections.Concurrent;
using System.IO.Compression;
using Microsoft.EntityFrameworkCore;

record DriveLimits(long QuotaBytes, long MaxFileBytes, TimeSpan TrashLifetime);

// Error codes are sent to the frontend as-is and translated there.
class DriveException : Exception
{
    public string Code { get; }
    public int Status { get; }
    public DriveException(string code, int status = 400) : base(code) { Code = code; Status = status; }
}

class DriveService
{
    private static readonly string[] ImageExtensions =
        [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".svg", ".ico", ".heic", ".heif"];

    // Per-user lock + bytes of uploads in progress, so parallel uploads can't overshoot the quota.
    private static readonly ConcurrentDictionary<int, SemaphoreSlim> UserLocks = new();
    private static readonly ConcurrentDictionary<int, long> Reserved = new();

    private readonly AppDb _db;
    private readonly BlobStore _blobs;
    private readonly DriveLimits _limits;

    public DriveService(AppDb db, BlobStore blobs, DriveLimits limits)
    {
        _db = db;
        _blobs = blobs;
        _limits = limits;
    }

    public DriveLimits Limits => _limits;
    private static long Now() => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    // ---- names --------------------------------------------------------------------------------

    public static bool IsValidName(string? name)
    {
        var trimmed = name?.Trim() ?? "";
        return trimmed.Length is > 0 and <= 255
            && trimmed is not ("." or "..")
            && !trimmed.Any(c => c is '/' or '\\' || char.IsControl(c));
    }

    private static string CleanName(string? name) =>
        IsValidName(name) ? name!.Trim() : throw new DriveException("INVALID_NAME");

    // "report.pdf" -> "report (1).pdf" while the name is taken (case-insensitive).
    public static string UniqueName(IEnumerable<string> siblings, string name)
    {
        var taken = new HashSet<string>(siblings, StringComparer.OrdinalIgnoreCase);
        if (!taken.Contains(name)) return name;
        var ext = Path.GetExtension(name);
        var stem = ext.Length > 0 && ext.Length < name.Length ? name[..^ext.Length] : name;
        if (stem == name) ext = "";
        for (int n = 1; ; n++)
        {
            var candidate = $"{stem} ({n}){ext}";
            if (candidate.Length > 255) candidate = $"{stem[..Math.Max(1, 240 - ext.Length)]} ({n}){ext}";
            if (!taken.Contains(candidate)) return candidate;
        }
    }

    private Task<List<string>> SiblingNames(int userId, string? parentId, string? exceptId = null) =>
        _db.DriveItems
            .Where(i => i.UserId == userId && i.Space == DriveSpaces.Files && i.ParentId == parentId
                        && i.TrashedAt == null && i.Id != exceptId)
            .Select(i => i.Name).ToListAsync();

    public static bool IsImage(DriveItem item) =>
        !item.IsFolder && item.Space == DriveSpaces.Files
        && (item.Mime.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
            || ImageExtensions.Contains(Path.GetExtension(item.Name).ToLowerInvariant()));

    // ---- lookups ------------------------------------------------------------------------------

    private Task<List<DriveItem>> AllItems(int userId, string space = DriveSpaces.Files) =>
        _db.DriveItems.Where(i => i.UserId == userId && i.Space == space).ToListAsync();

    private async Task<DriveItem> Find(int userId, string? id, string space = DriveSpaces.Files)
    {
        if (!BlobStore.IsValidId(id)) throw new DriveException("NOT_FOUND", 404);
        return await _db.DriveItems.FirstOrDefaultAsync(i => i.Id == id && i.UserId == userId && i.Space == space)
               ?? throw new DriveException("NOT_FOUND", 404);
    }

    private async Task<DriveItem> FindActive(int userId, string? id)
    {
        var item = await Find(userId, id);
        return item.TrashedAt == null ? item : throw new DriveException("NOT_FOUND", 404);
    }

    // null/"" = root; otherwise an existing folder that is not in the trash.
    private async Task<string?> ResolveFolder(int userId, string? folderId)
    {
        if (string.IsNullOrEmpty(folderId)) return null;
        var folder = await FindActive(userId, folderId);
        return folder.IsFolder ? folder.Id : throw new DriveException("NOT_A_FOLDER");
    }

    // Children map for walking subtrees in memory (a personal drive has few enough items for this).
    private static ILookup<string?, DriveItem> ChildrenOf(List<DriveItem> all) => all.ToLookup(i => i.ParentId);

    private static IEnumerable<DriveItem> Subtree(DriveItem root, ILookup<string?, DriveItem> children,
        Func<DriveItem, bool>? skip = null)
    {
        var stack = new Stack<DriveItem>([root]);
        while (stack.Count > 0)
        {
            var item = stack.Pop();
            yield return item;
            if (!item.IsFolder) continue;
            foreach (var child in children[item.Id])
                if (skip == null || !skip(child)) stack.Push(child);
        }
    }

    // ---- storage ------------------------------------------------------------------------------

    public async Task<long> UsedBytes(int userId) =>
        await _db.DriveItems.Where(i => i.UserId == userId).SumAsync(i => i.Size)
        + Reserved.GetValueOrDefault(userId);

    public async Task<object> StorageSummary(int userId)
    {
        long used = await UsedBytes(userId);
        int savedCount = await _db.DriveItems.CountAsync(i =>
            i.UserId == userId && i.Space == DriveSpaces.Files && i.IsSaved && i.TrashedAt == null);
        int trashCount = await _db.DriveItems.CountAsync(i =>
            i.UserId == userId && i.Space == DriveSpaces.Files && i.IsTrashRoot);
        return new { used, quota = _limits.QuotaBytes, maxFileSize = _limits.MaxFileBytes, savedCount, trashCount };
    }

    // The "check before upload" step: fails fast before any bytes are sent.
    public async Task CheckUpload(int userId, IEnumerable<long> sizes)
    {
        var list = sizes.ToList();
        if (list.Count == 0 || list.Any(s => s < 0)) throw new DriveException("INVALID_SIZE");
        if (list.Any(s => s > _limits.MaxFileBytes)) throw new DriveException("FILE_TOO_LARGE", 413);
        if (await UsedBytes(userId) + list.Sum() > _limits.QuotaBytes) throw new DriveException("QUOTA_EXCEEDED", 413);
    }

    // ---- browsing -----------------------------------------------------------------------------

    public async Task<(DriveItem? Folder, List<DriveItem> Path, List<DriveItem> Items)> ListFolder(int userId, string? folderId)
    {
        var all = await AllItems(userId);
        DriveItem? folder = null;
        if (!string.IsNullOrEmpty(folderId))
        {
            folder = all.FirstOrDefault(i => i.Id == folderId && i.IsFolder && i.TrashedAt == null)
                     ?? throw new DriveException("NOT_FOUND", 404);
        }

        var byId = all.ToDictionary(i => i.Id);
        var path = new List<DriveItem>();
        for (var cur = folder; cur != null; cur = cur.ParentId != null ? byId.GetValueOrDefault(cur.ParentId) : null)
            path.Insert(0, cur);

        var items = all.Where(i => i.ParentId == folder?.Id && i.TrashedAt == null)
            .OrderByDescending(i => i.IsFolder).ThenBy(i => i.Name, StringComparer.CurrentCultureIgnoreCase)
            .ToList();
        return (folder, path, items);
    }

    public async Task<List<DriveItem>> AllFolders(int userId) =>
        await _db.DriveItems.Where(i => i.UserId == userId && i.Space == DriveSpaces.Files && i.IsFolder && i.TrashedAt == null)
            .OrderBy(i => i.Name).ToListAsync();

    public async Task<List<DriveItem>> Photos(int userId) =>
        (await _db.DriveItems.Where(i => i.UserId == userId && i.Space == DriveSpaces.Files && !i.IsFolder && i.TrashedAt == null)
            .ToListAsync())
        .Where(IsImage).OrderByDescending(i => i.CreatedAt).ToList();

    public async Task<List<DriveItem>> Saved(int userId) =>
        await _db.DriveItems.Where(i => i.UserId == userId && i.Space == DriveSpaces.Files && i.IsSaved && i.TrashedAt == null)
            .OrderByDescending(i => i.CreatedAt).ToListAsync();

    // ---- changes ------------------------------------------------------------------------------

    public async Task<DriveItem> CreateFolder(int userId, string? parentId, string? name)
    {
        var parent = await ResolveFolder(userId, parentId);
        var clean = CleanName(name);
        if ((await SiblingNames(userId, parent)).Contains(clean, StringComparer.OrdinalIgnoreCase))
            throw new DriveException("NAME_TAKEN", 409);

        long now = Now();
        var folder = new DriveItem
        {
            Id = BlobStore.NewId(), UserId = userId, Space = DriveSpaces.Files, ParentId = parent, IsFolder = true,
            Name = clean, Mime = "inode/directory", CreatedAt = now, ModifiedAt = now,
        };
        _db.DriveItems.Add(folder);
        await _db.SaveChangesAsync();
        return folder;
    }

    // Streams the request body straight to disk. The size is reserved against the quota first,
    // so the upload is refused before any bytes are written when it can't fit.
    public async Task<DriveItem> Upload(int userId, string username, string space, string? parentId, string? name,
        string? mime, long? contentLength, Stream body, string? secret, CancellationToken ct)
    {
        string? parent = null;
        string cleanName = "";
        if (space == DriveSpaces.Files)
        {
            parent = await ResolveFolder(userId, parentId);
            cleanName = CleanName(name);
        }
        else if (string.IsNullOrEmpty(secret) || secret.Length > 8192)
        {
            throw new DriveException("INVALID_SECRET");
        }

        // Vault blobs carry 28 extra bytes (IV + auth tag) on top of the original file.
        long maxBytes = _limits.MaxFileBytes + (space == DriveSpaces.Vault ? 1024 : 0);
        if (contentLength is not { } length) throw new DriveException("LENGTH_REQUIRED", 411);
        if (length > maxBytes) throw new DriveException("FILE_TOO_LARGE", 413);

        var userLock = UserLocks.GetOrAdd(userId, _ => new SemaphoreSlim(1, 1));
        await userLock.WaitAsync(ct);
        try
        {
            if (await UsedBytes(userId) + length > _limits.QuotaBytes) throw new DriveException("QUOTA_EXCEEDED", 413);
            Reserved.AddOrUpdate(userId, length, (_, r) => r + length);
        }
        finally { userLock.Release(); }

        var id = BlobStore.NewId();
        var path = _blobs.PrepareBlobPath(username, space, id);
        try
        {
            long written = 0;
            await using (var fs = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                var buffer = new byte[81920];
                int read;
                while ((read = await body.ReadAsync(buffer, ct)) > 0)
                {
                    written += read;
                    if (written > length) throw new DriveException("LENGTH_MISMATCH");
                    await fs.WriteAsync(buffer.AsMemory(0, read), ct);
                }
            }
            if (written != length) throw new DriveException("LENGTH_MISMATCH");

            await userLock.WaitAsync(CancellationToken.None);
            try
            {
                long now = Now();
                var item = new DriveItem
                {
                    Id = id, UserId = userId, Space = space, ParentId = parent, Size = written,
                    Name = space == DriveSpaces.Files ? UniqueName(await SiblingNames(userId, parent), cleanName) : "",
                    Mime = space == DriveSpaces.Files && !string.IsNullOrWhiteSpace(mime) && mime.Length <= 255
                        ? mime : "application/octet-stream",
                    CreatedAt = now, ModifiedAt = now, Secret = space == DriveSpaces.Vault ? secret : null,
                };
                _db.DriveItems.Add(item);
                await _db.SaveChangesAsync(CancellationToken.None);
                return item;
            }
            finally { userLock.Release(); }
        }
        catch
        {
            File.Delete(path);
            throw;
        }
        finally
        {
            Reserved.AddOrUpdate(userId, 0, (_, r) => r - length);
        }
    }

    public async Task<DriveItem> Rename(int userId, string id, string? name)
    {
        var item = await FindActive(userId, id);
        var clean = CleanName(name);
        if ((await SiblingNames(userId, item.ParentId, item.Id)).Contains(clean, StringComparer.OrdinalIgnoreCase))
            throw new DriveException("NAME_TAKEN", 409);
        item.Name = clean;
        item.ModifiedAt = Now();
        await _db.SaveChangesAsync();
        return item;
    }

    public async Task<DriveItem> Move(int userId, string id, string? targetFolderId)
    {
        var item = await FindActive(userId, id);
        var target = await ResolveFolder(userId, targetFolderId);
        if (target == item.ParentId) return item;

        if (item.IsFolder && target != null)
        {
            // A folder can't go into itself or one of its own subfolders.
            var all = await AllItems(userId);
            var byId = all.ToDictionary(i => i.Id);
            for (var cur = target; cur != null; cur = byId.GetValueOrDefault(cur)?.ParentId)
                if (cur == item.Id) throw new DriveException("MOVE_INTO_ITSELF");
        }
        if ((await SiblingNames(userId, target)).Contains(item.Name, StringComparer.OrdinalIgnoreCase))
            throw new DriveException("NAME_TAKEN", 409);

        item.ParentId = target;
        item.ModifiedAt = Now();
        await _db.SaveChangesAsync();
        return item;
    }

    public async Task<DriveItem> SetSaved(int userId, string id, bool isSaved)
    {
        var item = await FindActive(userId, id);
        if (item.IsFolder) throw new DriveException("NOT_A_FILE");
        item.IsSaved = isSaved;
        await _db.SaveChangesAsync();
        return item;
    }

    // ---- trash --------------------------------------------------------------------------------

    public async Task MoveToTrash(int userId, string id)
    {
        var all = await AllItems(userId);
        var root = all.FirstOrDefault(i => i.Id == id && i.TrashedAt == null) ?? throw new DriveException("NOT_FOUND", 404);
        long now = Now();
        // Things already in the trash inside this folder keep their own trash entry and date.
        foreach (var item in Subtree(root, ChildrenOf(all), skip: c => c.TrashedAt != null))
            item.TrashedAt = now;
        root.IsTrashRoot = true;
        await _db.SaveChangesAsync();
    }

    public async Task<List<(DriveItem Item, long TotalSize)>> Trash(int userId)
    {
        var all = await AllItems(userId);
        var children = ChildrenOf(all);
        return all.Where(i => i.IsTrashRoot)
            .OrderByDescending(i => i.TrashedAt)
            .Select(i => (i, Subtree(i, children, skip: c => c.IsTrashRoot).Sum(x => x.Size)))
            .ToList();
    }

    public long TrashExpiresAt(DriveItem item) => (item.TrashedAt ?? 0) + (long)_limits.TrashLifetime.TotalMilliseconds;

    public async Task<DriveItem> Restore(int userId, string id)
    {
        var all = await AllItems(userId);
        var root = all.FirstOrDefault(i => i.Id == id && i.IsTrashRoot) ?? throw new DriveException("NOT_FOUND", 404);
        var byId = all.ToDictionary(i => i.Id);

        foreach (var item in Subtree(root, ChildrenOf(all), skip: c => c.IsTrashRoot))
            item.TrashedAt = null;
        root.IsTrashRoot = false;

        // If the original folder is gone or itself in the trash, restore into the root folder.
        if (root.ParentId != null && byId.GetValueOrDefault(root.ParentId) is not { TrashedAt: null, IsFolder: true })
            root.ParentId = null;
        var siblings = all.Where(i => i.ParentId == root.ParentId && i.TrashedAt == null && i.Id != root.Id).Select(i => i.Name);
        root.Name = UniqueName(siblings, root.Name);

        await _db.SaveChangesAsync();
        return root;
    }

    public async Task DeleteForever(int userId, string username, string id)
    {
        var all = await AllItems(userId);
        var root = all.FirstOrDefault(i => i.Id == id && i.IsTrashRoot) ?? throw new DriveException("NOT_FOUND", 404);
        await DeleteSubtrees(username, [root], ChildrenOf(all));
    }

    public async Task EmptyTrash(int userId, string username)
    {
        var all = await AllItems(userId);
        await DeleteSubtrees(username, all.Where(i => i.IsTrashRoot).ToList(), ChildrenOf(all));
    }

    // Deletes trash entries older than the trash lifetime, for every user.
    public async Task<int> PurgeExpiredTrash()
    {
        long cutoff = Now() - (long)_limits.TrashLifetime.TotalMilliseconds;
        var expiredUsers = await _db.DriveItems.Where(i => i.IsTrashRoot && i.TrashedAt < cutoff)
            .Select(i => i.UserId).Distinct().ToListAsync();
        int removed = 0;
        foreach (var userId in expiredUsers)
        {
            var username = await _db.Users.Where(u => u.Id == userId).Select(u => u.Username).FirstOrDefaultAsync();
            if (username == null) continue;
            var all = await AllItems(userId);
            var roots = all.Where(i => i.IsTrashRoot && i.TrashedAt < cutoff).ToList();
            await DeleteSubtrees(username, roots, ChildrenOf(all));
            removed += roots.Count;
        }
        return removed;
    }

    private async Task DeleteSubtrees(string username, List<DriveItem> roots, ILookup<string?, DriveItem> children)
    {
        var doomed = roots.SelectMany(r => Subtree(r, children)).DistinctBy(i => i.Id).ToList();
        _db.DriveItems.RemoveRange(doomed);
        await _db.SaveChangesAsync();
        foreach (var item in doomed.Where(i => !i.IsFolder))
            _blobs.DeleteBlob(username, item.Space, item.Id);
    }

    // ---- downloads ----------------------------------------------------------------------------

    // Files can be downloaded from the drive and from the trash.
    public async Task<DriveItem> GetFile(int userId, string id)
    {
        var item = await Find(userId, id);
        return item.IsFolder ? throw new DriveException("NOT_A_FILE") : item;
    }

    public async Task<DriveItem> GetFolder(int userId, string id)
    {
        var item = await Find(userId, id);
        return item.IsFolder ? item : throw new DriveException("NOT_A_FOLDER");
    }

    // Writes the folder (with subfolders) as a ZIP. Items trashed separately inside it are left out.
    public async Task WriteZip(int userId, string username, DriveItem folder, Stream output, CancellationToken ct)
    {
        var all = await AllItems(userId);
        var children = ChildrenOf(all);
        using var zip = new ZipArchive(output, ZipArchiveMode.Create, leaveOpen: true);

        async Task AddFolder(DriveItem dir, string prefix)
        {
            var kids = children[dir.Id].Where(c => !c.IsTrashRoot).ToList();
            if (kids.Count == 0 && prefix.Length > 0) zip.CreateEntry(prefix);
            var used = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var child in kids.OrderByDescending(c => c.IsFolder))
            {
                var entryName = UniqueName(used, child.Name);
                used.Add(entryName);
                if (child.IsFolder)
                {
                    await AddFolder(child, prefix + entryName + "/");
                    continue;
                }
                var entry = zip.CreateEntry(prefix + entryName, CompressionLevel.Fastest);
                entry.LastWriteTime = DateTimeOffset.FromUnixTimeMilliseconds(child.ModifiedAt);
                await using var target = entry.Open();
                await using var source = File.OpenRead(_blobs.BlobPath(username, child.Space, child.Id));
                await source.CopyToAsync(target, ct);
            }
        }

        await AddFolder(folder, "");
    }

    // ---- vault --------------------------------------------------------------------------------

    public async Task<List<DriveItem>> VaultFiles(int userId) =>
        await _db.DriveItems.Where(i => i.UserId == userId && i.Space == DriveSpaces.Vault)
            .OrderByDescending(i => i.CreatedAt).ToListAsync();

    public Task<DriveItem> GetVaultFile(int userId, string id) => Find(userId, id, DriveSpaces.Vault);

    public async Task DeleteVaultFile(int userId, string username, string id)
    {
        var item = await Find(userId, id, DriveSpaces.Vault);
        _db.DriveItems.Remove(item);
        await _db.SaveChangesAsync();
        _blobs.DeleteBlob(username, DriveSpaces.Vault, item.Id);
    }

    public async Task ResetVault(int userId, string username)
    {
        var items = await VaultFiles(userId);
        _db.DriveItems.RemoveRange(items);
        await _db.SaveChangesAsync();
        foreach (var item in items) _blobs.DeleteBlob(username, DriveSpaces.Vault, item.Id);
        _blobs.DeleteVaultConfig(username);
    }
}

class TrashCleanup : BackgroundService
{
    private readonly IServiceScopeFactory _scopes;
    private readonly ILogger<TrashCleanup> _logger;

    public TrashCleanup(IServiceScopeFactory scopes, ILogger<TrashCleanup> logger)
    {
        _scopes = scopes;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromHours(1));
        try
        {
            do
            {
                try
                {
                    using var scope = _scopes.CreateScope();
                    int removed = await scope.ServiceProvider.GetRequiredService<DriveService>().PurgeExpiredTrash();
                    if (removed > 0) _logger.LogInformation("Deleted {Count} expired trash entries", removed);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Trash cleanup failed");
                }
            } while (await timer.WaitForNextTickAsync(stoppingToken));
        }
        catch (OperationCanceledException)
        {
            // server is shutting down
        }
    }
}
