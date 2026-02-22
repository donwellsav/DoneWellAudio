using System;

namespace DoneWellAudio.Core.Afe;

/// <summary>
///     Layer 3: Notch Filter Bank Manager
/// </summary>
public sealed class NotchFilterBank : INotchBank
{
    private const int MaxFilters = 16;
    private readonly BiquadFilter[] _filters;
    private readonly AfeConfig _config;

    // Parameters per prompt
    private const float DefaultQ = 116.0f; // 1/80th octave
    private const float InitialCutDb = -3.0f;
    private const float DeepCutDb = -9.0f;
    private const float MergeThresholdHz = 6.0f;
    private const float MergedQ = 50.0f;
    private const int LiftThresholdFrames = 3000;

    public NotchFilterBank(AfeConfig config)
    {
        _config = config;
        _filters = new BiquadFilter[MaxFilters];
        for (int i = 0; i < MaxFilters; i++)
        {
            _filters[i].Reset();
        }
    }

    public void Update(bool feedbackDetected, float frequency, float magnitude)
    {
        // 1. Live Filter Lift (Timer Mechanism)
        // Need to iterate by reference to modify AgeFrames
        for (int i = 0; i < MaxFilters; i++)
        {
            ref BiquadFilter f = ref _filters[i];

            if (f.Active)
            {
                f.AgeFrames++;
                if (f.AgeFrames > LiftThresholdFrames)
                {
                    // Slowly increment back to 0dB (Lift)
                    float newGain = f.GainDb + 0.1f;
                    if (newGain >= 0)
                    {
                        f.Reset(); // Release entirely
                    }
                    else
                    {
                        // Update coeff with shallower cut
                        f.SetPeaking(f.CenterFrequency, _config.SampleRate, f.Q, newGain);
                    }
                }
            }
        }

        if (!feedbackDetected) return;

        // 2. Check if we already have a filter near this frequency
        int existingIdx = -1;
        float minDiff = float.MaxValue;

        for (int i = 0; i < MaxFilters; i++)
        {
            if (_filters[i].Active)
            {
                float diff = Math.Abs(_filters[i].CenterFrequency - frequency);
                if (diff < minDiff)
                {
                    minDiff = diff;
                    existingIdx = i;
                }
            }
        }

        if (existingIdx != -1 && minDiff < MergeThresholdHz)
        {
            // Deepen existing filter
            ref BiquadFilter f = ref _filters[existingIdx];
            float newGain = Math.Max(DeepCutDb, f.GainDb - 3.0f);
            f.SetPeaking(f.CenterFrequency, _config.SampleRate, f.Q, newGain);
            f.AgeFrames = 0; // Reset timer on re-trigger
            return;
        }

        // 3. New Filter Allocation
        int emptyIdx = -1;
        for (int i = 0; i < MaxFilters; i++)
        {
            if (!_filters[i].Active)
            {
                emptyIdx = i;
                break;
            }
        }

        if (emptyIdx != -1)
        {
            ref BiquadFilter fNew = ref _filters[emptyIdx];
            fNew.SetPeaking(frequency, _config.SampleRate, DefaultQ, InitialCutDb);

            // 4. Adaptive Bandwidth Merge Check
            // Iterate again to find proximity
            CheckMerge(emptyIdx);
        }
    }

    private void CheckMerge(int newIdx)
    {
        ref BiquadFilter fNew = ref _filters[newIdx];

        for (int i = 0; i < MaxFilters; i++)
        {
            if (i == newIdx || !_filters[i].Active) continue;

            ref BiquadFilter fOther = ref _filters[i];

            float diff = Math.Abs(fOther.CenterFrequency - fNew.CenterFrequency);
            if (diff < MergeThresholdHz)
            {
                // Merge Logic: Release both, replace with single wider filter centered between them.
                float newCenter = (fOther.CenterFrequency + fNew.CenterFrequency) / 2.0f;

                // Release the old one
                fOther.Reset();

                // Configure the "new" one as the merged wide filter
                fNew.SetPeaking(newCenter, _config.SampleRate, MergedQ, InitialCutDb);

                return; // Only merge once per update
            }
        }
    }

    public void Apply(Span<float> buffer)
    {
        // Apply all active filters in series
        // Iterate sample-by-sample for better locality per sample through all filters?
        // Or filter-by-filter over whole buffer?
        // Filter-by-filter is easier to implement but requires multiple passes over memory.
        // Sample-by-sample is generally faster for cache if filters are few.
        // But we need to maintain state.

        // Given we are modifying state in structs, let's do sample-by-sample.
        // But we must use `ref` or similar.

        // Actually, array access `_filters[j]` returns a reference to the struct location in heap?
        // No, `_filters[j]` is an L-value.
        // We can do `ref BiquadFilter f = ref _filters[j];`

        // Optimization: Pre-calculate active count or indices to avoid checking `f.Active` repeatedly inside sample loop?
        // Let's do a simple loop first.

        for (int i = 0; i < buffer.Length; i++)
        {
            float s = buffer[i];
            for (int f = 0; f < MaxFilters; f++)
            {
                // Explicitly use ref to ensure state update and avoid struct copies
                // Also cache locality for struct.
                ref BiquadFilter filter = ref _filters[f];
                if (filter.Active)
                {
                    s = filter.Process(s);
                }
            }
            buffer[i] = s;
        }
    }
}
