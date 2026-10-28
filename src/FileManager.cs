class FileManager
{
    private readonly string rootDir, fileExt, metaExt;
    public FileManager(string rootDir, string fileExt, string metaExt)
    {
        this.rootDir = rootDir;
        this.fileExt = fileExt;
        this.metaExt = metaExt;
        Directory.CreateDirectory(rootDir);
    }

    bool IsSafePath(string p)
    {
        var root = Path.GetFullPath(rootDir) + Path.DirectorySeparatorChar;
        return Path.GetFullPath(p).StartsWith(root, StringComparison.Ordinal);
    }

    public async Task<IResult> HandleUpload(HttpRequest request)
    {
        if (!request.HasFormContentType)
            return Results.BadRequest("Expected multipart/form-data");
        var body = await request.ReadFormAsync();

        var file = body.Files.FirstOrDefault();
        var path = body["path"].ToString();
        var name = body["name"].ToString();
        if (file == null || string.IsNullOrEmpty(path) || string.IsNullOrEmpty(name))
            return Results.BadRequest("expected full form data");

        var dirPath = Path.Combine(rootDir, path);
        var dataPath = Path.Combine(dirPath, name + fileExt);
        var metaPath = Path.Combine(dirPath, name + metaExt);
        if (!IsSafePath(dataPath) || !IsSafePath(metaPath))
            return Results.BadRequest("unsafe path");

        Directory.CreateDirectory(dirPath);   // only after the check
        await using (var fs = File.Create(dataPath)) await file.CopyToAsync(fs);
        await File.WriteAllTextAsync(metaPath, Path.GetFileName(file.FileName));
        return Results.Redirect("/");
    }

    public IResult HandleDownload(HttpRequest request)
    {
        var path = request.Query["path"].ToString();
        var name = request.Query["name"].ToString();
        if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(name))
            return Results.BadRequest("expected full form data");

        var dirPath = Path.Combine(rootDir, path);
        var dataPath = Path.Combine(dirPath, name + fileExt);
        var metaPath = Path.Combine(dirPath, name + metaExt);
        if (!IsSafePath(dataPath) || !IsSafePath(metaPath))
            return Results.BadRequest("unsafe path");

        if (!File.Exists(dataPath)) return Results.NotFound();
        return Results.File(dataPath, "application/octet-stream", File.ReadAllText(metaPath));
    }

    public IResult HandleList(HttpRequest request)
    {
        var path = request.Query["path"].ToString();
        if (string.IsNullOrEmpty(path))
            return Results.BadRequest("expected path");

        var dirPath = Path.Combine(rootDir, path);
        if (!IsSafePath(dirPath))
            return Results.BadRequest("unsafe path");

        if (!Directory.Exists(dirPath)) return Results.NotFound();

        var list = Directory.GetFiles(dirPath, "*" + metaExt)
            .Select(File.ReadAllText)
            .ToList();
        return Results.Json(list);
    }
}