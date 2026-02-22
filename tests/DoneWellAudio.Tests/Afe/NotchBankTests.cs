using System;
using DoneWellAudio.Core.Afe;
using Xunit;

namespace DoneWellAudio.Tests.Afe;

public class NotchBankTests
{
    [Fact]
    public void NotchBank_ShouldCreateFilterOnUpdate()
    {
        var config = new AfeConfig(48000, 256);
        var bank = new NotchFilterBank(config);

        // Feed detection
        bank.Update(true, 1000.0f, 10.0f);

        // Check if filter is active by passing signal through it
        // High Q filter needs settling time.
        // Q=116 means significant ringing.
        // We need ~1 second of audio to ensure steady state.
        int nSamples = 48000;
        float[] buffer = new float[nSamples];
        for (int i = 0; i < nSamples; i++)
        {
            buffer[i] = (float)Math.Sin(2.0 * Math.PI * 1000.0 * i / 48000.0);
        }

        float inputRms = CalculateRms(buffer.AsSpan(nSamples - 1000, 1000).ToArray());

        bank.Apply(buffer);

        float outputRms = CalculateRms(buffer.AsSpan(nSamples - 1000, 1000).ToArray());

        // Should attenuate significantly at 1kHz
        Assert.True(outputRms < inputRms * 0.9f, "Notch filter should attenuate signal at Fc.");
    }

    [Fact]
    public void NotchBank_ShouldMergeNearbyFilters()
    {
        var config = new AfeConfig(48000, 256);
        var bank = new NotchFilterBank(config);

        // Trigger filter at 1000 Hz
        bank.Update(true, 1000.0f, 10.0f);

        // Trigger filter at 1004 Hz (within 6 Hz)
        bank.Update(true, 1004.0f, 10.0f);

        // Merged filter at 1002 Hz.
        // Q=50 for merged filter (lower Q, faster settling).

        int nSamples = 48000;
        float[] buffer = new float[nSamples];
        for (int i = 0; i < nSamples; i++)
        {
            buffer[i] = (float)Math.Sin(2.0 * Math.PI * 1002.0 * i / 48000.0);
        }

        float inputRms = CalculateRms(buffer.AsSpan(nSamples - 1000, 1000).ToArray());
        bank.Apply(buffer);
        float outputRms = CalculateRms(buffer.AsSpan(nSamples - 1000, 1000).ToArray());

        Assert.True(outputRms < inputRms * 0.8f, "Merged filter should exist at mean frequency.");
    }

    private float CalculateRms(float[] buffer)
    {
        float sum = 0;
        foreach (float f in buffer) sum += f * f;
        return (float)Math.Sqrt(sum / buffer.Length);
    }
}
