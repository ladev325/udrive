using Microsoft.EntityFrameworkCore;

class AppDb : DbContext
{
    public AppDb(DbContextOptions<AppDb> options) : base(options) { }
    public DbSet<User> Users { get; set; }
    public DbSet<DriveItem> DriveItems { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);
        modelBuilder.Entity<User>().HasIndex(u => u.Email).IsUnique();
        modelBuilder.Entity<User>().HasIndex(u => u.Username).IsUnique();
        modelBuilder.Entity<DriveItem>().HasIndex(i => new { i.UserId, i.Space, i.ParentId });
        modelBuilder.Entity<DriveItem>().HasIndex(i => new { i.UserId, i.TrashedAt });
    }

    // Creates tables and indexes that don't exist yet, so a database made by an older version
    // gets the new tables without losing data. (Existing tables are not altered.)
    public void CreateMissingTables()
    {
        var script = Database.GenerateCreateScript()
            .Replace("CREATE TABLE ", "CREATE TABLE IF NOT EXISTS ")
            .Replace("CREATE UNIQUE INDEX ", "CREATE UNIQUE INDEX IF NOT EXISTS ")
            .Replace("CREATE INDEX ", "CREATE INDEX IF NOT EXISTS ");
        Database.ExecuteSqlRaw(script);
    }
}
