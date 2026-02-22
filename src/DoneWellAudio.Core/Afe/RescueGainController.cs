using System;

namespace DoneWellAudio.Core.Afe;

/// <summary>
///     Broadband Rescue Gain Controller.
///     Acts as a safety limiter when feedback escapes other layers.
/// </summary>
public sealed class RescueGainController
{
    private float _currentGain = 1.0f;
    private const float MinGain = 0.1f; // -20dB
    private const float Attack = 0.9f;  // Fast drop
    private const float Release = 0.0005f; // Slow recovery

    public void Apply(Span<float> buffer, bool feedbackDetected)
    {
        if (feedbackDetected)
        {
            // Drop gain fast
            _currentGain *= Attack;
            if (_currentGain < MinGain) _currentGain = MinGain;
        }
        else
        {
            // Recover slowly
            if (_currentGain < 1.0f)
            {
                _currentGain += Release;
                if (_currentGain > 1.0f) _currentGain = 1.0f;
            }
        }

        // Apply gain
        for (int i = 0; i < buffer.Length; i++)
        {
            buffer[i] *= _currentGain;
        }
    }
}
