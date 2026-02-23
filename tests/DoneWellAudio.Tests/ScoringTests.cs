using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class ScoringTests
{
    private static DetectorSettings CreateSettings()
    {
        return new DetectorSettings(
            Version: 1,
            Audio: new AudioSettings(4096, 1024, 50, 8000),
            Detection: new DetectionSettings(
                LocalNeighborhoodBins: 12,
                MinProminenceDb: 6.0,
                MinEstimatedQ: 4.0,
                MaxEstimatedQ: 150.0,
                MaxFrequencyDriftHz: 10.0,
                MinPersistenceFrames: 10,
                ConfidenceWeights: new ConfidenceWeights(0.25, 0.25, 0.25, 0.25)
            ),
            FreezePolicy: new FreezePolicy(false, 0.7, 5, false),
            Ui: new UiSettings(15)
        );
    }

    [Fact]
    public void ScoreComponents_ReturnsExpectedValues()
    {
        var settings = CreateSettings();

        // TrackedPeak:
        // Prominence: 6.0 (min) -> 0.0 score
        // TotalHits: 10 (min) -> 0.0 score
        // StdDev: 10.0 (max) -> 0.0 score
        var tracked = new TrackedPeak(Guid.NewGuid(), 1000, -10, 6.0, 10, 10, 10.0);

        // Q: 4.0 (min) -> 0.0 score
        var components = FeedbackScoring.ScoreComponents(tracked, 4.0, settings);

        Assert.Equal(0.0, components.ProminenceScore);
        Assert.Equal(0.0, components.NarrownessScore);
        Assert.Equal(0.0, components.PersistenceScore);
        Assert.Equal(0.0, components.StabilityScore);

        // Max values
        // Prominence: 6.0 + 18.0 = 24.0 -> 1.0 score
        // TotalHits: 10 + 20 = 30 -> 1.0 score
        // StdDev: 0.0 -> 1.0 score
        var trackedMax = new TrackedPeak(Guid.NewGuid(), 1000, -10, 24.0, 30, 30, 0.0);

        // Q: 150.0 (max) -> 1.0 score
        var componentsMax = FeedbackScoring.ScoreComponents(trackedMax, 150.0, settings);

        Assert.Equal(1.0, componentsMax.ProminenceScore);
        Assert.Equal(1.0, componentsMax.NarrownessScore);
        Assert.Equal(1.0, componentsMax.PersistenceScore);
        Assert.Equal(1.0, componentsMax.StabilityScore);
    }

    [Fact]
    public void Combine_ReturnsWeightedAverage()
    {
        var settings = CreateSettings();
        var comps = new ConfidenceComponents(1.0, 0.5, 0.0, 0.5);

        // Weights are 0.25 each. Sum = 1.0.
        // Result = (1.0*0.25 + 0.5*0.25 + 0.0*0.25 + 0.5*0.25) / 1.0
        // Result = (0.25 + 0.125 + 0 + 0.125) = 0.5

        double combined = FeedbackScoring.Combine(comps, settings);
        Assert.Equal(0.5, combined);
    }
}
