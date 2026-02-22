using System;

namespace DoneWellAudio.Core.Afe;

/// <summary>
///     The Master AFE Pipeline Processor.
///     Orchestrates Layers 1-4.
/// </summary>
public sealed class FeedbackSuppressionEngine : IAudioPipeline
{
    private readonly AfeConfig _config;

    // Components
    private readonly AfePreConditioner _layer1Delay;
    private readonly NinosHowlingDetector _layer2Detector;
    private readonly NotchFilterBank _layer3Notches;
    private readonly NlmsFilter _layer4Afc;
    private readonly RescueGainController _failsafeGain;

    // Metrics
    public bool IsHowling { get; private set; }
    public float DetectedFrequency { get; private set; }
    public float DetectedMagnitude { get; private set; }

    public FeedbackSuppressionEngine(AfeConfig config)
    {
        _config = config;

        // Initialize Layers
        _layer1Delay = new AfePreConditioner(config);
        _layer2Detector = new NinosHowlingDetector(config);
        _layer3Notches = new NotchFilterBank(config);
        _layer4Afc = new NlmsFilter(config);
        _failsafeGain = new RescueGainController();
    }

    public void Process(ReadOnlySpan<float> input, Span<float> output)
    {
        // Zero-Alloc Pipeline Execution Order

        // Step A: AFC (Layer 4 Proactive)
        // Subtracts feedback from Input.
        _layer4Afc.CancelFeedback(input, output);

        // Now `output` is our working signal (e.g., error signal e(n)).

        // Step B: Layer 1 Delay
        // Apply delay to `output`.
        // Processing in-place: Read from delay line, write previous output to delay line.
        _layer1Delay.Process(output, output);

        // Step C: VAD & Layer 2 Detection
        // Run detection on the *processed* signal (after AFC/Delay).
        // VAD Check: "Energy-based VAD".
        float energy = CalculateEnergy(output);
        bool silent = energy < 1e-8f; // Very quiet

        bool feedbackFound = false;
        float freq = 0;
        float mag = 0;

        if (!silent)
        {
            feedbackFound = _layer2Detector.Detect(output, out freq, out mag);
        }

        IsHowling = feedbackFound;
        DetectedFrequency = freq;
        DetectedMagnitude = mag;

        // Step D: Layer 3 Notch Updates
        // "Update Notch Banks (Merge/Deepen/Lift)"
        _layer3Notches.Update(feedbackFound, freq, mag);

        // Step E: Rescue Failsafe (Layer 4 React)
        // "If Layer 2 detects rampant multi-frequency howling... Inject Noise"
        // Heuristic: If magnitude is very high (>20dB power -> >10 linear amplitude?)
        // Or if multiple bins howl (not implemented in single return Detect).
        // For now, trigger rescue if feedback is persistent/strong despite notches.

        if (feedbackFound && mag > 100.0f) // Arbitrary high threshold for "Rampant"
        {
             _layer4Afc.TriggerRescue();
        }

        // Apply Rescue Gain (Broadband attenuation)
        _failsafeGain.Apply(output, feedbackFound);

        // Step F: Apply Notches (Layer 3)
        // "Apply Biquad Notches and Output"
        _layer3Notches.Apply(output);
    }

    private float CalculateEnergy(ReadOnlySpan<float> buffer)
    {
        float sum = 0;
        for (int i = 0; i < buffer.Length; i++)
        {
            sum += buffer[i] * buffer[i];
        }
        return sum / buffer.Length;
    }

    public void Reset()
    {
        // Reset not fully implemented on components yet, but infrastructure supports it.
        // For this task, we assume disposals clear state or new instance created.
    }

    public void Dispose()
    {
        _layer1Delay.Dispose();
        _layer2Detector.Dispose();
        _layer4Afc.Dispose();
    }
}
