using Microsoft.AspNetCore.Mvc;
using System.Text.RegularExpressions;

class FileEndpoints
{
    private readonly string _filesPath, _fileExt, _metaExt;
    public FileEndpoints(string filesPath, string fileExt, string metaExt)
    {
        _filesPath = filesPath;
        _fileExt = fileExt;
        _metaExt = metaExt;
        Directory.CreateDirectory(_filesPath);
    }

    private bool IsSafePath(string path)
    {
        return Regex.IsMatch(path, @"^[a-zA-Z0-9_-]+$");
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

        if (!IsSafePath(path) || !IsSafePath(name))
            return Results.BadRequest("unsafe path");

        var dirPath = Path.Combine(_filesPath, path);
        var dataPath = Path.Combine(dirPath, name + _fileExt);
        var metaPath = Path.Combine(dirPath, name + _metaExt);

        Directory.CreateDirectory(dirPath);   // only after the check
        await using (var fs = File.Create(dataPath)) await file.CopyToAsync(fs);
        await File.WriteAllTextAsync(metaPath, Path.GetFileName(file.FileName));
        return Results.Redirect("/");
    }

    public async Task<IResult> HandleDownload(HttpRequest request)
    {
        var path = request.Query["path"].ToString();
        var name = request.Query["name"].ToString();
        if (string.IsNullOrEmpty(path) || string.IsNullOrEmpty(name))
            return Results.BadRequest("expected full form data");

        if (!IsSafePath(path) || !IsSafePath(name))
            return Results.BadRequest("unsafe path");

        var dirPath = Path.Combine(_filesPath, path);
        var dataPath = Path.Combine(dirPath, name + _fileExt);
        var metaPath = Path.Combine(dirPath, name + _metaExt);

        if (!File.Exists(dataPath)) return Results.NotFound();
        return Results.File(dataPath, "application/octet-stream", await File.ReadAllTextAsync(metaPath));
    }

    public async Task<IResult> HandleList(HttpRequest request)
    {
        var path = request.Query["path"].ToString();
        if (string.IsNullOrEmpty(path))
            return Results.BadRequest("expected path");
        if (!IsSafePath(path))
            return Results.BadRequest("unsafe path");

        var dirPath = Path.Combine(_filesPath, path);
        if (!Directory.Exists(dirPath)) return Results.NotFound();

        var list = await Task.WhenAll(
            Directory.GetFiles(dirPath, "*" + _metaExt)
                .Select(async file => await File.ReadAllTextAsync(file)));

        return Results.Json(list);
    }
}