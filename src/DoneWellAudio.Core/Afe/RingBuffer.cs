using System;
using System.Buffers;
using System.Runtime.InteropServices;

namespace DoneWellAudio.Core.Afe;

/// <summary>
/// A zero-allocation circular buffer for audio delay and history.
/// </summary>
public sealed class RingBuffer : IDisposable
{
    private readonly float[] _buffer;
    private int _head;
    private readonly int _mask;

    public RingBuffer(int capacity)
    {
        // Enforce power of 2 for fast masking
        int powerOf2 = 1;
        while (powerOf2 < capacity) powerOf2 <<= 1;
        _buffer = ArrayPool<float>.Shared.Rent(powerOf2);
        _mask = powerOf2 - 1;
        _head = 0;
    }

    public void Write(ReadOnlySpan<float> input)
    {
        for (int i = 0; i < input.Length; i++)
        {
            _buffer[_head & _mask] = input[i];
            _head++;
        }
    }

    public void Read(Span<float> output, int delaySamples)
    {
        int readIndex = _head - delaySamples;
        for (int i = 0; i < output.Length; i++)
        {
            output[i] = _buffer[readIndex & _mask];
            readIndex++;
        }
    }

    // For random access (e.g., getting history frames for NINOS)
    public float this[int offsetFromHead]
    {
        get => _buffer[(_head - 1 - offsetFromHead) & _mask];
    }

    public void Dispose()
    {
        ArrayPool<float>.Shared.Return(_buffer);
    }
}
