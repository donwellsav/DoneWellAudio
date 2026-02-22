using System;

namespace DoneWellAudio.Core.Afe;

/// <summary>
///     Layer 1: Pre-Conditioning & Decorrelation (Entrainment Prevention)
///     Applies a static delay to the forward path.
/// </summary>
public sealed class AfePreConditioner : IDisposable
{
    private readonly RingBuffer _delayLine;
    private readonly int _delaySamples;

    public bool Enabled { get; set; } = true;

    public AfePreConditioner(AfeConfig config)
    {
        _delaySamples = config.DelaySamples;
        // Allocate enough for delay + 1 frame
        _delayLine = new RingBuffer(_delaySamples + config.FrameSize * 2);
    }

    public void Process(ReadOnlySpan<float> input, Span<float> output)
    {
        if (!Enabled || _delaySamples == 0)
        {
            input.CopyTo(output);
            return;
        }

        _delayLine.Write(input);
        _delayLine.Read(output, _delaySamples);
    }

    public void Dispose()
    {
        _delayLine.Dispose();
    }
}
