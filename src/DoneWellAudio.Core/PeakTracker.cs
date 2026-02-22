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

        // mark all tracks as not updated
        var updated = new HashSet<Guid>();

        foreach (var p in peaks)
        {
            // find nearest track
            TrackState? best = null;
            double bestDist = double.MaxValue;

            foreach (var t in _tracks)
            {
                double dist = Math.Abs(t.FrequencyHz - p.FrequencyHz);
                if (dist < bestDist)
                {
                    bestDist = dist;
                    best = t;
                }
            }

            if (best is not null && bestDist <= toleranceHz)
            {
                best.FrequencyHz = p.FrequencyHz;
                best.MagnitudeDb = p.MagnitudeDb;
                best.ProminenceDb = p.ProminenceDb;
                best.ConsecutiveHits += 1;
                best.UpdateFrequencyStats(p.FrequencyHz);
                updated.Add(best.Id);
            }
            else
            {
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
                updated.Add(t.Id);
            }
        }

        // decay tracks not updated this frame
        foreach (var t in _tracks)
        {
            if (!updated.Contains(t.Id))
                t.ConsecutiveHits = 0;
        }

        // prune very old/weak tracks (simple)
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
