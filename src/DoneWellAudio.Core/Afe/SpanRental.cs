using System;
using System.Buffers;

namespace DoneWellAudio.Core.Afe;

public ref struct SpanRental
{
    private readonly float[] _array;
    private readonly ArrayPool<float> _pool;
    public Span<float> Span { get; }

    public SpanRental(int minSize)
    {
        _pool = ArrayPool<float>.Shared;
        _array = _pool.Rent(minSize);
        Span = _array.AsSpan(0, minSize);
    }

    public void Dispose()
    {
        _pool.Return(_array);
    }
}
