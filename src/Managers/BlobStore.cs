using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.EntityFrameworkCore;

// File contents on disk: <root>/<username>/<space>/<id><fileExt>. Metadata is in SQLite (DriveItem).
// The vault's password check lives in <root>/<username>/vault.json.
partial class BlobStore
{
    public const int MaxVaultConfigLength = 8192;

    [GeneratedRegex(@"^[a-f0-9]{32}$")]
    private static partial Regex IdRegex();

    private readonly string _root, _fileExt;

    public BlobStore(string root, string fileExt)
    {
        _root = Path.GetFullPath(root);
        _fileExt = fileExt;
        Directory.CreateDirectory(_root);
    }

    public string Root => _root;
    public static bool IsValidId(string? id) => id != null && IdRegex().IsMatch(id);
    public static string NewId() => Guid.NewGuid().ToString("N");

    private string UserDir(string username)
    {
        // Username, space and id are validated against strict patterns; this is the last line of
        // defense against path traversal.
        if (!UserManager.IsValidUsername(username)) throw new ArgumentException("unsafe path");
        return Path.Combine(_root, username);
    }

    public string BlobPath(string username, string space, string id)
    {
        if (space is not (DriveSpaces.Files or DriveSpaces.Vault) || !IsValidId(id))
            throw new ArgumentException("unsafe path");
        return Path.Combine(UserDir(username), space, id + _fileExt);
    }

    public string PrepareBlobPath(string username, string space, string id)
    {
        var path = BlobPath(username, space, id);
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        return path;
    }

    public void DeleteBlob(string username, string space, string id)
    {
        try { File.Delete(BlobPath(username, space, id)); }
        catch (IOException) { /* best effort: a leftover blob only wastes disk space */ }
    }

    // ---- vault config (opaque JSON made by the browser: salt, iterations, encrypted check value) ----

    private string VaultConfigPath(string username) => Path.Combine(UserDir(username), "vault.json");

    public async Task<string?> GetVaultConfig(string username)
    {
        var path = VaultConfigPath(username);
        return File.Exists(path) ? await File.ReadAllTextAsync(path) : null;
    }

    // Returns false if a vault already exists (it can only be replaced by resetting it).
    public async Task<bool> CreateVaultConfig(string username, string json)
    {
        var path = VaultConfigPath(username);
        if (File.Exists(path)) return false;
        Directory.CreateDirectory(UserDir(username));
        var tmp = path + ".tmp";
        await File.WriteAllTextAsync(tmp, json);
        File.Move(tmp, path);
        return true;
    }

    public void DeleteVaultConfig(string username) => File.Delete(VaultConfigPath(username));

    // ---- one-time import of the previous layout (<kind>/<id>.dat + <id>.meta, no folders) ----

    private record LegacyMeta(string Id, string? Name, long Size, string? Mime, long CreatedAt, bool IsSaved, string? Secret);

    public async Task ImportLegacyFiles(AppDb db, string metaExt, ILogger logger)
    {
        var jsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
        foreach (var userDir in Directory.EnumerateDirectories(_root))
        {
            var username = Path.GetFileName(userDir);
            if (!UserManager.IsValidUsername(username)) continue;
            var user = await db.Users.FirstOrDefaultAsync(u => u.Username == username);
            if (user == null) continue;

            foreach (var kind in new[] { "files", "photos", "vault" })
            {
                var dir = Path.Combine(userDir, kind);
                if (!Directory.Exists(dir)) continue;
                var space = kind == "vault" ? DriveSpaces.Vault : DriveSpaces.Files;
                int imported = 0;

                foreach (var metaPath in Directory.EnumerateFiles(dir, "*" + metaExt).ToList())
                {
                    LegacyMeta? meta;
                    try { meta = JsonSerializer.Deserialize<LegacyMeta>(await File.ReadAllTextAsync(metaPath), jsonOptions); }
                    catch (JsonException) { continue; }
                    if (meta == null || !IsValidId(meta.Id)) continue;

                    var oldBlob = Path.Combine(dir, meta.Id + _fileExt);
                    if (!File.Exists(oldBlob) || await db.DriveItems.AnyAsync(i => i.Id == meta.Id))
                    {
                        File.Delete(metaPath);
                        continue;
                    }

                    var name = meta.Name ?? "";
                    if (space == DriveSpaces.Files)
                    {
                        var siblings = await db.DriveItems
                            .Where(i => i.UserId == user.Id && i.Space == space && i.ParentId == null && i.TrashedAt == null)
                            .Select(i => i.Name).ToListAsync();
                        name = DriveService.UniqueName(siblings, DriveService.IsValidName(name) ? name.Trim() : "file");
                    }

                    var newBlob = PrepareBlobPath(username, space, meta.Id);
                    if (oldBlob != newBlob) File.Move(oldBlob, newBlob);
                    db.DriveItems.Add(new DriveItem
                    {
                        Id = meta.Id,
                        UserId = user.Id,
                        Space = space,
                        Name = name,
                        Size = meta.Size,
                        Mime = string.IsNullOrWhiteSpace(meta.Mime) ? "application/octet-stream" : meta.Mime,
                        CreatedAt = meta.CreatedAt,
                        ModifiedAt = meta.CreatedAt,
                        IsSaved = meta.IsSaved && space == DriveSpaces.Files,
                        Secret = meta.Secret,
                    });
                    await db.SaveChangesAsync();
                    File.Delete(metaPath);
                    imported++;
                }

                if (imported > 0) logger.LogInformation("Imported {Count} {Kind} for {User} into folders", imported, kind, username);
                if (kind == "photos" && !Directory.EnumerateFileSystemEntries(dir).Any()) Directory.Delete(dir);
            }
        }
    }
}
