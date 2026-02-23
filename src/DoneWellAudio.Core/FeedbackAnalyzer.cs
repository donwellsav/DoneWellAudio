using System.Collections.Immutable;
using System.Linq;
using DoneWellAudio.Core.RoomPrediction;

namespace DoneWellAudio.Core;

public sealed class FeedbackAnalyzer
{
    private DetectorSettings _settings;
    private readonly EqProfile _eq;
    private readonly IFft _fft;
    private readonly PeakTracker _tracker = new();

    private RoomPriorLookup? _roomPrior;

    // Use a fixed array circular buffer instead of List<float> to reduce allocations
    private float[] _ringBuffer = Array.Empty<float>();
    private float[] _analysisBuffer = Array.Empty<float>();
    // Reusable buffers for spectrum analysis
    private double[] _magDbBuffer = Array.Empty<double>();
    private double[] _whitenedBuffer = Array.Empty<double>();

    private int _ringHead; // Start of valid data
    private int _ringTail; // End of valid data (write position)
    private int _ringCount;

    private int _sampleRate;

    private bool _frozen;
    private int _freezeStreak;

    private ImmutableArray<FeedbackCandidate> _lastCandidates = ImmutableArray<FeedbackCandidate>.Empty;
    private ImmutableArray<EqRecommendation> _lastRecs = ImmutableArray<EqRecommendation>.Empty;

    public FeedbackAnalyzer(DetectorSettings settings, EqProfile eqProfile, IFft fft)
    {
        ValidateSettings(settings);
        _settings = settings;
        _eq = eqProfile;
        _fft = fft;
        EnsureBuffers();
    }

    private static void ValidateSettings(DetectorSettings settings)
    {
        if (settings.Audio.FrameSize <= 0)
        {
            throw new ArgumentException("FrameSize must be greater than zero.", nameof(settings));
        }
        if (settings.Audio.HopSize <= 0)
        {
            throw new ArgumentException("HopSize must be greater than zero.", nameof(settings));
        }
    }

    private void EnsureBuffers()
    {
        int requiredFrame = _settings.Audio.FrameSize;
        if (_analysisBuffer.Length != requiredFrame)
        {
            _analysisBuffer = new float[requiredFrame];
        }

        // Spectrum buffers size is N/2 + 1
        int spectrumSize = requiredFrame / 2 + 1;
        if (_magDbBuffer.Length != spectrumSize)
        {
            _magDbBuffer = new double[spectrumSize];
            _whitenedBuffer = new double[spectrumSize];
        }

        // Ring buffer should be large enough to hold at least one frame + hop + incoming chunk.
        // We use a multiple of FrameSize to minimize resizing.
        int requiredRing = requiredFrame * 4;
        if (_ringBuffer.Length < requiredRing)
        {
            float[] newRing = new float[requiredRing];
            if (_ringCount > 0)
            {
                int firstChunk = Math.Min(_ringCount, _ringBuffer.Length - _ringHead);
                Array.Copy(_ringBuffer, _ringHead, newRing, 0, firstChunk);
                if (firstChunk < _ringCount)
                {
                    Array.Copy(_ringBuffer, 0, newRing, firstChunk, _ringCount - firstChunk);
                }
            }
            _ringBuffer = newRing;
            _ringHead = 0;
            _ringTail = _ringCount;
        }
    }

    public void UpdateSettings(DetectorSettings settings)
    {
        ValidateSettings(settings);
        _settings = settings;
        EnsureBuffers();
        // If switching to continuous mode while frozen, unfreeze
        if (_settings.ContinuousMode && _frozen)
        {
            _frozen = false;
            _freezeStreak = 0;
        }
    }

    public void SetSampleRate(int sampleRate) => _sampleRate = sampleRate;

    public void SetRoomPrediction(RoomPredictionResult result)
    {
        _roomPrior = new RoomPriorLookup(result);
    }

