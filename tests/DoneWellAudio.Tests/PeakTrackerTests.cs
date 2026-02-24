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
    public void Update_DistributesPeaksToCorrectTracks_WhenClose()
    {
        // Regression test for accurate peak assignment
        var tracker = new PeakTracker();
        var settings = CreateSettings(maxFrequencyDriftHz: 20.0);

        // Frame 1: Single peak to establish a track
        var peaks1 = new[] { new Peak(1000.0, -10.0, 10.0) };
        var tracks1 = tracker.Update(peaks1, settings);

        Assert.Single(tracks1);

        // Frame 2: Two peaks close to the existing track
        var peaks2 = new[]
        {
            new Peak(995.0, -10.0, 10.0),
            new Peak(1005.0, -10.0, 10.0)
        };

        var tracks2 = tracker.Update(peaks2, settings);

        // Should result in 2 distinct tracks
        Assert.Equal(2, tracks2.Count);

        var freqs = tracks2.Select(t => t.FrequencyHz).OrderBy(f => f).ToArray();
        Assert.Equal(995.0, freqs[0], 0.1);
        Assert.Equal(1005.0, freqs[1], 0.1);
    }

    [Fact]
    public void Update_GreedyMatching_PicksBestMatch()
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

    [Fact]
    public void Update_RemovesStaleTracks_AfterGracePeriod()
    {
        var tracker = new PeakTracker();
        var settings = CreateSettings();

        // Frame 1: 1 peak
        tracker.Update(new[] { new Peak(1000.0, -10.0, 10.0) }, settings);

        // Frame 2-51: No peaks (50 frames of grace period)
        for (int i = 0; i < 50; i++)
        {
            var res = tracker.Update(Array.Empty<Peak>(), settings);
            Assert.Single(res); // Should persist
            Assert.Equal(0, res[0].ConsecutiveHits); // But consecutive hits reset
        }

        // Frame 52: Still no peaks -> Should be removed now (Misses > 50)
        var result = tracker.Update(Array.Empty<Peak>(), settings);
        Assert.Empty(result);
    }

    [Fact]
    public void Update_RespectsMaxDrift()
    {
        var tracker = new PeakTracker();
        var settings = CreateSettings(maxFrequencyDriftHz: 5.0); // 5Hz tolerance

        // Frame 1: 1000Hz
        var res1 = tracker.Update(new[] { new Peak(1000.0, -10.0, 10.0) }, settings);
        var id1 = res1[0].TrackId;

        // Frame 2: 1006Hz (distance 6Hz > 5Hz)
        // Should create NEW track. The old one (1000) is not updated, so it starts decaying but still exists.
        var result = tracker.Update(new[] { new Peak(1006.0, -10.0, 10.0) }, settings);

        // Expect: 2 tracks (1000 [decaying], 1006 [new]).
        Assert.Equal(2, result.Count);

        var freqs = result.Select(t => t.FrequencyHz).OrderBy(f => f).ToArray();
        Assert.Equal(1000.0, freqs[0], 0.1);
        Assert.Equal(1006.0, freqs[1], 0.1);

        // Verify new track has new ID
        var newTrack = result.First(t => t.FrequencyHz > 1005);
        Assert.NotEqual(id1, newTrack.TrackId);
    }

    [Fact]
    public void Update_CalculatesStatistics_Correctly()
    {
        var tracker = new PeakTracker();
        var settings = CreateSettings();

        // Frame 1: 1000Hz
        tracker.Update(new[] { new Peak(1000.0, -10.0, 10.0) }, settings);

        // Frame 2: 1002Hz
        var res = tracker.Update(new[] { new Peak(1002.0, -10.0, 10.0) }, settings);

        var track = res[0];
        Assert.Equal(2, track.TotalHits);
        // Variance calc: Mean=1001. Delta1=0 (start).
        // Welford:
        // 1. x=1000. mean=1000. m2=0.
        // 2. x=1002. delta=2. mean=1001. delta2=1. m2+=2*1=2.
        // StdDev = sqrt(2 / 1) = 1.414
        Assert.Equal(1.414, track.FrequencyStdDevHz, 0.001);
    }
}
