using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

class User
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }

    // Also the name of the user's folder in DATABASE_FILES_DIR, so it never changes after signup.
    [Required, MaxLength(32)]
    public string Username { get; set; } = "";

    [Required, MaxLength(256)]
    public string Email { get; set; } = "";

    [Required]
    public string PasswordHash { get; set; } = "";

    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
