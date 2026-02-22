using System.IO;
using System.Text.Json;
using DoneWellAudio.Core;

namespace DoneWellAudio.Gui.Wpf;

public class UserSettings
{
    public double FontSize { get; set; } = 18.0;

    // Detector Overrides
    public bool ContinuousMode { get; set; } = false;
    public SensitivityLevel Sensitivity { get; set; } = SensitivityLevel.Medium;
    public ResponseSpeed ResponseSpeed { get; set; } = ResponseSpeed.Medium;

    private static string GetPath()
    {
        var configDir = AppPaths.FindConfigDirectory();
        return Path.Combine(configDir, "user_settings.json");
    }

    public static UserSettings Load()
    {
        try
        {
            var path = GetPath();
            if (File.Exists(path))
            {
                var json = File.ReadAllText(path);
                var settings = JsonSerializer.Deserialize<UserSettings>(json);
                if (settings != null) return settings;
            }
        }
        catch
        {
            // Ignore errors, return default
        }
        return new UserSettings();
    }

    public void Save()
    {
        try
        {
            var path = GetPath();
            var json = JsonSerializer.Serialize(this, new JsonSerializerOptions { WriteIndented = true });
            File.WriteAllText(path, json);
        }
        catch
        {
            // Ignore errors
        }
    }
}
