using Microsoft.AspNetCore.Http.Features;

// setup app
var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(o => o.Limits.MaxRequestBodySize = 500_000_000); // max 500 MB per request
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = 500_000_000);

var app = builder.Build();
app.UseDefaultFiles(); // serves wwwroot/index.html at "/"
app.UseStaticFiles();


// setup env
DotNetEnv.Env.Load();
string fileExt = Environment.GetEnvironmentVariable("DATABASE_FILE_EXT") ??
                 throw new InvalidOperationException("DATABASE_FILE_EXT is missing");
string metaExt = Environment.GetEnvironmentVariable("DATABASE_META_EXT") ??
                 throw new InvalidOperationException("DATABASE_META_EXT is missing");
string rootPath = Environment.GetEnvironmentVariable("ROOT_PATH") ??
                       throw new InvalidOperationException("ROOT_PATH is missing");


// file manager
var rootDir = Path.Combine(app.Environment.ContentRootPath, rootPath);
var fileManager = new FileManager(rootDir, "." + fileExt, "." + metaExt);

app.MapPost("/upload", fileManager.HandleUpload);
app.MapGet("/download", fileManager.HandleDownload);
app.MapGet("/list", fileManager.HandleList);
app.Run("http://127.0.0.1:5000");