using System.Collections.Immutable;
using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class PeakTrackerTests
{
    private static DetectorSettings CreateSettings(double maxFrequencyDriftHz = 10.0)
    {
        return new DetectorSettings(
            Version: 1,
            Audio: new AudioSettings(FrameSize: 4096, HopSize: 1024, MinFrequencyHz: 50, MaxFrequencyHz: 8000),
            Detection: new DetectionSettings(
                LocalNeighborhoodBins: 12,
                MinProminenceDb: 6.0,
                MinEstimatedQ: 4.0,
                MaxEstimatedQ: 150.0,
                MaxFrequencyDriftHz: maxFrequencyDriftHz,
                MinPersistenceFrames: 6,
                ConfidenceWeights: new ConfidenceWeights(0.35, 0.35, 0.20, 0.10)
            ),
            FreezePolicy: new FreezePolicy(Enabled: false, ConfidenceThreshold: 0.8, ConsecutiveFramesAboveThreshold: 8, StopCaptureOnFreeze: false),
            Ui: new UiSettings(UpdateHz: 15)
        );
    }

    [Fact]
    public void MultiplePeaks_UpdateSameTrack_BugReproduction()
    {
        var tracker = new PeakTracker();
        var settings = CreateSettings(maxFrequencyDriftHz: 20.0);

        // Frame 1: Single peak to establish a track
        var peaks1 = new[] { new Peak(1000.0, -10.0, 10.0) };
        var tracks1 = tracker.Update(peaks1, settings);

        Assert.Single(tracks1);
        var originalTrackId = tracks1[0].TrackId;

        // Frame 2: Two peaks close to the existing track
        // Peak A at 995Hz (distance 5Hz)
        // Peak B at 1005Hz (distance 5Hz)
        // Both within 20Hz tolerance
        var peaks2 = new[]
        {
            new Peak(995.0, -10.0, 10.0),
            new Peak(1005.0, -10.0, 10.0)
        };

        var tracks2 = tracker.Update(peaks2, settings);

        // Current behavior (BUG): Both peaks match the same track sequentially.
        // Peak 995 matches Track(1000) -> updates Track to 995.
        // Peak 1005 matches Track(995) (dist 10) -> updates Track to 1005.
        // Result: 1 track at 1005. Ideally: 2 tracks (one at 995, one at 1005).

        // Assert that we have 2 distinct tracks if logic is correct
        Assert.Equal(2, tracks2.Count);

        // Verify frequencies are correct
        var freqs = tracks2.Select(t => t.FrequencyHz).OrderBy(f => f).ToArray();
        Assert.Equal(995.0, freqs[0], 0.1);
        Assert.Equal(1005.0, freqs[1], 0.1);
    }

    [Fact]
    public void GreedyMatching_PicksBestMatch()
    {
        var tracker = new PeakTracker();
        var settings = CreateSettings(maxFrequencyDriftHz: 20.0);

        // Frame 1: Two tracks
        var peaks1 = new[] { new Peak(1000.0, -10.0, 10.0), new Peak(2000.0, -10.0, 10.0) };
        var tracks1 = tracker.Update(peaks1, settings);
        Assert.Equal(2, tracks1.Count);

        // Frame 2:
        // Peak A at 1002 (close to 1000)
        // Peak B at 1998 (close to 2000)
        // Peak C at 1010 (farther from 1000, but within tolerance)
        // Ideally: A->1000, B->2000, C->New
        var peaks2 = new[]
        {
            new Peak(1002.0, -10.0, 10.0),
            new Peak(1998.0, -10.0, 10.0),
            new Peak(1010.0, -10.0, 10.0)
        };

        var tracks2 = tracker.Update(peaks2, settings);

        Assert.Equal(3, tracks2.Count); // 2 existing updated + 1 new

        var freqs = tracks2.Select(t => t.FrequencyHz).OrderBy(f => f).ToArray();
        Assert.Equal(1002.0, freqs[0], 0.1);
        Assert.Equal(1010.0, freqs[1], 0.1);
        Assert.Equal(1998.0, freqs[2], 0.1);
    }
}
