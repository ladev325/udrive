using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

class User
{
    [Key]
    [DatabaseGenerated(DatabaseGeneratedOption.Identity)]
    public int Id { get; set; }
    [Required, MaxLength(100)]
    public string? Name { get; set; }
    [Required, MaxLength(256)]
    public string? Email { get; set; }
    [Required]
    public string? PasswordHash { get; set; }
}