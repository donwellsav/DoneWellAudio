using System;
using DoneWellAudio.Core.Afe;
using Xunit;

namespace DoneWellAudio.Tests.Afe;

public class DetectionTests
{
    [Fact]
    public void Ninos_ShouldDetectPureSineWave()
    {
        var config = new AfeConfig(48000, 256);
        using var detector = new NinosHowlingDetector(config);

        // Generate a pure sine wave at ~1kHz, aligned to bin center to avoid leakage
        // Bin width = 48000 / 512 = 93.75 Hz
        // Bin 11 = 1031.25 Hz
        float[] buffer = new float[256];
        float sampleRate = 48000;
        float freq = 1031.25f;

        // Feed enough history to fill Q_M
        int frames = config.HistoryFrames + 10;

        bool detected = false;
        float detectedFreq = 0;

        for (int i = 0; i < frames; i++)
        {
            for (int s = 0; s < 256; s++)
            {
                long globalIdx = i * 256 + s;
                buffer[s] = (float)Math.Sin(2.0 * Math.PI * freq * globalIdx / sampleRate);
            }

            if (detector.Detect(buffer, out float f, out float m))
            {
                detected = true;
                detectedFreq = f;
                break;
            }
        }

        Assert.True(detected, "Should detect feedback for pure sine wave.");
        Assert.InRange(detectedFreq, 950, 1050); // Allowing FFT bin quantization error
    }

    [Fact]
    public void Ninos_ShouldIgnoreWhiteNoise()
    {
        var config = new AfeConfig(48000, 256);
        using var detector = new NinosHowlingDetector(config);

        float[] buffer = new float[256];
        var rng = new Random(42);

        bool detected = false;

        for (int i = 0; i < 200; i++)
        {
            for (int s = 0; s < 256; s++)
            {
                buffer[s] = (float)(rng.NextDouble() * 2.0 - 1.0);
            }

            if (detector.Detect(buffer, out _, out _))
            {
                detected = true;
                break;
            }
        }

        Assert.False(detected, "Should NOT detect feedback in white noise.");
    }
}
