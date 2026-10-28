using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

class UserManager
{
    private readonly AppDb _appDb;
    private readonly IPasswordHasher<User> _hasher;
    public UserManager(AppDb appDb, IPasswordHasher<User> hasher)
    {
        _appDb = appDb;
        _hasher = hasher;
    }

    public async Task<User> CreateUser(string name, string email, string password)
    {
        string emailTrimmed = email?.Trim() ?? string.Empty;
        string nameTrimmed = name?.Trim() ?? string.Empty;

        // Validate email
        if (string.IsNullOrWhiteSpace(emailTrimmed))
        {
            throw new Exception("Email cannot be empty");
        }

        string emailPattern = @"^[^@\s]+@[^@\s]+\.[^@\s]+$";
        if (!Regex.IsMatch(emailTrimmed, emailPattern, RegexOptions.IgnoreCase))
        {
            throw new Exception("Invalid email format");
        }

        // Validate name
        if (string.IsNullOrWhiteSpace(nameTrimmed))
        {
            throw new Exception("Name cannot be empty");
        }

        string namePattern = @"^[a-zA-Z0-9_-]+$";
        if (!Regex.IsMatch(nameTrimmed, namePattern))
        {
            throw new Exception("Name can only contain letters, numbers, '-' and '_'");
        }

        // Db checks
        if (await _appDb.Users.AnyAsync(u => u.Email == emailTrimmed))
        {
            throw new Exception("Email already exists");
        }

        if (await _appDb.Users.AnyAsync(u => u.Name == nameTrimmed))
        {
            throw new Exception("Name already exists");
        }

        var user = new User
        {
            Name = nameTrimmed,
            Email = emailTrimmed
        };
        user.PasswordHash = _hasher.HashPassword(user, password);

        _appDb.Users.Add(user);
        await _appDb.SaveChangesAsync();

        return user;
    }

    public async Task<User> ValidateUser(string email, string password)
    {
        string emailTrimmed = email?.Trim() ?? string.Empty;
        var user = await _appDb.Users.FirstOrDefaultAsync(u => u.Email == emailTrimmed);
        if (user == null) return null;
        var result = _hasher.VerifyHashedPassword(user, user.PasswordHash, password);
        if (result == PasswordVerificationResult.Failed) return null;
        return user;
    }
}