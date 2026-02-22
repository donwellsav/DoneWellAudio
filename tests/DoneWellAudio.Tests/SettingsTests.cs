using System.Text.Json;
using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class SettingsTests
{
    [Fact]
    public void LoadSettings_MissingFieldsUseDefaults()
    {
        // Old JSON format (without new fields)
        string oldJson = """
        {
          "version": 1,
          "audio": {
            "frameSize": 4096,
            "hopSize": 1024,
            "minFrequencyHz": 50,
            "maxFrequencyHz": 12000
          },
          "detection": {
            "localNeighborhoodBins": 12,
            "minProminenceDb": 6.0,
            "minEstimatedQ": 4.0,
            "maxEstimatedQ": 150.0,
            "maxFrequencyDriftHz": 8.0,
            "minPersistenceFrames": 10,
            "confidenceWeights": {
              "prominence": 0.35,
              "narrowness": 0.35,
              "persistence": 0.2,
              "stability": 0.1
            }
          },
          "freezePolicy": {
            "enabled": true,
            "confidenceThreshold": 0.72,
            "consecutiveFramesAboveThreshold": 12,
            "stopCaptureOnFreeze": false
          },
          "ui": {
            "updateHz": 15
          }
        }
        """;

        var options = new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
            ReadCommentHandling = JsonCommentHandling.Skip,
            AllowTrailingCommas = true
        };

        var settings = JsonSerializer.Deserialize<DetectorSettings>(oldJson, options);

        Assert.NotNull(settings);
        // Assert defaults
        Assert.False(settings.ContinuousMode);
        Assert.Equal(SensitivityLevel.Medium, settings.Sensitivity);
        Assert.Equal(ResponseSpeed.Medium, settings.ResponseSpeed);
        Assert.True(settings.SpectralWhitening);
    }
}
