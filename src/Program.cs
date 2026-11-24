using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

// env
DotNetEnv.Env.Load();
string databaseFilesDir = Environment.GetEnvironmentVariable("DATABASE_FILES_DIR") ??
                          throw new InvalidOperationException("DATABASE_FILES_DIR is missing");
string databaseSqliteFile = Environment.GetEnvironmentVariable("DATABASE_SQLITE_FILE") ??
                            throw new InvalidOperationException("DATABASE_SQLITE_FILE is missing");
string fileExt = Environment.GetEnvironmentVariable("DATABASE_FILE_EXT") ??
                 throw new InvalidOperationException("DATABASE_FILE_EXT is missing");
string metaExt = Environment.GetEnvironmentVariable("DATABASE_META_EXT") ??
                 throw new InvalidOperationException("DATABASE_META_EXT is missing");

string tokenExpirationDaysStr = Environment.GetEnvironmentVariable("TOKEN_EXPIRATION_DAYS") ??
                                throw new InvalidOperationException("TOKEN_EXPIRATION_DAYS is missing");
if (!int.TryParse(tokenExpirationDaysStr, out int tokenExpirationDays))
    throw new InvalidOperationException("TOKEN_EXPIRATION_DAYS is not a valid integer");

// optional limits (defaults: 2 GB per user incl. trash and vault, 500 MB per file)
long MegabytesEnv(string name, long fallback) =>
    long.TryParse(Environment.GetEnvironmentVariable(name), out var mb) && mb > 0 ? mb * 1024 * 1024 : fallback * 1024 * 1024;
var limits = new DriveLimits(
    QuotaBytes: MegabytesEnv("USER_QUOTA_MB", 2048),
    MaxFileBytes: MegabytesEnv("MAX_FILE_MB", 500),
    TrashLifetime: TimeSpan.FromDays(30));


// services
var builder = WebApplication.CreateBuilder(args);
// uploads are raw bodies of one file; a little headroom for the vault's encryption overhead
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = limits.MaxFileBytes + 1024 * 1024);

var sqlitePath = Path.Combine(builder.Environment.ContentRootPath, databaseSqliteFile);
Directory.CreateDirectory(Path.GetDirectoryName(sqlitePath)!);
builder.Services.AddDbContext<AppDb>(o => o.UseSqlite("Data Source=" + sqlitePath));
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<UserManager>();

var filesPath = Path.Combine(builder.Environment.ContentRootPath, databaseFilesDir);
builder.Services.AddSingleton(new BlobStore(filesPath, "." + fileExt));
builder.Services.AddSingleton(limits);
builder.Services.AddScoped<DriveService>();
builder.Services.AddHostedService<TrashCleanup>();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.Name = "udrive.session";
        o.Cookie.HttpOnly = true;
        o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.Cookie.SameSite = SameSiteMode.Lax; // blocks cross-site POST/PATCH/DELETE from carrying the cookie
        o.ExpireTimeSpan = TimeSpan.FromDays(tokenExpirationDays);
        o.SlidingExpiration = true;
        o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
        o.Events.OnRedirectToAccessDenied = c => { c.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();

// Brute-force protection for login/signup: 10 attempts per minute per IP.
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = 429;
    o.OnRejected = async (ctx, token) =>
        await ctx.HttpContext.Response.WriteAsJsonAsync(new { error = "TOO_MANY_ATTEMPTS" }, token);
    o.AddPolicy("auth", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = 10, Window = TimeSpan.FromMinutes(1) }));
});

var app = builder.Build();
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDb>();
    db.Database.EnsureCreated();   // new database: creates everything
    db.CreateMissingTables();      // older database: adds tables added since (e.g. DriveItems)
    // files uploaded before folders existed (<id>.meta files) are moved into the root folder
    await scope.ServiceProvider.GetRequiredService<BlobStore>()
        .ImportLegacyFiles(db, "." + metaExt, app.Logger);
}

app.UseDefaultFiles(); // serves wwwroot/index.html (the built frontend) at "/"
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.MapAuthEndpoints();
app.MapDriveEndpoints();
app.MapVaultEndpoints();

// Unknown /api routes are real 404s; everything else is the single-page frontend.
app.Map("/api/{**rest}", () => Results.NotFound());
app.MapFallbackToFile("index.html");

//app.Run("http://127.0.0.1:5000");
app.Run("http://0.0.0.0:5000");
