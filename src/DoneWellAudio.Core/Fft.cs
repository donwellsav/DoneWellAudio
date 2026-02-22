using System.Numerics;
using MathNet.Numerics.IntegralTransforms;

namespace DoneWellAudio.Core;

public interface IFft
{
    /// <summary>Computes the magnitude spectrum (linear) for a real-valued input frame.</summary>
    double[] MagnitudeSpectrum(float[] realFrame);
}

public sealed class MathNetFft : IFft
{
    public double[] MagnitudeSpectrum(float[] realFrame)
    {
        int n = realFrame.Length;
        var complex = new Complex[n];
        for (int i = 0; i < n; i++)
            complex[i] = new Complex(realFrame[i], 0);

        Fourier.Forward(complex, FourierOptions.Matlab);

        // Only keep positive frequencies [0..n/2]
        int bins = n / 2 + 1;
        var mag = new double[bins];
        for (int i = 0; i < bins; i++)
        {
            mag[i] = complex[i].Magnitude;
        }
        return mag;
    }
}
