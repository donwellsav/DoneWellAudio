using System;

namespace DoneWellAudio.Core.Afe;

/// <summary>
///     An optimized 2nd-order IIR Biquad filter structure.
///     Direct Form II Transposed implementation.
/// </summary>
public struct BiquadFilter
{
    // Coefficients (Normalized by a0)
    private float b0, b1, b2, a1, a2;

    // State
    private float z1, z2;

    // Metadata
    public bool Active;
    public float CenterFrequency;
    public float Q;
    public float GainDb;
    public int AgeFrames;

    public void Reset()
    {
        z1 = 0;
        z2 = 0;
        Active = false;
        AgeFrames = 0;
        GainDb = 0;
    }

    public float Process(float input)
    {
        if (!Active) return input;

        // Direct Form II Transposed Difference Equation
        // y[n] = b0*x[n] + z1[n-1]
        // z1[n] = b1*x[n] - a1*y[n] + z2[n-1]
        // z2[n] = b2*x[n] - a2*y[n]

        float y = b0 * input + z1;
        z1 = b1 * input - a1 * y + z2;
        z2 = b2 * input - a2 * y;

        return y;
    }

    /// <summary>
    ///     Configures the filter as a Peaking EQ (Bell) for precise attenuation.
    ///     Using RBJ Audio EQ Cookbook formulas.
    /// </summary>
    public void SetPeaking(float frequency, float sampleRate, float q, float gainDb)
    {
        CenterFrequency = frequency;
        Q = q;
        GainDb = gainDb;
        Active = true;
        // Age is managed by the Bank, don't reset here necessarily,
        // but typically a re-configure resets age.

        double w0 = 2.0 * Math.PI * frequency / sampleRate;
        double cosW0 = Math.Cos(w0);
        double sinW0 = Math.Sin(w0);
        double alpha = sinW0 / (2.0 * q);

        // A = 10^(dB/40) for Peaking EQ
        double A = Math.Pow(10.0, gainDb / 40.0);

        double b0_d = 1.0 + alpha * A;
        double b1_d = -2.0 * cosW0;
        double b2_d = 1.0 - alpha * A;
        double a0_d = 1.0 + alpha / A;
        double a1_d = -2.0 * cosW0;
        double a2_d = 1.0 - alpha / A;

        float invA0 = (float)(1.0 / a0_d);

        b0 = (float)(b0_d * invA0);
        b1 = (float)(b1_d * invA0);
        b2 = (float)(b2_d * invA0);
        a1 = (float)(a1_d * invA0);
        a2 = (float)(a2_d * invA0);
    }
}
