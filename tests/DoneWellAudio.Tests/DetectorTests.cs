using System.Collections.Immutable;
using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class DetectorTests
{
    private static (DetectorSettings settings, EqProfile eq) CreateTestConfig()
    {
        var settings = new DetectorSettings(
            Version: 1,
            Audio: new AudioSettings(FrameSize: 4096, HopSize: 1024, MinFrequencyHz: 50, MaxFrequencyHz: 8000),
            Detection: new DetectionSettings(
                LocalNeighborhoodBins: 12,
                MinProminenceDb: 6.0,
                MinEstimatedQ: 4.0,
                MaxEstimatedQ: 150.0,
                MaxFrequencyDriftHz: 10.0,
                MinPersistenceFrames: 6,
                ConfidenceWeights: new ConfidenceWeights(0.35, 0.35, 0.20, 0.10)
            ),
            FreezePolicy: new FreezePolicy(
                Enabled: false,
                ConfidenceThreshold: 0.8,
                ConsecutiveFramesAboveThreshold: 8,
                StopCaptureOnFreeze: false
            ),
            Ui: new UiSettings(UpdateHz: 15)
        );

        var eq = new EqProfile(
            Version: 1,
            ProductName: "DoneWellAudio",
            AnalogEqProfileName: "Test EQ",
            Bell: new BellProfile(
                Enabled: true,
                FrequencyHz: new FrequencyControl(40, 16000, true),
                GainDb: new RangeDouble(-12, 0, 0.5),
                Q: new QControl(true, 1.0, 12.0, 0.1)
            ),
            LowShelf: new ShelfProfile(true, new FrequencyControl(40, 400, true), new RangeDouble(-12, 12, 0.5)),
            HighShelf: new ShelfProfile(true, new FrequencyControl(4000, 16000, true), new RangeDouble(-12, 12, 0.5)),
            LowCut: new LowCutProfile(true, "unknown", new FrequencyControl(20, 200, true), new[] { 20.0, 40.0, 80.0, 120.0 }),
            BellBandsUi: new BellBandsUi(1, 7),
            SuggestedDefaults: new SuggestedDefaults(
                MaxRecommendations: 7,
                ProminenceDbToCutDb: new[]
                {
                    new ProminenceToCutMapping(6.0, -3.0),
                    new ProminenceToCutMapping(12.0, -6.0),
                    new ProminenceToCutMapping(18.0, -9.0),
                },
                FallbackCutDb: -3.0
            )
        );

        return (settings, eq);
    }

    [Fact]
    public void SingleTone_IsDetectedNearFrequency()
    {
        var (settings, eq) = CreateTestConfig();
        var analyzer = new FeedbackAnalyzer(settings, eq, new MathNetFft());

        int sr = 48000;
        analyzer.SetSampleRate(sr);

        var samples = SignalGen.SineWithNoise(sr, seconds: 1.2, freqHz: 1000, amp: 0.6f, noiseAmp: 0.02f, seed: 123);
        var snap = RunInChunks(analyzer, samples, chunk: 512, bellBands: 3);

        Assert.True(snap.Candidates.Length > 0);
        var top = snap.Candidates[0];
        Assert.InRange(top.Tracked.FrequencyHz, 980, 1020);
    }

    [Fact]
    public void TwoTones_DetectsBoth()
    {
        var (settings, eq) = CreateTestConfig();
        var analyzer = new FeedbackAnalyzer(settings, eq, new MathNetFft());

        int sr = 48000;
        analyzer.SetSampleRate(sr);

        var samples = SignalGen.TwoSinesWithNoise(sr, seconds: 1.2, f1: 800, f2: 2500, amp: 0.5f, noiseAmp: 0.02f, seed: 7);
        var snap = RunInChunks(analyzer, samples, chunk: 512, bellBands: 3);

        var freqs = snap.Candidates.Select(c => c.Tracked.FrequencyHz).ToArray();
        Assert.Contains(freqs, f => f > 780 && f < 820);
        Assert.Contains(freqs, f => f > 2450 && f < 2550);
    }

    [Fact]
    public void HarmonicSeries_GetsPenaltyComparedToIsolatedTone()
    {
        var (settings, eq) = CreateTestConfig();
        int sr = 48000;

        // Isolated tone
        var a1 = new FeedbackAnalyzer(settings, eq, new MathNetFft());
        a1.SetSampleRate(sr);
        var tone = SignalGen.SineWithNoise(sr, seconds: 1.2, freqHz: 600, amp: 0.6f, noiseAmp: 0.02f, seed: 11);
        var snapTone = RunInChunks(a1, tone, chunk: 512, bellBands: 3);
        double confTone = snapTone.Candidates.Length > 0 ? snapTone.Candidates[0].Confidence : 0;

        // Harmonic-ish: 200Hz + 400 + 600 + 800 (multiple integer multiples)
        var a2 = new FeedbackAnalyzer(settings, eq, new MathNetFft());
        a2.SetSampleRate(sr);
        var harm = SignalGen.HarmonicStackWithNoise(sr, seconds: 1.2, f0: 200, harmonics: 4, amp: 0.55f, noiseAmp: 0.02f, seed: 12);
        var snapHarm = RunInChunks(a2, harm, chunk: 512, bellBands: 3);
        double confHarm = snapHarm.Candidates.Length > 0 ? snapHarm.Candidates[0].Confidence : 0;

        Assert.True(confTone > confHarm, $"Expected isolated tone confidence ({confTone:0.00}) > harmonic confidence ({confHarm:0.00}).");
    }

    [Fact]
    public void Harmonic_FilterToggle_Works()
    {
        var (settings, eq) = CreateTestConfig();
        int sr = 48000;
        var harm = SignalGen.HarmonicStackWithNoise(sr, seconds: 1.2, f0: 200, harmonics: 4, amp: 0.55f, noiseAmp: 0.02f, seed: 12);

        // Run with harmonic filter ENABLED
        var a1 = new FeedbackAnalyzer(settings, eq, new MathNetFft());
        a1.SetSampleRate(sr);
        var snap1 = RunInChunks(a1, harm, chunk: 512, bellBands: 3, filterHarmonics: true);
        double confPenalized = snap1.Candidates.Length > 0 ? snap1.Candidates[0].Confidence : 0;

        // Run with harmonic filter DISABLED
        var a2 = new FeedbackAnalyzer(settings, eq, new MathNetFft());
        a2.SetSampleRate(sr);
        var snap2 = RunInChunks(a2, harm, chunk: 512, bellBands: 3, filterHarmonics: false);
        double confRaw = snap2.Candidates.Length > 0 ? snap2.Candidates[0].Confidence : 0;

        // Assert Raw > Penalized
        Assert.True(confRaw > confPenalized + 0.1,
            $"Expected raw confidence ({confRaw:0.00}) to be significantly higher than penalized ({confPenalized:0.00}).");
    }

    [Fact]
    public void Recommendations_RespectBellBandCount()
    {
        var (settings, eq) = CreateTestConfig();

        // Build a fake candidate list
        var candidates = new[]
        {
            FakeCandidate(630, 0.90, 10, 18),
            FakeCandidate(1000, 0.85, 9, 16),
            FakeCandidate(2500, 0.80, 8, 14),
            FakeCandidate(4000, 0.75, 7, 12),
        }.ToImmutableArray();

        var recs = RecommendationEngine.Recommend(candidates, eq, bellBandsRequested: 2);
        Assert.Equal(2, recs.Length);

        var recs2 = RecommendationEngine.Recommend(candidates, eq, bellBandsRequested: 7);
        Assert.Equal(4, recs2.Length); // can't exceed candidate count
    }

    private static AnalysisSnapshot RunInChunks(FeedbackAnalyzer analyzer, float[] samples, int chunk, int bellBands, bool filterHarmonics = true)
    {
        AnalysisSnapshot snap = new(DateTimeOffset.UtcNow, false,
            System.Collections.Immutable.ImmutableArray<FeedbackCandidate>.Empty,
            System.Collections.Immutable.ImmutableArray<EqRecommendation>.Empty);

        for (int i = 0; i < samples.Length; i += chunk)
        {
            int len = Math.Min(chunk, samples.Length - i);
            snap = analyzer.ProcessSamples(samples.AsSpan(i, len), bellBands, filterHarmonics);
        }

        return snap;
    }

    private static FeedbackCandidate FakeCandidate(double freq, double conf, double q, double promDb)
    {
        var tracked = new TrackedPeak(Guid.NewGuid(), freq, -10, promDb, TotalHits: 20, ConsecutiveHits: 20, FrequencyStdDevHz: 0.5);
        var comps = new ConfidenceComponents(1,1,1,1);
        return new FeedbackCandidate(tracked, q, conf, comps);
    }
}
