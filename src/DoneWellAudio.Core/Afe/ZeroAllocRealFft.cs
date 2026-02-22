using System;
using System.Buffers;
using System.Runtime.InteropServices;
using System.Numerics;

namespace DoneWellAudio.Core.Afe;

/// <summary>
/// A zero-allocation FFT implementation for real-valued signals.
/// Uses a precomputed twiddle factor table and operates on ArrayPool buffers.
/// </summary>
public sealed class ZeroAllocRealFft : IDisposable
{
    private readonly int _n;
    private readonly float[] _twiddleCos;
    private readonly float[] _twiddleSin;
    private readonly int[] _bitReverse;
    private readonly float[] _buffer;

    public ZeroAllocRealFft(int n)
    {
        if ((n & (n - 1)) != 0) throw new ArgumentException("N must be a power of 2");
        _n = n;

        _twiddleCos = new float[n / 2];
        _twiddleSin = new float[n / 2];
        _bitReverse = new int[n];
        _buffer = ArrayPool<float>.Shared.Rent(n * 2); // complex scratch space

        // Precompute Bit-Reversal
        int bits = (int)Math.Log2(n);
        for (int i = 0; i < n; i++)
        {
            int reversed = 0;
            for (int j = 0; j < bits; j++)
            {
                if ((i & (1 << j)) != 0)
                    reversed |= 1 << (bits - 1 - j);
            }
            _bitReverse[i] = reversed;
        }

        // Precompute Twiddle Factors
        for (int i = 0; i < n / 2; i++)
        {
            double angle = -2.0 * Math.PI * i / n;
            _twiddleCos[i] = (float)Math.Cos(angle);
            _twiddleSin[i] = (float)Math.Sin(angle);
        }
    }

    /// <summary>
    /// Computes the forward FFT of a real-valued input.
    /// Output is interleaved complex [Re0, Im0, Re1, Im1, ... Re(N/2), Im(N/2)]
    /// Note: Output buffer must be size N+2 (for Nyquist component).
    /// </summary>
    public void Forward(ReadOnlySpan<float> input, Span<float> outputComplex)
    {
        // Copy to scratch buffer in bit-reversed order
        for (int i = 0; i < _n; i++)
        {
            int rev = _bitReverse[i];
            _buffer[rev * 2] = input[i];
            _buffer[rev * 2 + 1] = 0;
        }

        // Cooley-Tukey Butterfly
        for (int size = 2; size <= _n; size *= 2)
        {
            int halfSize = size / 2;
            int step = _n / size;

            for (int i = 0; i < _n; i += size)
            {
                for (int j = 0; j < halfSize; j++)
                {
                    int k = j * step;
                    float wRe = _twiddleCos[k];
                    float wIm = _twiddleSin[k];

                    int evenIndex = (i + j) * 2;
                    int oddIndex = (i + j + halfSize) * 2;

                    float tRe = wRe * _buffer[oddIndex] - wIm * _buffer[oddIndex + 1];
                    float tIm = wRe * _buffer[oddIndex + 1] + wIm * _buffer[oddIndex];

                    float uRe = _buffer[evenIndex];
                    float uIm = _buffer[evenIndex + 1];

                    _buffer[evenIndex] = uRe + tRe;
                    _buffer[evenIndex + 1] = uIm + tIm;
                    _buffer[oddIndex] = uRe - tRe;
                    _buffer[oddIndex + 1] = uIm - tIm;
                }
            }
        }

        // Copy to output (N/2 + 1 complex values)
        // Since input is real, we only need the first N/2 + 1 bins.
        // Format: Re0, Im0, Re1, Im1 ... Re(N/2), Im(N/2)
        int outputSize = (_n / 2 + 1) * 2;
        if (outputComplex.Length < outputSize)
            throw new ArgumentException($"Output buffer too small. Need {outputSize}");

        new Span<float>(_buffer, 0, outputSize).CopyTo(outputComplex);
    }

    public void Dispose()
    {
        ArrayPool<float>.Shared.Return(_buffer);
    }
}
