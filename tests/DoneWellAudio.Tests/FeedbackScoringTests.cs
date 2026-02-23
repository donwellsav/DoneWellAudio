using System;
using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class FeedbackScoringTests
{
    private static DetectorSettings CreateSettings(
        double minQ = 5.0,
        double maxQ = 20.0,
        double minProminence = 6.0,
        int minPersistence = 6,
        double maxDrift = 10.0,
        ConfidenceWeights? weights = null)
    {
        return new DetectorSettings(
            Version: 1,
            Audio: new AudioSettings(4096, 1024, 50, 8000),
            Detection: new DetectionSettings(
                LocalNeighborhoodBins: 12,
                MinProminenceDb: minProminence,
                MinEstimatedQ: minQ,
                MaxEstimatedQ: maxQ,
                MaxFrequencyDriftHz: maxDrift,
                MinPersistenceFrames: minPersistence,
                ConfidenceWeights: weights ?? new ConfidenceWeights(0.25, 0.25, 0.25, 0.25)
            ),
            FreezePolicy: new FreezePolicy(false, 0.8, 8, false),
            Ui: new UiSettings(15)
        );
    }

    [Fact]
    public void ScoreComponents_ZeroRangeQ_AvoidsNaN()
    {
        // Arrange: MinQ = MaxQ = 10.0 => Range is 0.0
        var settings = CreateSettings(minQ: 10.0, maxQ: 10.0);

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
        var settings = CreateSettings(minQ: 10.0, maxQ: 5.0);
        var tracked = new TrackedPeak(Guid.NewGuid(), 1000, -10, 12.0, 20, 20, 0.5);

        double estimatedQ = 8.0;
        var result = FeedbackScoring.ScoreComponents(tracked, estimatedQ, settings);

        Assert.False(double.IsNaN(result.NarrownessScore), "Narrowness score should not be NaN on invalid range");
        Assert.False(double.IsInfinity(result.NarrownessScore), "Narrowness score should not be Infinity on invalid range");
    }

    [Fact]
    public void ScoreComponents_HappyPath_CalculatesCorrectly()
    {
        // Arrange
        // Prominence: Min 10, Max 10+18=28. Input 19 => (19-10)/18 = 0.5
        // Narrowness: Min 5, Max 15. Input 10 => (10-5)/10 = 0.5
        // Persistence: Min 10, Max 10+20=30. Input 20 => (20-10)/20 = 0.5
        // Stability: MaxDrift 10. Input 5 => 1 - (5/10) = 0.5
        // RoomPrior: 0.8
        var settings = CreateSettings(
            minQ: 5.0, maxQ: 15.0,
            minProminence: 10.0,
            minPersistence: 10,
            maxDrift: 10.0);

        var tracked = new TrackedPeak(Guid.NewGuid(), 1000, -10,
            ProminenceDb: 19.0,
            TotalHits: 20,
            ConsecutiveHits: 20,
            FrequencyStdDevHz: 5.0);

        // Act
        var result = FeedbackScoring.ScoreComponents(tracked, estimatedQ: 10.0, settings, roomPriorScore: 0.8);

        // Assert
        Assert.Equal(0.5, result.ProminenceScore, 6);
        Assert.Equal(0.5, result.NarrownessScore, 6);
        Assert.Equal(0.5, result.PersistenceScore, 6);
        Assert.Equal(0.5, result.StabilityScore, 6);
        Assert.Equal(0.8, result.RoomPriorScore, 6);
    }

    [Fact]
    public void ScoreComponents_ClampsValues_ToZeroAndOne()
    {
        // Arrange
        var settings = CreateSettings(
            minQ: 5.0, maxQ: 15.0, // Range 10
            minProminence: 10.0,   // Range 18 -> Max 28
            minPersistence: 10,    // Range 20 -> Max 30
            maxDrift: 10.0);

        // Case 1: All values below minimums (should be 0.0)
        // Prominence 5 (<10), Q 2 (<5), Persistence 5 (<10), Drift 15 (>10, so score < 0 clamped to 0)
        var trackedLow = new TrackedPeak(Guid.NewGuid(), 1000, -10,
            ProminenceDb: 5.0,
            TotalHits: 5,
            ConsecutiveHits: 5,
            FrequencyStdDevHz: 15.0);

        var resultLow = FeedbackScoring.ScoreComponents(trackedLow, estimatedQ: 2.0, settings);

        Assert.Equal(0.0, resultLow.ProminenceScore);
        Assert.Equal(0.0, resultLow.NarrownessScore);
        Assert.Equal(0.0, resultLow.PersistenceScore);
        Assert.Equal(0.0, resultLow.StabilityScore);

        // Case 2: All values above maximums (should be 1.0)
        // Prominence 40 (>28), Q 20 (>15), Persistence 50 (>30), Drift 0 (<10, so score > 1 clamped to 1 if drift was negative, but here drift 0 => score 1.0)
        var trackedHigh = new TrackedPeak(Guid.NewGuid(), 1000, -10,
            ProminenceDb: 40.0,
            TotalHits: 50,
            ConsecutiveHits: 50,
            FrequencyStdDevHz: 0.0);

        var resultHigh = FeedbackScoring.ScoreComponents(trackedHigh, estimatedQ: 20.0, settings);

        Assert.Equal(1.0, resultHigh.ProminenceScore);
        Assert.Equal(1.0, resultHigh.NarrownessScore);
        Assert.Equal(1.0, resultHigh.PersistenceScore);
        Assert.Equal(1.0, resultHigh.StabilityScore);
    }

    [Fact]
    public void Combine_WeightedAverage_CalculatesCorrectly()
    {
        // Arrange
        var weights = new ConfidenceWeights(
            Prominence: 0.4,
            Narrowness: 0.3,
            Persistence: 0.2,
            Stability: 0.1,
            RoomPrior: 0.0);

        var settings = CreateSettings(weights: weights);

        var components = new ConfidenceComponents(
            ProminenceScore: 1.0,
            NarrownessScore: 0.5,
            PersistenceScore: 0.0,
            StabilityScore: 0.5,
            RoomPriorScore: 0.0);

        // Expected: (1.0*0.4 + 0.5*0.3 + 0.0*0.2 + 0.5*0.1) / (0.4+0.3+0.2+0.1+0.0)
        // = (0.4 + 0.15 + 0 + 0.05) / 1.0 = 0.6

        // Act
        var score = FeedbackScoring.Combine(components, settings);

        // Assert
        Assert.Equal(0.6, score, 6);
    }

    [Fact]
    public void Combine_ZeroWeights_ReturnsZero_AndAvoidsNaN()
    {
        // Arrange: Sum of weights = 0
        var weights = new ConfidenceWeights(0, 0, 0, 0, 0);
        var settings = CreateSettings(weights: weights);

        var components = new ConfidenceComponents(1.0, 1.0, 1.0, 1.0, 1.0);

        // Act
        var score = FeedbackScoring.Combine(components, settings);

        // Assert
        // Logic: if sumW <= 0, sumW = 1. Score = (1*0 + ...)/1 = 0.
        Assert.Equal(0.0, score);
        Assert.False(double.IsNaN(score));
    }

    [Fact]
    public void Combine_PartialWeights_IgnoresZeroWeightComponents()
    {
        // Arrange: Only Prominence matters
        var weights = new ConfidenceWeights(1.0, 0.0, 0.0, 0.0, 0.0);
        var settings = CreateSettings(weights: weights);

        var components = new ConfidenceComponents(
            ProminenceScore: 0.8,
            NarrownessScore: 0.1, // Should be ignored
            PersistenceScore: 0.1, // Should be ignored
            StabilityScore: 0.1, // Should be ignored
            RoomPriorScore: 0.1); // Should be ignored

        // Act
        var score = FeedbackScoring.Combine(components, settings);

        // Assert
        Assert.Equal(0.8, score, 6);
    }

    [Fact]
    public void Combine_RoomPriorWeighting_IncludesRoomPrior()
    {
        // Arrange: 50% Prominence, 50% RoomPrior
        var weights = new ConfidenceWeights(0.5, 0.0, 0.0, 0.0, 0.5);
        var settings = CreateSettings(weights: weights);

        var components = new ConfidenceComponents(
            ProminenceScore: 1.0,
            NarrownessScore: 0.0,
            PersistenceScore: 0.0,
            StabilityScore: 0.0,
            RoomPriorScore: 0.6);

        // Act
        // (1.0*0.5 + 0.6*0.5) / 1.0 = 0.5 + 0.3 = 0.8
        var score = FeedbackScoring.Combine(components, settings);

        // Assert
        Assert.Equal(0.8, score, 6);
    }
}
