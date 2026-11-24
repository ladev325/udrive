using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

// Error codes are sent to the frontend as-is and translated there.
class AuthException : Exception
{
    public string Code { get; }
    public AuthException(string code) : base(code) { Code = code; }
}

partial class UserManager
{
    public const int MinPasswordLength = 8;
    public const int MaxPasswordLength = 256;

    [GeneratedRegex(@"^[a-zA-Z0-9_-]{3,32}$")]
    private static partial Regex UsernameRegex();

    [GeneratedRegex(@"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")]
    private static partial Regex EmailRegex();

    private readonly AppDb _appDb;
    private readonly IPasswordHasher<User> _hasher;
    public UserManager(AppDb appDb, IPasswordHasher<User> hasher)
    {
        _appDb = appDb;
        _hasher = hasher;
    }

    public static string NormalizeEmail(string? email) => (email ?? "").Trim().ToLowerInvariant();

    public static bool IsValidUsername(string? username) => username != null && UsernameRegex().IsMatch(username);

    public async Task<User> CreateUser(string? username, string? email, string? password)
    {
        string cleanUsername = (username ?? "").Trim();
        string cleanEmail = NormalizeEmail(email);
        password ??= "";

        if (!IsValidUsername(cleanUsername)) throw new AuthException("INVALID_USERNAME");
        if (cleanEmail.Length > 256 || !EmailRegex().IsMatch(cleanEmail)) throw new AuthException("INVALID_EMAIL");
        if (password.Length < MinPasswordLength) throw new AuthException("PASSWORD_SHORT");
        if (password.Length > MaxPasswordLength) throw new AuthException("PASSWORD_LONG");

        // Usernames are folder names: treat "Bob" and "bob" as the same to avoid confusing look-alikes.
        string lowerUsername = cleanUsername.ToLowerInvariant();
        if (await _appDb.Users.AnyAsync(u => u.Username.ToLower() == lowerUsername))
            throw new AuthException("USERNAME_TAKEN");
        if (await _appDb.Users.AnyAsync(u => u.Email == cleanEmail))
            throw new AuthException("EMAIL_TAKEN");

        var user = new User { Username = cleanUsername, Email = cleanEmail, CreatedAt = DateTime.UtcNow };
        user.PasswordHash = _hasher.HashPassword(user, password);

        _appDb.Users.Add(user);
        try
        {
            await _appDb.SaveChangesAsync();
        }
        catch (DbUpdateException)
        {
            // Lost a race against a concurrent signup with the same email/username.
            throw new AuthException("EMAIL_TAKEN");
        }
        return user;
    }

    public async Task<User?> ValidateUser(string? email, string? password)
    {
        string cleanEmail = NormalizeEmail(email);
        password ??= "";
        var user = await _appDb.Users.FirstOrDefaultAsync(u => u.Email == cleanEmail);
        if (user == null || password.Length > MaxPasswordLength)
            return null;

        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, password);
        if (result == PasswordVerificationResult.Failed) return null;
        if (result == PasswordVerificationResult.SuccessRehashNeeded)
        {
            user.PasswordHash = _hasher.HashPassword(user, password);
            await _appDb.SaveChangesAsync();
        }
        return user;
    }

    public Task<User?> FindById(int id) => _appDb.Users.FirstOrDefaultAsync(u => u.Id == id);
}
