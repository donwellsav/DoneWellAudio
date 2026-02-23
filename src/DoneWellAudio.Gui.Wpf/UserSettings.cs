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

    // Moved from MainWindow
    public int BellBands { get; set; } = 3;
    public bool FilterHarmonics { get; set; } = true;

    // Room Prediction
    public bool UseImperialUnits { get; set; } = true;
    public bool UseRoomPrior { get; set; } = false;

    // Advanced Settings
    public bool SpectralWhitening { get; set; } = true;
    public double MinProminenceDb { get; set; } = 6.0;
    public double ConfidenceThreshold { get; set; } = 0.72;
    public double MaxFrequencyDriftHz { get; set; } = 8.0;

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
