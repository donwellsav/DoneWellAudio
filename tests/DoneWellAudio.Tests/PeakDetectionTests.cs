using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class PeakDetectionTests
{
    [Fact]
    public void EstimateQ_StandardPeak_ReturnsExpectedQ()
    {
        // Arrange
        int length = 20;
        double[] magDb = new double[length];
        // Initialize all to -20 dB
        Array.Fill(magDb, -20.0);

        int peakIndex = 10;
        double binHz = 10.0;
        double dropDb = 6.0;

        // Peak at 0 dB
        magDb[peakIndex] = 0.0;
        // Neighbors at -3 dB (above -6 threshold)
        magDb[peakIndex - 1] = -3.0;
        magDb[peakIndex + 1] = -3.0;
        // Next neighbors at -7 dB (below -6 threshold)
        magDb[peakIndex - 2] = -7.0;
        magDb[peakIndex + 2] = -7.0;

        // Expected:
        // Target = -6 dB.
        // Left scan: 10 -> 9 (> -6) -> 8 (<= -6). Stops at 8.
        // Right scan: 10 -> 11 (> -6) -> 12 (<= -6). Stops at 12.
        // Bandwidth = (12 - 8) * binHz = 4 * 10 = 40 Hz.
        // f0 = 10 * 10 = 100 Hz.
        // Q = 100 / 40 = 2.5.

        // Act
        double q = PeakDetection.EstimateQFromDbCurve(magDb, peakIndex, binHz, dropDb);

        // Assert
        Assert.Equal(2.5, q, 6);
    }

    [Fact]
    public void EstimateQ_NarrowPeak_ReturnsMinBandwidth()
    {
        // Arrange
        int length = 20;
        double[] magDb = new double[length];
        Array.Fill(magDb, -20.0);

        int peakIndex = 10;
        double binHz = 5.0;
        double dropDb = 6.0;

        // Peak at 0 dB
        magDb[peakIndex] = 0.0;
        // Immediate neighbors at -7 dB (below threshold)
        magDb[peakIndex - 1] = -7.0;
        magDb[peakIndex + 1] = -7.0;

        // Expected:
        // Left scan: 10 -> 9 (<= -6). Stops at 9.
        // Right scan: 10 -> 11 (<= -6). Stops at 11.
        // Bandwidth = (11 - 9) * binHz = 2 * 5 = 10 Hz.
        // f0 = 10 * 5 = 50 Hz.
        // Q = 50 / 10 = 5.0.

        // Act
        double q = PeakDetection.EstimateQFromDbCurve(magDb, peakIndex, binHz, dropDb);

        // Assert
        Assert.Equal(5.0, q, 6);
    }

    [Fact]
    public void EstimateQ_AsymmetricPeak_ReturnsCorrectWidth()
    {
        // Arrange
        int length = 20;
        double[] magDb = new double[length];
        Array.Fill(magDb, -20.0);

        int peakIndex = 10;
        double binHz = 1.0;
        double dropDb = 6.0;

        magDb[peakIndex] = 0.0;

        // Left side drops quickly
        magDb[peakIndex - 1] = -3.0;
        magDb[peakIndex - 2] = -7.0; // Left boundary at 8

        // Right side drops slowly
        magDb[peakIndex + 1] = -2.0;
        magDb[peakIndex + 2] = -4.0;
        magDb[peakIndex + 3] = -7.0; // Right boundary at 13

        // Expected:
        // Left stops at 8.
        // Right stops at 13.
        // Width = 13 - 8 = 5 bins.
        // Q = 10 / 5 = 2.0.

        // Act
        double q = PeakDetection.EstimateQFromDbCurve(magDb, peakIndex, binHz, dropDb);

        // Assert
        Assert.Equal(2.0, q, 6);
    }

    [Fact]
    public void EstimateQ_WidePeak_ClampsToArrayBounds()
    {
        // Arrange
        int length = 20;
        double[] magDb = new double[length];
        // All values above threshold
        Array.Fill(magDb, 0.0);

        int peakIndex = 10;
        double binHz = 1.0;
        double dropDb = 6.0; // Target -6. All are 0 > -6.

        // Expected:
        // Left scan: clamped to index 1.
        // Right scan: clamped to length - 2 = 18.
        // Width = 18 - 1 = 17 bins.
        // f0 = 10.
        // Q = 10 / 17.

        // Act
        double q = PeakDetection.EstimateQFromDbCurve(magDb, peakIndex, binHz, dropDb);

        // Assert
        Assert.Equal(10.0 / 17.0, q, 6);
    }

    [Fact]
    public void EstimateQ_CustomDropDb_AdjustsThreshold()
    {
        // Arrange
        int length = 20;
        double[] magDb = new double[length];
        Array.Fill(magDb, -20.0);

        int peakIndex = 10;
        double binHz = 1.0;

        magDb[peakIndex] = 0.0;
        magDb[peakIndex - 1] = -5.0;
        magDb[peakIndex + 1] = -5.0;
        magDb[peakIndex - 2] = -10.0;
        magDb[peakIndex + 2] = -10.0;

        // Case 1: dropDb = 4.0. Target = -4.0.
        // Neighbors -5 < -4.
        // Width = (11 - 9) = 2.
        double q1 = PeakDetection.EstimateQFromDbCurve(magDb, peakIndex, binHz, 4.0);
        Assert.Equal(10.0 / 2.0, q1, 6);

        // Case 2: dropDb = 8.0. Target = -8.0.
        // Neighbors -5 > -8. Next -10 < -8.
        // Width = (12 - 8) = 4.
        double q2 = PeakDetection.EstimateQFromDbCurve(magDb, peakIndex, binHz, 8.0);
        Assert.Equal(10.0 / 4.0, q2, 6);
    }

    [Fact]
    public void EstimateQ_SmallBinHz_HandlesGracefully()
    {
        // Arrange
        double[] magDb = new double[20];
        Array.Fill(magDb, -20.0);
        magDb[10] = 0;
        magDb[9] = -10;
        magDb[11] = -10; // width 2 bins

        double binHz = 1e-6; // Very small positive bin size

        // Act
        double q = PeakDetection.EstimateQFromDbCurve(magDb, 10, binHz);

        // Assert
        // Q = (10 * 1e-6) / (2 * 1e-6) = 5.
        Assert.Equal(5.0, q, 6);
    }

    [Fact]
    public void ApplyWhitening_CalculatesCorrectly()
    {
        int length = 100;
        double binHz = 10.0;
        double[] magDb = new double[length];

        // Fill with 0
        Array.Fill(magDb, 0.0);

        // Expected
        double[] expected = new double[length];
        Array.Fill(expected, 0.0);
        for (int i = 1; i < length; i++)
        {
            double f = i * binHz;
            if (f > 1.0)
                expected[i] += 10.0 * Math.Log10(f);
        }

        PeakDetection.ApplyWhitening(magDb, binHz);

        for (int i = 0; i < length; i++)
        {
            Assert.Equal(expected[i], magDb[i], 5);
        }
    }

    [Fact]
    public void ApplyWhitening_WithCurve_CalculatesCorrectly()
    {
        int length = 100;
        double binHz = 10.0;
        double[] magDb = new double[length];
        double[] curve = new double[length];

        // Prepare curve
        for (int i = 1; i < length; i++)
        {
            double f = i * binHz;
            if (f > 1.0)
                curve[i] = 10.0 * Math.Log10(f);
        }

        // Fill magDb with 0
        Array.Fill(magDb, 0.0);

        PeakDetection.ApplyWhitening(magDb, curve);

        for (int i = 0; i < length; i++)
        {
            Assert.Equal(curve[i], magDb[i], 5);
        }
    }

    [Fact]
    public void ComputeWhiteningCurve_GeneratesCorrectValues()
    {
        int length = 50;
        double binHz = 2.0;
        double[] curve = new double[length];

        PeakDetection.ComputeWhiteningCurve(curve, binHz);

        for (int i = 0; i < length; i++)
        {
            double f = i * binHz;
            double expected = (f > 1.0) ? 10.0 * Math.Log10(f) : 0.0;
            Assert.Equal(expected, curve[i], 5);
        }
    }
}
