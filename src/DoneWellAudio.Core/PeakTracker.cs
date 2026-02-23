namespace DoneWellAudio.Core;

internal sealed class TrackState
{
    public Guid Id { get; } = Guid.NewGuid();
    public double FrequencyHz { get; set; }
    public double MagnitudeDb { get; set; }
    public double ProminenceDb { get; set; }
    public int TotalHits { get; set; }
    public int ConsecutiveHits { get; set; }

    // Online variance for frequency stability
    private double _mean;
    private double _m2;

    public void UpdateFrequencyStats(double f)
    {
        TotalHits++;
        double delta = f - _mean;
        _mean += delta / TotalHits;
        double delta2 = f - _mean;
        _m2 += delta * delta2;
    }

    public double FrequencyStdDevHz => TotalHits < 2 ? 0 : Math.Sqrt(_m2 / (TotalHits - 1));
    public double MeanHz => _mean;
}

public sealed class PeakTracker
{
    private readonly List<TrackState> _tracks = new();

    public IReadOnlyList<TrackedPeak> Update(IEnumerable<Peak> peaks, DetectorSettings settings)
    {
        double toleranceHz = settings.Detection.MaxFrequencyDriftHz;
        var peakList = peaks.ToList();

        // 1. Calculate all valid distances between peaks and existing tracks
        var matches = new List<(int PeakIndex, int TrackIndex, double Distance)>();
        for (int i = 0; i < peakList.Count; i++)
        {
            for (int j = 0; j < _tracks.Count; j++)
            {
                double dist = Math.Abs(peakList[i].FrequencyHz - _tracks[j].FrequencyHz);
                if (dist <= toleranceHz)
                {
                    matches.Add((i, j, dist));
                }
            }
        }

        // 2. Sort matches by distance (ascending) for greedy assignment
        matches.Sort((a, b) => a.Distance.CompareTo(b.Distance));

        var usedPeaks = new bool[peakList.Count];
        var usedTracks = new bool[_tracks.Count];
        var updatedTrackIds = new HashSet<Guid>();

        // 3. Assign peaks to tracks greedily
        foreach (var (pIdx, tIdx, _) in matches)
        {
            if (!usedPeaks[pIdx] && !usedTracks[tIdx])
            {
                usedPeaks[pIdx] = true;
                usedTracks[tIdx] = true;

                var track = _tracks[tIdx];
                var peak = peakList[pIdx];

                track.FrequencyHz = peak.FrequencyHz;
                track.MagnitudeDb = peak.MagnitudeDb;
                track.ProminenceDb = peak.ProminenceDb;
                track.ConsecutiveHits++;
                track.UpdateFrequencyStats(peak.FrequencyHz);
                updatedTrackIds.Add(track.Id);
            }
        }

        // 4. Create new tracks for any unassigned peaks
        for (int i = 0; i < peakList.Count; i++)
        {
            if (!usedPeaks[i])
            {
                var p = peakList[i];
                var t = new TrackState
                {
                    FrequencyHz = p.FrequencyHz,
                    MagnitudeDb = p.MagnitudeDb,
                    ProminenceDb = p.ProminenceDb,
                    TotalHits = 0,
                    ConsecutiveHits = 1
                };
                t.UpdateFrequencyStats(p.FrequencyHz);
                _tracks.Add(t);
                updatedTrackIds.Add(t.Id);
            }
        }

        // 5. Decay tracks not updated this frame
        foreach (var t in _tracks)
        {
            if (!updatedTrackIds.Contains(t.Id))
                t.ConsecutiveHits = 0;
        }

        // 6. Prune very old/weak tracks (simple)
        _tracks.RemoveAll(t => t.TotalHits == 0);

        return _tracks
            .Select(t => new TrackedPeak(
                t.Id,
                t.FrequencyHz,
                t.MagnitudeDb,
                t.ProminenceDb,
                t.TotalHits,
                t.ConsecutiveHits,
                t.FrequencyStdDevHz))
            .OrderByDescending(tp => tp.ProminenceDb)
            .ToList();
    }

    public void Reset() => _tracks.Clear();
}
