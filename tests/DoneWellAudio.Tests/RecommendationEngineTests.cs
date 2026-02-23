using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Linq;
using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class RecommendationEngineTests
{
    private static EqProfile CreateTestProfile(
        bool bellEnabled = true,
        int maxRecs = 5,
        double minFreq = 20.0,
        double maxFreq = 20000.0,
        double minGain = -15.0,
        double maxGain = 0.0,
        double? gainStep = 0.5,
        bool qAdjustable = true,
        double minQ = 0.1,
        double maxQ = 10.0,
        double? qStep = 0.1)
    {
        return new EqProfile(
            Version: 1,
            ProductName: "TestEQ",
            AnalogEqProfileName: "Generic",
            Bell: new BellProfile(
                Enabled: bellEnabled,
                FrequencyHz: new FrequencyControl(minFreq, maxFreq, true),
                GainDb: new RangeDouble(minGain, maxGain, gainStep),
                Q: new QControl(qAdjustable, minQ, maxQ, qStep)
            ),
            LowShelf: new ShelfProfile(false, new FrequencyControl(20, 20000, true), new RangeDouble(-15, 15, 0.5)),
            HighShelf: new ShelfProfile(false, new FrequencyControl(20, 20000, true), new RangeDouble(-15, 15, 0.5)),
            LowCut: new LowCutProfile(false, "fixed", new FrequencyControl(20, 500, true), new double[] { 80, 100 }),
            BellBandsUi: new BellBandsUi(1, 10),
            SuggestedDefaults: new SuggestedDefaults(
                MaxRecommendations: maxRecs,
                ProminenceDbToCutDb: new[]
                {
                    new ProminenceToCutMapping(10.0, -3.0),
                    new ProminenceToCutMapping(20.0, -6.0),
                    new ProminenceToCutMapping(30.0, -9.0)
                },
                FallbackCutDb: -1.0
            )
        );
    }

    private static FeedbackCandidate CreateCandidate(
        double frequency = 1000.0,
        double prominence = 15.0,
        double confidence = 0.9,
        double estimatedQ = 5.0)
    {
        var tracked = new TrackedPeak(
            TrackId: Guid.NewGuid(),
            FrequencyHz: frequency,
            MagnitudeDb: -10.0,
            ProminenceDb: prominence,
            TotalHits: 50,
            ConsecutiveHits: 50,
            FrequencyStdDevHz: 0.0
        );

        var components = new ConfidenceComponents(
            ProminenceScore: 0.8,
            NarrownessScore: 0.8,
            PersistenceScore: 0.8,
            StabilityScore: 0.8,
            RoomPriorScore: 0.0
        );

        return new FeedbackCandidate(tracked, estimatedQ, confidence, components);
    }

    [Fact]
    public void Recommend_ValidInput_ReturnsCorrectRecommendations()
    {
        var profile = CreateTestProfile();
        var candidates = ImmutableArray.Create(
            CreateCandidate(frequency: 1000, prominence: 25, confidence: 0.95), // Should get -6dB cut
            CreateCandidate(frequency: 2000, prominence: 15, confidence: 0.85)  // Should get -3dB cut
        );

        var recs = RecommendationEngine.Recommend(candidates, profile, bellBandsRequested: 2);

        Assert.Equal(2, recs.Length);

        // Check first recommendation (highest confidence)
        var r1 = recs[0];
        Assert.Equal(1000, r1.FrequencyHz);
        Assert.Equal(-6.0, r1.GainDb); // > 20dB prominence
        Assert.Equal(EqFilterType.Bell, r1.FilterType);

        // Check second recommendation
        var r2 = recs[1];
        Assert.Equal(2000, r2.FrequencyHz);
        Assert.Equal(-3.0, r2.GainDb); // > 10dB prominence
    }

    [Fact]
    public void Recommend_BellDisabled_ReturnsEmpty()
    {
        var profile = CreateTestProfile(bellEnabled: false);
        var candidates = ImmutableArray.Create(CreateCandidate());

        var recs = RecommendationEngine.Recommend(candidates, profile, bellBandsRequested: 1);

        Assert.Empty(recs);
    }

    [Fact]
    public void Recommend_NoCandidates_ReturnsEmpty()
    {
        var profile = CreateTestProfile();
        var candidates = ImmutableArray<FeedbackCandidate>.Empty;

        var recs = RecommendationEngine.Recommend(candidates, profile, bellBandsRequested: 1);

        Assert.Empty(recs);
    }

    [Fact]
    public void Recommend_BellBandsRequestedOutOfRange_ClampsValue()
    {
        var profile = CreateTestProfile(maxRecs: 3); // BellBandsUi: Min 1, Max 10. SuggestedDefaults Max: 3.
        var candidates = Enumerable.Range(0, 5)
            .Select(i => CreateCandidate(confidence: 0.9 - i * 0.1))
            .ToImmutableArray();

        // Request 0 (Below Min 1) -> Clamped to 1
        var recsLow = RecommendationEngine.Recommend(candidates, profile, bellBandsRequested: 0);
        Assert.Single(recsLow);

        // Request 20 (Above Max 10) -> Clamped to 10, then Min(10, MaxRecs 3) -> 3
        var recsHigh = RecommendationEngine.Recommend(candidates, profile, bellBandsRequested: 20);
        Assert.Equal(3, recsHigh.Length);
    }

    [Fact]
    public void Recommend_FewerCandidatesThanRequested_ReturnsAvailable()
    {
        var profile = CreateTestProfile();
        var candidates = ImmutableArray.Create(CreateCandidate());

        // Request 5, but only 1 available
        var recs = RecommendationEngine.Recommend(candidates, profile, bellBandsRequested: 5);

        Assert.Single(recs);
    }

    [Fact]
    public void Recommend_GainRounding_RoundsCorrectly()
    {
        // Gain Step 2.0. Min -20, Max 0.
        // Use custom profile to force specific mapping that needs rounding
        var customProfile = new EqProfile(
            Version: 1, "", "",
            Bell: new BellProfile(true, new FrequencyControl(20, 20000, true), new RangeDouble(-20, 0, 2.0), new QControl(true, 0.1, 10, 0.1)),
            LowShelf: new ShelfProfile(false, new FrequencyControl(20, 20000, true), new RangeDouble(-15, 15, 0.5)),
            HighShelf: new ShelfProfile(false, new FrequencyControl(20, 20000, true), new RangeDouble(-15, 15, 0.5)),
            LowCut: new LowCutProfile(false, "fixed", new FrequencyControl(20, 500, true), new double[] { 80, 100 }),
            BellBandsUi: new BellBandsUi(1, 10),
            SuggestedDefaults: new SuggestedDefaults(
                MaxRecommendations: 5,
                ProminenceDbToCutDb: new[] { new ProminenceToCutMapping(10.0, -5.0) },
                FallbackCutDb: -1.0
            )
        );

        // -5.0 target cut. Step 2.0. -5.0 / 2.0 = -2.5. Math.Round(-2.5) -> -2 (ToEven). -2 * 2.0 = -4.0.

        var candidates = ImmutableArray.Create(CreateCandidate(prominence: 15)); // > 10, so -5.0

        var recs = RecommendationEngine.Recommend(candidates, customProfile, bellBandsRequested: 1);

        Assert.Equal(-4.0, recs[0].GainDb);
    }

    [Fact]
    public void Recommend_QRounding_RoundsCorrectly()
    {
        // Q Step 0.5. Input estimated Q 3.2.
        // 3.2 / 0.5 = 6.4 -> Round to 6. 6 * 0.5 = 3.0.

        var profile = CreateTestProfile(qStep: 0.5);
        var candidates = ImmutableArray.Create(CreateCandidate(estimatedQ: 3.2));

        var recs = RecommendationEngine.Recommend(candidates, profile, bellBandsRequested: 1);

        Assert.Equal(3.0, recs[0].Q);
    }

    [Fact]
    public void Recommend_QFixed_ReturnsNullQ()
    {
        var profile = CreateTestProfile(qAdjustable: false);
        var candidates = ImmutableArray.Create(CreateCandidate(estimatedQ: 5.0));

        var recs = RecommendationEngine.Recommend(candidates, profile, bellBandsRequested: 1);

        Assert.Null(recs[0].Q);
    }

    [Fact]
    public void Recommend_ProminenceMapping_SelectsCorrectCut()
    {
        var profile = CreateTestProfile();
        // Defaults: 10->-3, 20->-6, 30->-9. Fallback -1.

        var candidates = ImmutableArray.Create(
            CreateCandidate(prominence: 5, confidence: 0.9),   // < 10 -> Fallback -1
            CreateCandidate(prominence: 15, confidence: 0.8),  // >= 10, < 20 -> -3
            CreateCandidate(prominence: 25, confidence: 0.7),  // >= 20, < 30 -> -6
            CreateCandidate(prominence: 35, confidence: 0.6)   // >= 30 -> -9
        );

        var recs = RecommendationEngine.Recommend(candidates, profile, bellBandsRequested: 4);

        // Sorts by confidence, so order is preserved: 5, 15, 25, 35

        Assert.Equal(-1.0, recs[0].GainDb);
        Assert.Equal(-3.0, recs[1].GainDb);
        Assert.Equal(-6.0, recs[2].GainDb);
        Assert.Equal(-9.0, recs[3].GainDb);
    }
}
