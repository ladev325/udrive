using System.Security.Claims;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

public record SignupRequest(string Name, string Email, string Password);
public record LoginRequest(string Email, string Password);

class UserEndpoints
{
    private readonly UserManager _userManager;
    public UserEndpoints(UserManager userManager)
    {
        _userManager = userManager;
    }

    public async Task<IResult> HandleSignup([FromForm] SignupRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Name) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return Results.BadRequest("Expected full form data");
        }

        try
        {
            await _userManager.CreateUser(request.Name, request.Email, request.Password);
            return Results.Ok("User created successfully");
        }
        catch (Exception ex)
        {
            return Results.BadRequest(ex.Message);
        }
    }

    public async Task<IResult> HandleLogin(HttpContext context, [FromForm] LoginRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Email) ||
            string.IsNullOrWhiteSpace(request.Password))
        {
            return Results.BadRequest("Expected full form data");
        }

        try
        {
            var user = await _userManager.ValidateUser(request.Email, request.Password);
            if (user == null)
                return Results.Unauthorized();


            var claims = new List<Claim>
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Name, user.Name),
                new Claim(ClaimTypes.Email, user.Email)
            };

            var claimsIdentity = new ClaimsIdentity(claims, CookieAuthenticationDefaults.AuthenticationScheme);

            await context.SignInAsync(
                CookieAuthenticationDefaults.AuthenticationScheme,
                new ClaimsPrincipal(claimsIdentity));

            return Results.Ok(new { user.Id, user.Name, user.Email });
        }
        catch (Exception ex)
        {
            return Results.BadRequest(ex.Message);
        }
    }
}