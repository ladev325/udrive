using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;

public record SignupRequest(string? Username, string? Email, string? Password);
public record LoginRequest(string? Email, string? Password);

static class AuthEndpoints
{
    public static void MapAuthEndpoints(this IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/auth");

        group.MapPost("/signup", async (HttpContext ctx, SignupRequest req, UserManager users) =>
        {
            try
            {
                var user = await users.CreateUser(req.Username, req.Email, req.Password);
                await SignIn(ctx, user);
                return Results.Ok(ToPublicUser(user));
            }
            catch (AuthException ex)
            {
                return Error(ex.Code, ex.Code is "USERNAME_TAKEN" or "EMAIL_TAKEN" ? 409 : 400);
            }
        }).RequireRateLimiting("auth");

        group.MapPost("/login", async (HttpContext ctx, LoginRequest req, UserManager users) =>
        {
            if (string.IsNullOrWhiteSpace(req.Email) || string.IsNullOrEmpty(req.Password))
                return Error("MISSING_FIELDS", 400);

            var user = await users.ValidateUser(req.Email, req.Password);
            if (user == null) return Error("INVALID_CREDENTIALS", 401);

            await SignIn(ctx, user);
            return Results.Ok(ToPublicUser(user));
        }).RequireRateLimiting("auth");

        group.MapPost("/logout", async (HttpContext ctx) =>
        {
            await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
            return Results.NoContent();
        });

        group.MapGet("/me", async (HttpContext ctx, UserManager users) =>
        {
            // Looks the user up again so a deleted account can't keep using an old cookie.
            if (!int.TryParse(ctx.User.FindFirstValue(ClaimTypes.NameIdentifier), out int id))
                return Error("UNAUTHORIZED", 401);
            var user = await users.FindById(id);
            if (user == null)
            {
                await ctx.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
                return Error("UNAUTHORIZED", 401);
            }
            return Results.Ok(ToPublicUser(user));
        }).RequireAuthorization();
    }

    public static IResult Error(string code, int status) =>
        Results.Json(new { error = code }, statusCode: status);

    private static object ToPublicUser(User user) => new
    {
        id = user.Id,
        username = user.Username,
        email = user.Email,
        createdAt = new DateTimeOffset(DateTime.SpecifyKind(user.CreatedAt, DateTimeKind.Utc)).ToUnixTimeMilliseconds(),
    };

    private static async Task SignIn(HttpContext ctx, User user)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Name, user.Username),
            new(ClaimTypes.Email, user.Email),
        };
        var identity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);
        await ctx.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, new ClaimsPrincipal(identity),
            new AuthenticationProperties { IsPersistent = true });
    }
}
