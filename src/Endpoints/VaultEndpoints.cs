using System.Security.Claims;
using System.Text.Json;
using static DriveEndpoints;

// Vault files arrive already encrypted by the browser; the server only stores the bytes.
static class VaultEndpoints
{
    public static void MapVaultEndpoints(this IEndpointRouteBuilder app)
    {
        var v = app.MapGroup("/api/vault").RequireAuthorization().AddEndpointFilter(HandleDriveErrors);

        v.MapGet("/config", async (ClaimsPrincipal user, BlobStore blobs) =>
        {
            var config = await blobs.GetVaultConfig(Username(user));
            return config == null ? AuthEndpoints.Error("NO_VAULT", 404) : Results.Text(config, "application/json");
        });

        v.MapPut("/config", async (HttpRequest request, ClaimsPrincipal user, BlobStore blobs) =>
        {
            if (request.ContentLength is null or > BlobStore.MaxVaultConfigLength)
                return AuthEndpoints.Error("INVALID_CONFIG", 400);
            using var reader = new StreamReader(request.Body);
            var body = await reader.ReadToEndAsync();
            if (!IsJsonObject(body)) return AuthEndpoints.Error("INVALID_CONFIG", 400);
            return await blobs.CreateVaultConfig(Username(user), body)
                ? Results.NoContent()
                : AuthEndpoints.Error("VAULT_EXISTS", 409);
        });

        // Forgotten password: the encrypted files can't be recovered, so they go with the config.
        v.MapDelete("/config", async (ClaimsPrincipal user, DriveService drive) =>
        {
            await drive.ResetVault(UserId(user), Username(user));
            return Results.NoContent();
        });

        v.MapGet("/", async (ClaimsPrincipal user, DriveService drive) =>
            (await drive.VaultFiles(UserId(user))).Select(i => new { i.Id, i.Size, i.CreatedAt, i.Secret }));

        // Raw upload of the encrypted blob; the encrypted name/type comes in the X-Vault-Secret header.
        v.MapPost("/", async (HttpRequest request, ClaimsPrincipal user, DriveService drive, BlobStore blobs) =>
        {
            if (await blobs.GetVaultConfig(Username(user)) == null) return AuthEndpoints.Error("NO_VAULT", 409);
            var item = await drive.Upload(UserId(user), Username(user), DriveSpaces.Vault, null, null, null,
                request.ContentLength, request.Body, request.Headers["X-Vault-Secret"].ToString(), request.HttpContext.RequestAborted);
            return Results.Ok(new { item.Id, item.Size, item.CreatedAt, item.Secret });
        });

        v.MapGet("/{id}/content", async (string id, HttpContext ctx, DriveService drive, BlobStore blobs) =>
        {
            var item = await drive.GetVaultFile(UserId(ctx.User), id);
            ProtectDownload(ctx);
            return Results.File(blobs.BlobPath(Username(ctx.User), DriveSpaces.Vault, item.Id), "application/octet-stream");
        });

        v.MapDelete("/{id}", async (string id, ClaimsPrincipal user, DriveService drive) =>
        {
            await drive.DeleteVaultFile(UserId(user), Username(user), id);
            return Results.NoContent();
        });
    }

    private static bool IsJsonObject(string text)
    {
        try
        {
            using var doc = JsonDocument.Parse(text);
            return doc.RootElement.ValueKind == JsonValueKind.Object;
        }
        catch (JsonException)
        {
            return false;
        }
    }
}
