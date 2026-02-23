using System;
using System.Linq;
using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class PinkNoiseTests
{
    private static DetectorSettings CreateSettings(bool whitening)
    {
        return new DetectorSettings(
            Version: 1,
            Audio: new AudioSettings(FrameSize: 2048, HopSize: 512, MinFrequencyHz: 20, MaxFrequencyHz: 20000),
            Detection: new DetectionSettings(
                LocalNeighborhoodBins: 4,
                MinProminenceDb: 0.1, // Low threshold
                MinEstimatedQ: 0.1,
                MaxEstimatedQ: 1000,
                MaxFrequencyDriftHz: 10,
                MinPersistenceFrames: 0,
                ConfidenceWeights: new ConfidenceWeights(1, 1, 1, 1)
            ),
            FreezePolicy: new FreezePolicy(false, 0, 0, false),
            Ui: new UiSettings(10),
            ContinuousMode: false,
            Sensitivity: SensitivityLevel.Medium,
            ResponseSpeed: ResponseSpeed.Medium,
            SpectralWhitening: whitening
        );
    }

    [Fact]
    public void SpectralWhitening_FlattensPinkNoise()
    {
        // Setup
        int n = 1024;
        double sampleRate = 48000;
        double binHz = sampleRate / ((n - 1) * 2);

        // Create 1/sqrt(f) magnitude (Pink Noise)
        double[] mag = new double[n];
        // Inject two "spikes" that have EQUAL power in the Pink Noise domain.
        // Peak A: 100 Hz
        // Peak B: 1000 Hz
        // Magnitude = 1/sqrt(f) * K.
        // If we set K=1, then after compensation they should both be ~0dB (plus arbitrary offset).

        int i1 = (int)(100 / binHz);
        int i2 = (int)(1000 / binHz);

        for (int i = 0; i < n; i++) mag[i] = 1e-9; // noise floor

        mag[i1] = 1.0 / Math.Sqrt(i1 * binHz);
        mag[i2] = 1.0 / Math.Sqrt(i2 * binHz);

        // Convert to dB
        var magDb = PeakDetection.ConvertToDb(mag);

        // 1. Run WITHOUT whitening
        var settingsNo = CreateSettings(false);
        var peaksNo = PeakDetection.FindPeaks(magDb, (int)sampleRate, settingsNo);
        var p1No = peaksNo.FirstOrDefault(p => Math.Abs(p.FrequencyHz - i1 * binHz) < 1);
        var p2No = peaksNo.FirstOrDefault(p => Math.Abs(p.FrequencyHz - i2 * binHz) < 1);

        Assert.NotNull(p1No);
        Assert.NotNull(p2No);

        // Without whitening, low freq (100Hz) should be MUCH louder than high freq (1000Hz).
        // 10x freq difference => -10dB difference in 1/sqrt(f) power (20log10).
        // Check that p1No > p2No by approx 10dB
        double diffNo = p1No.MagnitudeDb - p2No.MagnitudeDb;
        Assert.True(diffNo > 8.0, $"Expected > 8dB difference without whitening, got {diffNo:0.0} dB");

        // 2. Run WITH whitening
        var settingsYes = CreateSettings(true);
        // Create copy for whitening
        var magDbWhite = magDb.ToArray();
        PeakDetection.ApplyWhitening(magDbWhite, binHz);
        var peaksYes = PeakDetection.FindPeaks(magDbWhite, (int)sampleRate, settingsYes);
        var p1Yes = peaksYes.FirstOrDefault(p => Math.Abs(p.FrequencyHz - i1 * binHz) < 1);
        var p2Yes = peaksYes.FirstOrDefault(p => Math.Abs(p.FrequencyHz - i2 * binHz) < 1);

        Assert.NotNull(p1Yes);
        Assert.NotNull(p2Yes);

        // With whitening, they should be roughly equal.
        double diffYes = Math.Abs(p1Yes.MagnitudeDb - p2Yes.MagnitudeDb);
        Assert.True(diffYes < 1.0, $"Expected < 1dB difference with whitening, got {diffYes:0.0} dB");
    }
}
