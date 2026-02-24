using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using DoneWellAudio.Core;

namespace DoneWellAudio.Benchmarks;

public class HarmonicFilterBenchmark
{
    public static void Run()
    {
        Console.WriteLine("=== HarmonicFilter Benchmark ===");
        Console.WriteLine("Generating test data...");
        var data = new List<List<FeedbackCandidate>>();
        var rand = new Random(42);

        for (int i = 0; i < 1000; i++)
        {
            var list = new List<FeedbackCandidate>();
            double baseFreq = 200 + rand.NextDouble() * 300;

            list.Add(CreateCandidate(baseFreq));
            list.Add(CreateCandidate(baseFreq * 2));
            list.Add(CreateCandidate(baseFreq * 3));

            while (list.Count < 16)
            {
                list.Add(CreateCandidate(50 + rand.NextDouble() * 7950));
            }

            list = list.OrderBy(x => rand.Next()).ToList();
            data.Add(list);
        }

        var originalData = data.Select(l => new List<FeedbackCandidate>(l)).ToList();

        Console.WriteLine("Warmup...");
        for (int i = 0; i < 100; i++)
        {
            foreach (var list in data)
            {
                HarmonicFilter.Apply(list);
            }
        }

        Console.WriteLine("Running benchmark (1000 iterations over 1000 lists = 1M calls)...");
        var sw = Stopwatch.StartNew();
        for (int i = 0; i < 1000; i++)
        {
            foreach (var pristineList in originalData)
            {
                var list = new List<FeedbackCandidate>(pristineList);
                HarmonicFilter.Apply(list);
            }
        }
        sw.Stop();

        Console.WriteLine($"Total time: {sw.ElapsedMilliseconds} ms");
        Console.WriteLine($"Time per call (including allocation): {sw.Elapsed.TotalNanoseconds / 1_000_000.0:F2} ns");
        Console.WriteLine();
    }

    static FeedbackCandidate CreateCandidate(double freq)
    {
        var tracked = new TrackedPeak(Guid.NewGuid(), freq, -10, 10, 20, 20, 0.5);
        var comps = new ConfidenceComponents(1, 1, 1, 1);
        return new FeedbackCandidate(tracked, 10, 0.9, comps);
    }
}
