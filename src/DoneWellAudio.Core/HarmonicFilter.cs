using System;
using System.Collections.Generic;

namespace DoneWellAudio.Core;

internal static class HarmonicFilter
{
    public static List<FeedbackCandidate> Apply(List<FeedbackCandidate> list)
    {
        if (list.Count >= 3)
        {
            // Sort by frequency to optimize harmonic search
            list.Sort((a, b) => a.Tracked.FrequencyHz.CompareTo(b.Tracked.FrequencyHz));

            const double ratioTol = 0.015; // 1.5% tolerance

            for (int i = 0; i < list.Count; i++)
            {
                var c = list[i];
                int harmonicCount = 0;

                // Since list is sorted, we only need to check candidates with higher frequency
                // We can break early if frequency ratio exceeds the harmonic range
                for (int j = i + 1; j < list.Count; j++)
                {
                    var other = list[j];
                    double r = other.Tracked.FrequencyHz / c.Tracked.FrequencyHz;

                    // If ratio exceeds 6.2, no further candidates can be harmonics (since list is sorted)
                    if (r > 6.2) break;

                    // Lower bound check is implicit since j > i implies r >= 1
                    // But we still need to check strict range [1.8, 6.2]
                    if (r < 1.8) continue;

                    int k = (int)Math.Round(r);
                    if (k < 2 || k > 6) continue;

                    if (Math.Abs(r - k) <= ratioTol) harmonicCount++;
                }

                if (harmonicCount >= 2)
                {
                    double newConf = c.Confidence * 0.75;
                    // In-place update
                    if (Math.Abs(newConf - c.Confidence) > 1e-9)
                    {
                        list[i] = c with { Confidence = newConf };
                    }
                }
            }
        }

        return list;
    }
}
