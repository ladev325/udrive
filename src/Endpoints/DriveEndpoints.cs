using System.Security.Claims;
using Microsoft.AspNetCore.Http.Features;

public record NameRequest(string? Name, string? ParentId);
public record MoveRequest(string? ParentId);
public record SavedRequest(bool IsSaved);
public record UploadCheckRequest(long[]? Sizes);

static class DriveEndpoints
{
    public static void MapDriveEndpoints(this IEndpointRouteBuilder app)
    {
        var api = app.MapGroup("/api").RequireAuthorization().AddEndpointFilter(HandleDriveErrors);

        api.MapGet("/storage", (ClaimsPrincipal user, DriveService drive) =>
            drive.StorageSummary(UserId(user)));

        api.MapPost("/drive/upload-check", async (UploadCheckRequest req, ClaimsPrincipal user, DriveService drive) =>
        {
            await drive.CheckUpload(UserId(user), req.Sizes ?? []);
            return Results.NoContent();
        });

        var d = api.MapGroup("/drive");

        // Contents of a folder (no id = root), with the path for breadcrumbs.
        d.MapGet("/folder", async (string? id, ClaimsPrincipal user, DriveService drive) =>
        {
            var (folder, path, items) = await drive.ListFolder(UserId(user), id);
            return Results.Ok(new
            {
                folder = folder == null ? null : ToDto(folder),
                path = path.Select(p => new { p.Id, p.Name }),
                items = items.Select(i => ToDto(i)),
            });
        });

        d.MapGet("/folders", async (ClaimsPrincipal user, DriveService drive) =>
            (await drive.AllFolders(UserId(user))).Select(f => new { f.Id, f.Name, f.ParentId }));

        d.MapGet("/photos", async (ClaimsPrincipal user, DriveService drive) =>
            (await drive.Photos(UserId(user))).Select(i => ToDto(i)));

        d.MapGet("/saved", async (ClaimsPrincipal user, DriveService drive) =>
            (await drive.Saved(UserId(user))).Select(i => ToDto(i)));

        d.MapPost("/folders", async (NameRequest req, ClaimsPrincipal user, DriveService drive) =>
            ToDto(await drive.CreateFolder(UserId(user), req.ParentId, req.Name)));

        // Raw upload: the body is the file itself; ?parentId=&name= say where it goes.
        d.MapPost("/upload", async (string? parentId, string? name, HttpRequest request, ClaimsPrincipal user, DriveService drive) =>
            ToDto(await drive.Upload(UserId(user), Username(user), DriveSpaces.Files, parentId, name,
                request.ContentType, request.ContentLength, request.Body, null, request.HttpContext.RequestAborted)));

        d.MapPost("/items/{id}/rename", async (string id, NameRequest req, ClaimsPrincipal user, DriveService drive) =>
            ToDto(await drive.Rename(UserId(user), id, req.Name)));

        d.MapPost("/items/{id}/move", async (string id, MoveRequest req, ClaimsPrincipal user, DriveService drive) =>
            ToDto(await drive.Move(UserId(user), id, req.ParentId)));

        d.MapPost("/items/{id}/saved", async (string id, SavedRequest req, ClaimsPrincipal user, DriveService drive) =>
            ToDto(await drive.SetSaved(UserId(user), id, req.IsSaved)));

        // Delete = move to the trash.
        d.MapDelete("/items/{id}", async (string id, ClaimsPrincipal user, DriveService drive) =>
        {
            await drive.MoveToTrash(UserId(user), id);
            return Results.NoContent();
        });

        d.MapGet("/items/{id}/content", async (string id, bool? download, HttpContext ctx, DriveService drive, BlobStore blobs) =>
        {
            var item = await drive.GetFile(UserId(ctx.User), id);
            ProtectDownload(ctx);
            var path = blobs.BlobPath(Username(ctx.User), item.Space, item.Id);
            return download != true && DriveService.IsImage(item) && item.Mime.StartsWith("image/", StringComparison.OrdinalIgnoreCase)
                ? Results.File(path, item.Mime, enableRangeProcessing: true)
                : Results.File(path, "application/octet-stream", item.Name, enableRangeProcessing: true);
        });

        d.MapGet("/items/{id}/zip", async (string id, HttpContext ctx, DriveService drive) =>
        {
            var folder = await drive.GetFolder(UserId(ctx.User), id);
            ProtectDownload(ctx);
            ctx.Response.ContentType = "application/zip";
            ctx.Response.Headers.ContentDisposition = new System.Net.Mime.ContentDisposition
            {
                FileName = folder.Name + ".zip", DispositionType = "attachment",
            }.ToString();
            // ZipArchive writes its index synchronously when it is closed.
            var bodyControl = ctx.Features.Get<IHttpBodyControlFeature>();
            if (bodyControl != null) bodyControl.AllowSynchronousIO = true;
            await drive.WriteZip(UserId(ctx.User), Username(ctx.User), folder, ctx.Response.Body, ctx.RequestAborted);
            return Results.Empty;
        });

        // ---- trash ----
        d.MapGet("/trash", async (ClaimsPrincipal user, DriveService drive) =>
            (await drive.Trash(UserId(user))).Select(t => ToDto(t.Item, t.TotalSize, drive.TrashExpiresAt(t.Item))));

        d.MapPost("/trash/{id}/restore", async (string id, ClaimsPrincipal user, DriveService drive) =>
            ToDto(await drive.Restore(UserId(user), id)));

        d.MapDelete("/trash/{id}", async (string id, ClaimsPrincipal user, DriveService drive) =>
        {
            await drive.DeleteForever(UserId(user), Username(user), id);
            return Results.NoContent();
        });

        d.MapDelete("/trash", async (ClaimsPrincipal user, DriveService drive) =>
        {
            await drive.EmptyTrash(UserId(user), Username(user));
            return Results.NoContent();
        });
    }

    public static object ToDto(DriveItem item, long? size = null, long? expiresAt = null) => new
    {
        item.Id,
        item.Name,
        item.IsFolder,
        Size = size ?? item.Size,
        item.Mime,
        item.ParentId,
        item.CreatedAt,
        item.ModifiedAt,
        item.IsSaved,
        IsImage = DriveService.IsImage(item),
        item.TrashedAt,
        ExpiresAt = expiresAt,
    };

    // Never let an uploaded file run as a page on this origin (e.g. HTML or SVG with scripts).
    public static void ProtectDownload(HttpContext ctx)
    {
        ctx.Response.Headers.XContentTypeOptions = "nosniff";
        ctx.Response.Headers.ContentSecurityPolicy = "sandbox; default-src 'none'; img-src 'self'; style-src 'unsafe-inline'";
    }

    public static int UserId(ClaimsPrincipal user) =>
        int.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id)
            ? id : throw new DriveException("UNAUTHORIZED", 401);

    public static string Username(ClaimsPrincipal user)
    {
        var name = user.FindFirstValue(ClaimTypes.Name);
        return UserManager.IsValidUsername(name) ? name! : throw new DriveException("UNAUTHORIZED", 401);
    }

    // Turns DriveException into {"error": CODE} responses.
    public static async ValueTask<object?> HandleDriveErrors(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        try
        {
            return await next(ctx);
        }
        catch (DriveException ex)
        {
            return AuthEndpoints.Error(ex.Code, ex.Status);
        }
    }
}
