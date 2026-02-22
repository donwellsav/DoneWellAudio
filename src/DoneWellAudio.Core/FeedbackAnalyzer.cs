using System.Collections.Immutable;

namespace DoneWellAudio.Core;

public sealed class FeedbackAnalyzer
{
    private DetectorSettings _settings;
    private readonly EqProfile _eq;
    private readonly IFft _fft;
    private readonly PeakTracker _tracker = new();

    private readonly List<float> _buffer = new();
    private int _sampleRate;

    private bool _frozen;
    private int _freezeStreak;

    private ImmutableArray<FeedbackCandidate> _lastCandidates = ImmutableArray<FeedbackCandidate>.Empty;
    private ImmutableArray<EqRecommendation> _lastRecs = ImmutableArray<EqRecommendation>.Empty;

    public FeedbackAnalyzer(DetectorSettings settings, EqProfile eqProfile, IFft fft)
    {
        _settings = settings;
        _eq = eqProfile;
        _fft = fft;
    }

    public void UpdateSettings(DetectorSettings settings)
    {
        _settings = settings;
        // If switching to continuous mode while frozen, unfreeze
        if (_settings.ContinuousMode && _frozen)
        {
            _frozen = false;
            _freezeStreak = 0;
        }
    }

    public void SetSampleRate(int sampleRate) => _sampleRate = sampleRate;

    public void Reset()
    {
        _buffer.Clear();
        _tracker.Reset();
        _frozen = false;
        _freezeStreak = 0;
        _lastCandidates = ImmutableArray<FeedbackCandidate>.Empty;
        _lastRecs = ImmutableArray<EqRecommendation>.Empty;
    }

    public AnalysisSnapshot ProcessSamples(ReadOnlySpan<float> monoSamples, int bellBandsRequested, bool filterHarmonics = true)
    {
        if (_sampleRate <= 0) throw new InvalidOperationException("SampleRate not set.");

        if (_frozen && !_settings.ContinuousMode)
        {
            return new AnalysisSnapshot(DateTimeOffset.UtcNow, true, _lastCandidates, _lastRecs);
        }

        for (int i = 0; i < monoSamples.Length; i++)
            _buffer.Add(monoSamples[i]);

        while (_buffer.Count >= _settings.Audio.FrameSize)
        {
            var frame = _buffer.GetRange(0, _settings.Audio.FrameSize).ToArray();
            _buffer.RemoveRange(0, _settings.Audio.HopSize);

            WindowFunctions.ApplyHannInPlace(frame);
            var mag = _fft.MagnitudeSpectrum(frame);

            // Build dB curve for Q estimation
            var magDb = new double[mag.Length];
            const double floor = 1e-12;
            for (int i = 0; i < mag.Length; i++)
                magDb[i] = 20.0 * Math.Log10(Math.Max(floor, mag[i]));

            var peaks = PeakDetection.FindPeaksDb(mag, _sampleRate, _settings);
            var tracked = _tracker.Update(peaks, _settings);

            _lastCandidates = BuildCandidates(tracked, magDb, filterHarmonics);
            _lastRecs = RecommendationEngine.Recommend(_lastCandidates, _eq, bellBandsRequested);

            UpdateFreeze(_lastCandidates);
        }

        return new AnalysisSnapshot(DateTimeOffset.UtcNow, _frozen, _lastCandidates, _lastRecs);
    }

    private ImmutableArray<FeedbackCandidate> BuildCandidates(IReadOnlyList<TrackedPeak> tracked, double[] magDb, bool filterHarmonics)
    {
        int nFft = (magDb.Length - 1) * 2;
        double binHz = _sampleRate / (double)nFft;

        var list = new List<FeedbackCandidate>();

        foreach (var t in tracked)
        {
            int bin = (int)Math.Round(t.FrequencyHz / binHz);
            bin = Math.Clamp(bin, 1, magDb.Length - 2);

            double q = PeakDetection.EstimateQFromDbCurve(magDb, bin, binHz, dropDb: 6.0);

            if (q < _settings.Detection.MinEstimatedQ) continue;
            if (q > _settings.Detection.MaxEstimatedQ) continue;

            int minHits = _settings.Detection.MinPersistenceFrames;
            switch (_settings.ResponseSpeed)
            {
                case ResponseSpeed.Fast: minHits = Math.Max(2, minHits / 2); break;
                case ResponseSpeed.Slow: minHits = minHits * 2; break;
            }

            if (t.TotalHits < minHits) continue;

            var comps = FeedbackScoring.ScoreComponents(t, q, _settings);
            double conf = FeedbackScoring.Combine(comps, _settings);

            list.Add(new FeedbackCandidate(t, q, conf, comps));
        }


        // Harmonic-series penalty:
        // If multiple peaks appear at near-integer multiples, treat them as more likely "program material" than isolated feedback.
        // This is a tunable heuristic: adjust or disable once you have real-world calibration data.
        if (filterHarmonics && list.Count >= 3)
        {
            const double ratioTol = 0.015; // 1.5% tolerance
            var adjusted = new List<FeedbackCandidate>(list.Count);

            foreach (var c in list)
            {
                int harmonicCount = 0;
                foreach (var other in list)
                {
                    if (ReferenceEquals(c, other)) continue;
                    double r = other.Tracked.FrequencyHz / c.Tracked.FrequencyHz;
                    if (r < 1.8 || r > 6.2) continue;
                    int k = (int)Math.Round(r);
                    if (k < 2 || k > 6) continue;
                    if (Math.Abs(r - k) <= ratioTol) harmonicCount++;
                }

                double conf = c.Confidence;
                if (harmonicCount >= 2)
                    conf *= 0.75;

                adjusted.Add(conf == c.Confidence ? c : c with { Confidence = conf });
            }

            list = adjusted;
        }

        list.Sort((a, b) => b.Confidence.CompareTo(a.Confidence));
        return list.Take(16).ToImmutableArray();
    }

    private void UpdateFreeze(ImmutableArray<FeedbackCandidate> candidates)
    {
        if (!_settings.FreezePolicy.Enabled) return;

        double top = candidates.Length > 0 ? candidates[0].Confidence : 0;
        if (top >= _settings.FreezePolicy.ConfidenceThreshold)
            _freezeStreak++;
        else
            _freezeStreak = 0;

        if (_freezeStreak >= _settings.FreezePolicy.ConsecutiveFramesAboveThreshold)
            _frozen = true;
    }
}
