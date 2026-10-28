using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
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



// services
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 500_000_000); // max 500 MB per request
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 500_000_000);

builder.Services.AddDbContext<AppDb>(o => o.UseSqlite("Data Source=" + databaseSqliteFile));
builder.Services.AddSingleton<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<UserManager>();
builder.Services.AddScoped<UserEndpoints>();

builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(o =>
    {
        o.Cookie.HttpOnly = true;
        o.Cookie.SecurePolicy = CookieSecurePolicy.SameAsRequest;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.ExpireTimeSpan = TimeSpan.FromDays(tokenExpirationDays);
        o.SlidingExpiration = true;
        o.Events.OnRedirectToLogin = c => { c.Response.StatusCode = 401; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();

var app = builder.Build();
using (var scope = app.Services.CreateScope())
    scope.ServiceProvider.GetRequiredService<AppDb>().Database.EnsureCreated();
app.UseDefaultFiles(); // serves wwwroot/index.html at "/"
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();


var filesPath = Path.Combine(app.Environment.ContentRootPath, databaseFilesDir);
var fileEndpoints = new FileEndpoints(filesPath, "." + fileExt, "." + metaExt);

//app.MapPost("/signup", ([FromForm] SignupRequest req, UserEndpoints endpoints) => endpoints.HandleSignup(req))
   //.DisableAntiforgery();

app.MapPost("/login", (HttpContext ctx, [FromForm] LoginRequest req, UserEndpoints endpoints) => endpoints.HandleLogin(ctx, req))
   .DisableAntiforgery();

app.MapGet("/login", (IWebHostEnvironment env) =>
    Results.File(Path.Combine(env.WebRootPath, "login.html"), "text/html"));

//app.MapGet("/signup", (IWebHostEnvironment env) =>
    //Results.File(Path.Combine(env.WebRootPath, "signup.html"), "text/html"));

app.MapGet("/manager", (IWebHostEnvironment env) => 
    Results.File(Path.Combine(env.ContentRootPath, "Views", "manager.html"), "text/html"))
    .RequireAuthorization();

app.MapPost("/upload", fileEndpoints.HandleUpload).RequireAuthorization();
app.MapGet("/download", fileEndpoints.HandleDownload).RequireAuthorization();
app.MapGet("/list", fileEndpoints.HandleList).RequireAuthorization();
//app.Run("http://127.0.0.1:5000");
app.Run("http://0.0.0.0:5000");