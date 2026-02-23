using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class FftTests
{
    [Fact]
    public void MagnitudeSpectrum_ReturnsCorrectSize()
    {
        var fft = new MathNetFft();
        int[] sizes = { 256, 512, 1024, 2048, 4096 };

        foreach (var n in sizes)
        {
            var input = new float[n];
            var output = fft.MagnitudeSpectrum(input);
            Assert.Equal(n / 2 + 1, output.Length);
        }
    }

    [Fact]
    public void MagnitudeSpectrum_ZeroInput_ReturnsZeroMagnitude()
    {
        var fft = new MathNetFft();
        var input = new float[1024];
        var output = fft.MagnitudeSpectrum(input);

        foreach (var val in output)
        {
            Assert.Equal(0, val, precision: 10);
        }
    }

    [Fact]
    public void MagnitudeSpectrum_Impulse_ReturnsFlatMagnitude()
    {
        var fft = new MathNetFft();
        int n = 1024;
        var input = new float[n];
        input[0] = 1.0f; // Impulse at t=0

        var output = fft.MagnitudeSpectrum(input);

        // For a unit impulse, the magnitude in each bin should be 1.0
        // because MathNet Matlab options uses no scaling on forward transform (sum)
        // Actually, let's verify what MathNet does.
        // FourierOptions.Matlab: No scaling on forward, 1/N on inverse.
        // So for an impulse of 1.0, the sum in each bin will be 1.0.

        foreach (var val in output)
        {
            Assert.Equal(1.0, val, precision: 5);
        }
    }

    [Fact]
    public void MagnitudeSpectrum_DcComponent_ReturnsPeakAtBinZero()
    {
        var fft = new MathNetFft();
        int n = 1024;
        var input = new float[n];
        for (int i = 0; i < n; i++) input[i] = 1.0f; // DC Offset

        var output = fft.MagnitudeSpectrum(input);

        // Peak at bin 0 should be N
        Assert.Equal(n, output[0], precision: 5);

        // Other bins should be zero
        for (int i = 1; i < output.Length; i++)
        {
            Assert.Equal(0, output[i], precision: 5);
        }
    }

    [Fact]
    public void MagnitudeSpectrum_SineWave_ReturnsPeakAtCorrectBin()
    {
        var fft = new MathNetFft();
        int n = 1024;
        int binIndex = 10;
        // A sine wave with frequency corresponding exactly to bin 10
        // freq = binIndex * SampleRate / n
        // We can just generate it as sin(2 * pi * binIndex * i / n)
        var input = new float[n];
        for (int i = 0; i < n; i++)
        {
            input[i] = (float)Math.Sin(2.0 * Math.PI * binIndex * i / n);
        }

        var output = fft.MagnitudeSpectrum(input);

        // Find the peak
        double maxVal = 0;
        int maxIndex = -1;
        for (int i = 0; i < output.Length; i++)
        {
            if (output[i] > maxVal)
            {
                maxVal = output[i];
                maxIndex = i;
            }
        }

        Assert.Equal(binIndex, maxIndex);

        // For a sine wave of amplitude 1.0, the magnitude at the bin should be N/2
        // because it's split between positive and negative frequencies, and we only keep positive.
        // MathNet Matlab doesn't scale, so it should be N/2.
        Assert.Equal(n / 2.0, output[binIndex], precision: 5);

        // Other bins (not adjacent to binIndex) should be very small
        for (int i = 0; i < output.Length; i++)
        {
            if (Math.Abs(i - binIndex) > 1)
            {
                Assert.True(output[i] < 1e-5, $"Bin {i} should be near zero but was {output[i]}");
            }
        }
    }
}