    public void Reset()
    {
        _ringHead = 0;
        _ringTail = 0;
        _ringCount = 0;
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

        // Ensure buffers are ready
        if (_analysisBuffer.Length != _settings.Audio.FrameSize) EnsureBuffers();

        int incomingIdx = 0;
        int incomingLen = monoSamples.Length;
        int frameSize = _settings.Audio.FrameSize;
        int hopSize = _settings.Audio.HopSize;

        while (incomingIdx < incomingLen)
        {
            int spaceTotal = _ringBuffer.Length - _ringCount;
            // If buffer is full, we must process or drop.
            // If ProcessFrame logic is correct, we should process whenever we have >= frameSize.
            // If hopSize < frameSize, count decreases slowly.
            // We must ensure buffer is large enough. EnsureBuffers guarantees FrameSize * 4.
            // If we still run out of space, we force process or resize?
            // For now, assume EnsureBuffers is sufficient.

            // Optimization: Copy in chunks
            int toWrite = Math.Min(incomingLen - incomingIdx, spaceTotal);
            if (toWrite <= 0)
            {
                // This implies buffer full and we can't process (e.g. frameSize > ringCount, but ringCount == Length).
                // This means RingBuffer is too small for FrameSize? But we check that.
                // Or we have valid data but not enough to process?
                // If full, ringCount == Length. Since Length >= FrameSize, we MUST be able to process.
                // So this branch should be unreachable if logic is correct, unless we are stuck.
                // Force process to free space?
                if (_ringCount >= frameSize)
                {
                     // Force process loop below
                }
                else
                {
                    // Should not happen if Length >= FrameSize.
                    // But if it does, resize.
                    EnsureBuffers(); // Might resize if logic changes, but here simply break to avoid infinite loop
                    break;
                }
            }

            int spaceBeforeWrap = _ringBuffer.Length - _ringTail;
            int chunk1 = Math.Min(toWrite, spaceBeforeWrap);

            if (chunk1 > 0)
            {
                monoSamples.Slice(incomingIdx, chunk1).CopyTo(_ringBuffer.AsSpan(_ringTail));
                _ringTail = (_ringTail + chunk1) % _ringBuffer.Length;
                _ringCount += chunk1;
                incomingIdx += chunk1;
            }

            if (chunk1 < toWrite)
            {
                int chunk2 = toWrite - chunk1;
                monoSamples.Slice(incomingIdx, chunk2).CopyTo(_ringBuffer.AsSpan(_ringTail));
                _ringTail = (_ringTail + chunk2) % _ringBuffer.Length;
                _ringCount += chunk2;
                incomingIdx += chunk2;
            }

            // Process frames as soon as we have enough data
            while (_ringCount >= frameSize)
            {
                // Copy to analysis buffer (linearize)
                int head = _ringHead;
                int firstPart = Math.Min(frameSize, _ringBuffer.Length - head);
                Array.Copy(_ringBuffer, head, _analysisBuffer, 0, firstPart);
                if (firstPart < frameSize)
                {
                    Array.Copy(_ringBuffer, 0, _analysisBuffer, firstPart, frameSize - firstPart);
                }

                WindowFunctions.ApplyHannInPlace(_analysisBuffer);
                var mag = _fft.MagnitudeSpectrum(_analysisBuffer);

                // Ensure buffers are correct size (in case FFT implementation changes output size, though FrameSize is fixed)
                if (mag.Length > _magDbBuffer.Length)
                {
                    _magDbBuffer = new double[mag.Length];
                    _whitenedBuffer = new double[mag.Length];
                }

                // Build dB curve for Q estimation
                PeakDetection.ConvertToDb(mag, _magDbBuffer);

                // Prepare buffer for peak finding (handle whitening)
                double[] peaksInput = _magDbBuffer;
                if (_settings.SpectralWhitening)
                {
                    // Copy to whitened buffer to preserve raw magDb for Q estimation
                    Array.Copy(_magDbBuffer, _whitenedBuffer, mag.Length);

                    int nFft = (mag.Length - 1) * 2;
                    double binHz = _sampleRate / (double)nFft;
                    PeakDetection.ApplyWhitening(_whitenedBuffer, binHz);
                    peaksInput = _whitenedBuffer;
                }

                var peaks = PeakDetection.FindPeaks(peaksInput, _sampleRate, _settings);
                var tracked = _tracker.Update(peaks, _settings);

                _lastCandidates = BuildCandidates(tracked, _magDbBuffer, filterHarmonics);
                _lastRecs = RecommendationEngine.Recommend(_lastCandidates, _eq, bellBandsRequested);

                UpdateFreeze(_lastCandidates);

                // Advance read pointer
                _ringHead = (_ringHead + hopSize) % _ringBuffer.Length;
                _ringCount -= hopSize;
            }
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

            double roomScore = 0.0;
            if (_settings.Detection.ConfidenceWeights.RoomPrior > 0 && _roomPrior != null)
            {
                roomScore = _roomPrior.Evaluate(t.FrequencyHz, _settings.Detection.RoomPriorToleranceHz, _settings.Detection.RoomPriorLowGainThresholdDb);
            }

            var comps = FeedbackScoring.ScoreComponents(t, q, _settings, roomScore);
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

    private sealed class RoomPriorLookup
    {
        private readonly double[] _modeFreqs;
        private readonly (double Center, double Sg)[] _bandGains;

        public RoomPriorLookup(RoomPredictionResult result)
        {
            _modeFreqs = result.ModesBelowSchroeder.Select(m => m.FrequencyHz).OrderBy(f => f).ToArray();
            _bandGains = result.BandResults
                .Select(b => (b.FrequencyHz, b.SystemGainInUse))
                .OrderBy(b => b.FrequencyHz)
                .ToArray();
        }

        public double Evaluate(double freq, double tolHz, double lowGainThresh)
        {
            double score = 0.0;

            // 1. Mode Match
            // Binary search for closest mode
            int idx = Array.BinarySearch(_modeFreqs, freq);
            if (idx < 0) idx = ~idx;

            // Check neighbors
            bool match = false;
            if (idx < _modeFreqs.Length && Math.Abs(_modeFreqs[idx] - freq) <= tolHz) match = true;
            if (!match && idx > 0 && Math.Abs(_modeFreqs[idx - 1] - freq) <= tolHz) match = true;

            if (match) score += 0.5; // Base score for mode match

            // 2. Low Gain Penalty (High Risk)
            // Find band
            // Simple linear scan or assume octaves? Bands are few (6-10).
            double bandSg = 100.0;
            // Find closest band center
            double minDist = double.MaxValue;
            foreach (var (center, sg) in _bandGains)
            {
                 // Check if freq is within this band (approx octave or 1/3 octave)
                 // Or just interpolation?
                 // Prompt: "If band SG_in_use is low, add small score."
                 // Let's assume if freq is near band center.
                 // Octave bands cover range.
                 // Let's find nearest center.
                 double dist = Math.Abs(Math.Log2(freq / center));
                 if (dist < minDist)
                 {
                     minDist = dist;
                     bandSg = sg;
                 }
            }

            // If SG is low (e.g. < 0 or < threshold), boost score
            // If SG < threshold (e.g. 0dB), add 0.5
            if (bandSg < lowGainThresh) score += 0.5;

            return Math.Clamp(score, 0.0, 1.0);
        }
    }
}
