using System;
using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class SecurityTests
{
    private static (DetectorSettings settings, EqProfile eq) CreateValidConfig()
    {
        var settings = new DetectorSettings(
            Version: 1,
            Audio: new AudioSettings(FrameSize: 1024, HopSize: 512, MinFrequencyHz: 50, MaxFrequencyHz: 8000),
            Detection: new DetectionSettings(
                LocalNeighborhoodBins: 12,
                MinProminenceDb: 6.0,
                MinEstimatedQ: 4.0,
                MaxEstimatedQ: 150.0,
                MaxFrequencyDriftHz: 10.0,
                MinPersistenceFrames: 6,
                ConfidenceWeights: new ConfidenceWeights(0.35, 0.35, 0.20, 0.10)
            ),
            FreezePolicy: new FreezePolicy(false, 0.8, 8, false),
            Ui: new UiSettings(15)
        );

        var eq = new EqProfile(
            1, "Test", "Profile",
            new BellProfile(true, new FrequencyControl(20, 20000, true), new RangeDouble(-12, 12), new QControl(true, 1, 10, 0.1)),
            new ShelfProfile(true, new FrequencyControl(20, 200, true), new RangeDouble(-12, 12)),
            new ShelfProfile(true, new FrequencyControl(2000, 20000, true), new RangeDouble(-12, 12)),
            new LowCutProfile(true, "fixed", new FrequencyControl(20, 200, true), new[] { 20.0 }),
            new BellBandsUi(1, 10),
            new SuggestedDefaults(5, Array.Empty<ProminenceToCutMapping>(), -3.0)
        );

        return (settings, eq);
    }

    [Fact]
    public void Constructor_WithZeroHopSize_ThrowsArgumentException()
    {
        var (validSettings, eq) = CreateValidConfig();
        var invalidSettings = validSettings with { Audio = validSettings.Audio with { HopSize = 0 } };

        Assert.Throws<ArgumentException>(() => new FeedbackAnalyzer(invalidSettings, eq, new MathNetFft()));
    }

    [Fact]
    public void UpdateSettings_WithZeroHopSize_ThrowsArgumentException()
    {
        var (settings, eq) = CreateValidConfig();
        var analyzer = new FeedbackAnalyzer(settings, eq, new MathNetFft());

        var invalidSettings = settings with { Audio = settings.Audio with { HopSize = 0 } };

        Assert.Throws<ArgumentException>(() => analyzer.UpdateSettings(invalidSettings));
    }

    [Fact]
    public void Constructor_WithNegativeHopSize_ThrowsArgumentException()
    {
        var (validSettings, eq) = CreateValidConfig();
        var invalidSettings = validSettings with { Audio = validSettings.Audio with { HopSize = -100 } };

        Assert.Throws<ArgumentException>(() => new FeedbackAnalyzer(invalidSettings, eq, new MathNetFft()));
    }
}
