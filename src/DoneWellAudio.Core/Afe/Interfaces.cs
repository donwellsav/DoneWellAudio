using System;

namespace DoneWellAudio.Core.Afe;

/// <summary>
///     The core interface for the Feedback Suppression Engine.
///     Implementations must be 100% allocation-free on the hot path.
/// </summary>
public interface IAudioPipeline : IDisposable
{
    /// <summary>
    ///     Processes a block of audio samples.
    ///     Input and Output buffers must be of the same length.
    ///     This method is realtime-safe and must not allocate.
    /// </summary>
    void Process(ReadOnlySpan<float> input, Span<float> output);

    /// <summary>
    ///     Resets the internal state (filters, history buffers) to initial conditions.
    /// </summary>
    void Reset();
}

/// <summary>
///     Layer 2: Howling Detection Engine interface.
/// </summary>
public interface IHowlingDetector
{
    /// <summary>
    ///     Analyzes the current audio frame for feedback.
    /// </summary>
    /// <param name="audioFrame">The time-domain audio frame (windowed).</param>
    /// <returns>True if feedback is detected and confirmed.</returns>
    bool Detect(ReadOnlySpan<float> audioFrame, out float frequency, out float magnitude);
}

/// <summary>
///     Layer 3: Notch Filter Bank interface.
/// </summary>
public interface INotchBank
{
    /// <summary>
    ///     Updates the notch filters based on the detection result.
    /// </summary>
    void Update(bool feedbackDetected, float frequency, float magnitude);

    /// <summary>
    ///     Applies the active notch filters to the audio buffer.
    /// </summary>
    void Apply(Span<float> buffer);
}

/// <summary>
///     Layer 4: Adaptive Feedback Cancellation interface.
/// </summary>
public interface IAdaptiveFilter
{
    /// <summary>
    ///     Predicts and subtracts the feedback component from the input signal.
    /// </summary>
    void CancelFeedback(ReadOnlySpan<float> input, Span<float> output);
}

/// <summary>
///     Layer 4: Rescue System interface (Noise Injection).
/// </summary>
public interface IRescueSystem
{
    /// <summary>
    ///     Injects white noise if the system is in rescue mode.
    /// </summary>
    /// <returns>True if noise was injected (pipeline should mute input).</returns>
    bool TryInjectNoise(Span<float> output);
}

public readonly struct AfeConfig
{
    public int SampleRate { get; init; }
    public int FrameSize { get; init; }
    public int DelaySamples { get; init; } // Layer 1

    // Detection Parameters
    public float DetectionThreshold { get; init; } // NINOS^2 Threshold
    public int HistoryFrames { get; init; } // Q_M

    public AfeConfig(int sampleRate = 48000, int frameSize = 256)
    {
        SampleRate = sampleRate;
        FrameSize = frameSize;
        DelaySamples = (int)(0.005 * sampleRate); // 5ms default
        DetectionThreshold = 0.85f;
        HistoryFrames = 96;
    }
}
