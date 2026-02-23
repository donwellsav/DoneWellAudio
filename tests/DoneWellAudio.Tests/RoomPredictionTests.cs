using System;
using System.Collections.Generic;
using System.Linq;
using Xunit;
using DoneWellAudio.Core.RoomPrediction;
using DoneWellAudio.Core;

namespace DoneWellAudio.Tests;

public class RoomPredictionTests
{
    private readonly RoomAcousticsCalculator _calculator = new();

    [Fact]
    public void TestSmallRoomAcoustics_SabineEyring()
    {
        // Setup: 5x4x3 room, alpha=0.1 everywhere.
        var dims = new RoomDimensions(5, 4, 3);
        // V = 60 m3, S = 94 m2.

        var profile = new RoomProfile(
            "Test Room",
            dims,
            new Dictionary<string, double[]>
            {
                { "Floor", new[] { 0.1 } },
                { "Ceiling", new[] { 0.1 } },
                { "Walls", new[] { 0.1 } } // Simplified "Walls" logic in calculator
            },
            null, null, null,
            new ExplicitDistances(0.3, 2.0, 8.0, 8.0), // ds, r, d1, d3
            new[] { 1000.0 }
        );

        var result = _calculator.Calculate(profile);
        var band = result.BandResults.First();

        // Verification
        // A = 94 * 0.1 = 9.4
        Assert.Equal(9.4, band.TotalAbsorptionArea, 4);

        // alpha_bar = 0.1
        Assert.Equal(0.1, band.AverageAbsorption, 4);

        // RT60 Sabine = 0.161 * 60 / 9.4 = 1.02766
        Assert.Equal(1.0277, band.Rt60Sabine, 4);

        // RT60 Eyring = 0.161 * 60 / (-94 * ln(0.9))
        // ln(0.9) = -0.10536
        // Denom = 94 * 0.10536 = 9.90389
        // RT60 = 9.66 / 9.90389 = 0.9754
        Assert.Equal(0.9754, band.Rt60Eyring, 4);

        // R = 94 * 0.1 / 0.9 = 10.4444
        Assert.Equal(10.4444, band.RoomConstant, 4);

        // Dc = 0.14 * sqrt(1 * 10.4444) = 0.4525
        Assert.Equal(0.4525, band.CriticalDistance, 4);
    }

    [Fact]
    public void TestSystemGain_Boner()
    {
        // Using values derived manually
        // R = 10.4444
        // Q_t=2, Q_s=5 (Default in calculator)
        // ds=0.3, r=2.0, d1=8.0, d3=8.0

        // My manual calc resulted in SG ~ 6.53 dB.
        // Let's re-verify logic in code vs manual.
        // Delta(Q,x,R) = Lrel(1) - Lrel(x)
        // Lrel(Q,x,R) = 10log(Q/4pix2 + 4/R)

        // Term 1 (d3=8, Qt=2): Delta = 1.48
        // Term 2 (r=2, Qs=5): Delta = 2.10
        // Term 3 (ds=0.3, Qt=2): Delta = -5.98
        // Term 4 (d1=8, Qs=5): Delta = 3.03

        // SG = 1.48 + 2.10 - (-5.98) - 3.03 = 3.58 + 5.98 - 3.03 = 9.56 - 3.03 = 6.53.

        var dims = new RoomDimensions(5, 4, 3);
        var profile = new RoomProfile(
            "Test Room SG",
            dims,
            new Dictionary<string, double[]>
            {
                { "Floor", new[] { 0.1 } },
                { "Ceiling", new[] { 0.1 } },
                { "Walls", new[] { 0.1 } }
            },
            null, null, null,
            new ExplicitDistances(0.3, 2.0, 8.0, 8.0),
            new[] { 1000.0 }
        );

        var result = _calculator.Calculate(profile);
        var band = result.BandResults.First();

        Assert.Equal(6.53, band.SystemGainBeforeFeedback, 1); // Allow 0.1 dB variance
    }

    [Fact]
    public void TestModeEnumeration()
    {
        // Room 5x4x3
        // c = 343
        // Axial modes:
        // (1,0,0) -> f = 343/2 * sqrt(1/25) = 171.5 * 0.2 = 34.3 Hz
        // (0,1,0) -> f = 343/2 * sqrt(1/16) = 171.5 * 0.25 = 42.875 Hz
        // (0,0,1) -> f = 343/2 * sqrt(1/9) = 171.5 * 0.333 = 57.16 Hz

        var dims = new RoomDimensions(5, 4, 3);
        var profile = new RoomProfile(
            "Test Room Modes",
            dims,
            new Dictionary<string, double[]>(), // No absorption needed for modes
            null, null, null, null,
            new[] { 1000.0 }
        );

        var result = _calculator.Calculate(profile);
        var modes = result.ModesBelowSchroeder;

        Assert.Contains(modes, m => Math.Abs(m.FrequencyHz - 34.3) < 0.1);
        Assert.Contains(modes, m => Math.Abs(m.FrequencyHz - 42.875) < 0.1);
        Assert.Contains(modes, m => Math.Abs(m.FrequencyHz - 57.16) < 0.1);

        // Verify sorting
        Assert.True(modes.SequenceEqual(modes.OrderBy(m => m.FrequencyHz)));
    }

    [Fact]
    public void TestInvalidAbsorption_Clamping()
    {
        // Alpha > 1.0 shouldn't crash but be clamped or handled?
        // Code clamps alpha_bar to 0.99 if >= 0.99.
        var dims = new RoomDimensions(10, 10, 10);
        var profile = new RoomProfile(
            "Dead Room",
            dims,
            new Dictionary<string, double[]>
            {
                { "Floor", new[] { 1.5 } }, // Impossible > 1.0
                { "Ceiling", new[] { 1.0 } },
                { "Walls", new[] { 1.0 } }
            },
            null, null, null,
            new ExplicitDistances(1,1,1,1),
            new[] { 1000.0 }
        );

        var result = _calculator.Calculate(profile);
        var band = result.BandResults.First();

        Assert.Equal(0.99, band.AverageAbsorption); // Should clamp
        Assert.Contains("DiffuseFieldQuestionable", band.Warnings); // alpha > 0.2
    }
}
