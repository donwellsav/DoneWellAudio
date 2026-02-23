using System;
using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class FeedbackScoringTests
{
    private static DetectorSettings CreateSettings(double minQ, double maxQ)
    {
        return new DetectorSettings(
            Version: 1,
            Audio: new AudioSettings(4096, 1024, 50, 8000),
            Detection: new DetectionSettings(
                LocalNeighborhoodBins: 12,
                MinProminenceDb: 6.0,
                MinEstimatedQ: minQ,
                MaxEstimatedQ: maxQ,
                MaxFrequencyDriftHz: 10.0,
                MinPersistenceFrames: 6,
                ConfidenceWeights: new ConfidenceWeights(0.25, 0.25, 0.25, 0.25)
            ),
            FreezePolicy: new FreezePolicy(false, 0.8, 8, false),
            Ui: new UiSettings(15)
        );
    }

    [Fact]
    public void ScoreComponents_ZeroRangeQ_AvoidsNaN()
    {
        // Arrange: MinQ = MaxQ = 10.0 => Range is 0.0
        var settings = CreateSettings(10.0, 10.0);

        // Tracked peak with arbitrary values
        var tracked = new TrackedPeak(Guid.NewGuid(), 1000, -10, 12.0, 20, 20, 0.5);

        // Case 1: estimatedQ matches min exactly (0 numerator)
        double estimatedQ = 10.0;
        var result = FeedbackScoring.ScoreComponents(tracked, estimatedQ, settings);
        Assert.False(double.IsNaN(result.NarrownessScore), $"Narrowness score (est={estimatedQ}) should not be NaN");

        // Case 2: estimatedQ is larger (positive numerator)
        estimatedQ = 15.0;
        result = FeedbackScoring.ScoreComponents(tracked, estimatedQ, settings);
        Assert.False(double.IsInfinity(result.NarrownessScore), $"Narrowness score (est={estimatedQ}) should not be Infinity");
    }

    [Fact]
    public void ScoreComponents_NegativeRangeQ_HandledGracefully()
    {
        // Arrange: MinQ = 10.0, MaxQ = 5.0 (Invalid configuration)
        var settings = CreateSettings(10.0, 5.0);
        var tracked = new TrackedPeak(Guid.NewGuid(), 1000, -10, 12.0, 20, 20, 0.5);

        double estimatedQ = 8.0;
        var result = FeedbackScoring.ScoreComponents(tracked, estimatedQ, settings);

        Assert.False(double.IsNaN(result.NarrownessScore), "Narrowness score should not be NaN on invalid range");
        Assert.False(double.IsInfinity(result.NarrownessScore), "Narrowness score should not be Infinity on invalid range");
    }
}
