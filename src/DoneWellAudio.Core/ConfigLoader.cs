using System.Text.Json;

namespace DoneWellAudio.Core;

public static class ConfigLoader
{
    private static readonly JsonSerializerOptions Options = new()
    {
        PropertyNameCaseInsensitive = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        AllowTrailingCommas = true
    };

    public static EqProfile LoadEqProfile(string configDir)
    {
        var path = Path.Combine(configDir, "eq_profile.json");
        var fallback = Path.Combine(configDir, "eq_profile.example.json");
        return Load<EqProfile>(File.Exists(path) ? path : fallback);
    }

    public static DetectorSettings LoadDetectorSettings(string configDir)
    {
        var path = Path.Combine(configDir, "detector_settings.json");
        var fallback = Path.Combine(configDir, "detector_settings.example.json");
        return Load<DetectorSettings>(File.Exists(path) ? path : fallback);
    }

    private static T Load<T>(string path)
    {
        var json = File.ReadAllText(path);
        var obj = JsonSerializer.Deserialize<T>(json, Options);
        if (obj is null) throw new InvalidOperationException($"Failed to load config: {path}");
        return obj;
    }
}
