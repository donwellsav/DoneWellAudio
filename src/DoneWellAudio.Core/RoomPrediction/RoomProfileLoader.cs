using System;
using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace DoneWellAudio.Core.RoomPrediction;

/// <summary>
/// Handles loading and saving of RoomProfile configurations.
/// </summary>
public static class RoomProfileLoader
{
    private static readonly JsonSerializerOptions _options = new()
    {
        WriteIndented = true,
        PropertyNameCaseInsensitive = true,
        AllowTrailingCommas = true,
        ReadCommentHandling = JsonCommentHandling.Skip,
        Converters = { new JsonStringEnumConverter() }
    };

    /// <summary>
    /// Loads a RoomProfile from the specified file path.
    /// Returns null if the file does not exist.
    /// </summary>
    public static RoomProfile? Load(string filepath)
    {
        if (!File.Exists(filepath))
        {
            return null;
        }

        try
        {
            var json = File.ReadAllText(filepath);
            return JsonSerializer.Deserialize<RoomProfile>(json, _options);
        }
        catch (Exception ex)
        {
            // Log or rethrow? For now, rethrow with context or return null + error?
            // The prompt says "Config-driven behavior; no silent guessing." and "Load status (profile found/missing)".
            // Let's rethrow wrapped in a clear exception so the caller knows WHY it failed (e.g., malformed JSON).
            throw new InvalidOperationException($"Failed to load RoomProfile from '{filepath}': {ex.Message}", ex);
        }
    }

    /// <summary>
    /// Saves a RoomProfile to the specified file path.
    /// </summary>
    public static void Save(string filepath, RoomProfile profile)
    {
        var json = JsonSerializer.Serialize(profile, _options);
        File.WriteAllText(filepath, json);
    }
}
