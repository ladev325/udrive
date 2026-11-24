using System.ComponentModel.DataAnnotations;

// A file or folder in a user's drive. Only metadata lives in SQLite; file contents are blobs on disk
// (DATABASE_FILES_DIR/<username>/<space>/<id><ext>).
class DriveItem
{
    [Key, MaxLength(32)]
    public string Id { get; set; } = "";

    public int UserId { get; set; }

    // "files" = the normal drive (folders, files, photos), "vault" = files encrypted in the browser.
    [Required, MaxLength(8)]
    public string Space { get; set; } = DriveSpaces.Files;

    // null = in the root folder.
    [MaxLength(32)]
    public string? ParentId { get; set; }

    public bool IsFolder { get; set; }

    // Empty for vault files: their real name is inside Secret.
    [Required, MaxLength(255)]
    public string Name { get; set; } = "";

    public long Size { get; set; }

    [Required, MaxLength(255)]
    public string Mime { get; set; } = "application/octet-stream";

    // Unix milliseconds (what the frontend uses).
    public long CreatedAt { get; set; }
    public long ModifiedAt { get; set; }

    // In the user's favorites ("Saved" tab). Files only.
    public bool IsSaved { get; set; }

    // Set on everything that is in the trash. IsTrashRoot marks the item the user actually deleted;
    // its descendants share the trash state and come back with it on restore.
    public long? TrashedAt { get; set; }
    public bool IsTrashRoot { get; set; }

    // Vault only: encrypted { name, mime, size } made by the browser.
    public string? Secret { get; set; }
}

static class DriveSpaces
{
    public const string Files = "files";
    public const string Vault = "vault";
}
