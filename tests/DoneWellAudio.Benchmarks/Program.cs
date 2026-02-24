using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using DoneWellAudio.Core;

namespace DoneWellAudio.Benchmarks;

class Program
{
    static void Main(string[] args)
    {
        Console.WriteLine("Generating test data...");
        var data = new List<List<FeedbackCandidate>>();
        var rand = new Random(42);

        // Create 1000 different lists of 16 candidates
        // To make it realistic, let's inject some harmonics
        for (int i = 0; i < 1000; i++)
        {
            var list = new List<FeedbackCandidate>();
            double baseFreq = 200 + rand.NextDouble() * 300; // 200-500 Hz

            // Add base
            list.Add(CreateCandidate(baseFreq));
            // Add harmonics
            list.Add(CreateCandidate(baseFreq * 2));
            list.Add(CreateCandidate(baseFreq * 3));

            // Fill rest with random
            while (list.Count < 16)
            {
                list.Add(CreateCandidate(50 + rand.NextDouble() * 7950));
            }

            // Shuffle to simulate unsorted input
            list = list.OrderBy(x => rand.Next()).ToList();
            data.Add(list);
        }

        // Store pristine copies for benchmark so we always test sorting unsorted data
        var originalData = data.Select(l => new List<FeedbackCandidate>(l)).ToList();

        // Warmup
        Console.WriteLine("Warmup...");
        for (int i = 0; i < 100; i++)
        {
            foreach (var list in data) // Modifies data in place, which is fine for warmup
            {
                HarmonicFilter.Apply(list);
            }
        }

        // Benchmark
        Console.WriteLine("Running benchmark (1000 iterations over 1000 lists = 1M calls)...");
        var sw = Stopwatch.StartNew();
        for (int i = 0; i < 1000; i++)
        {
            // We iterate over the original data, but we MUST copy it to measure the cost of sorting from scratch
            // Otherwise, we'd be sorting an already-sorted list (from previous iterations if we reused the list).
            // However, copying adds overhead (List constructor).
            // The goal is to measure HarmonicFilter.Apply on an unsorted list.
            // The real application passes a new List every frame anyway.
            // So measuring the cost of `HarmonicFilter.Apply` should include the sort cost.

            // To do this without including `new List` cost in the measurement:
            // We can't easily exclude it inside the loop.
            // But we can compare against baseline which also allocates?
            // Wait, the baseline benchmark I ran earlier reused the list!
            // So baseline was measuring O(N^2) on a *sorted* list (after first iteration).
            // Does O(N^2) care about order? No. It checks all pairs.
            // So baseline measurement (2978ns) is accurate for O(N^2).

            // For the Optimized version, O(N log N) + scan.
            // If the list is already sorted, sort is O(N).
            // If list is unsorted, sort is O(N log N).
            // So my previous result (1114ns) was for *sorted* input (best case for sort).
            // I need to measure *unsorted* input.

            // So I must copy the list from `originalData` inside the loop.
            // This adds `new List` allocation cost to the measurement.
            // But `FeedbackAnalyzer` creates the list anyway.
            // `HarmonicFilter.Apply` takes the list.
            // So the cost of `Apply` includes sorting.
            // The cost of creating the list belongs to `FeedbackAnalyzer`.

            // If I include `new List` in benchmark, the time will be `Apply` + `Allocation`.
            // I can subtract `Allocation` cost by benchmarking just allocation?
            // Or just accept the overhead.

            foreach (var pristineList in originalData)
            {
                // Create a working copy
                var list = new List<FeedbackCandidate>(pristineList);
                HarmonicFilter.Apply(list);
            }
        }
        sw.Stop();

        Console.WriteLine($"Total time: {sw.ElapsedMilliseconds} ms");
        Console.WriteLine($"Time per call (including allocation): {sw.Elapsed.TotalNanoseconds / 1_000_000.0:F2} ns");
    }

    static FeedbackCandidate CreateCandidate(double freq)
    {
        var tracked = new TrackedPeak(Guid.NewGuid(), freq, -10, 10, 20, 20, 0.5);
        var comps = new ConfidenceComponents(1, 1, 1, 1);
        return new FeedbackCandidate(tracked, 10, 0.9, comps);
    }
}
