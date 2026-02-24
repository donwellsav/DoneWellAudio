using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using DoneWellAudio.Core;

namespace DoneWellAudio.Benchmarks;

public class PeakTrackerBenchmark
{
    public static void Run()
    {
        Console.WriteLine("=== PeakTracker Benchmark ===");

        // Scenario 1: Realistic (100 tracks, 100 peaks)
        RunScenario(100, 100, "Realistic (100 tracks, 100 peaks)");

        // Scenario 2: Stress (1000 tracks, 1000 peaks)
        RunScenario(1000, 1000, "Stress (1000 tracks, 1000 peaks)");

        // Scenario 3: Mixed (500 tracks, 500 peaks)
        RunScenario(500, 500, "Medium (500 tracks, 500 peaks)");
    }

    private static void RunScenario(int numTracks, int numPeaks, string name)
    {
        Console.WriteLine($"Running {name}...");

        var settings = new DetectorSettings(
            1,
            new AudioSettings(4096, 1024, 20, 20000),
            new DetectionSettings(
                12,
                6.0,
                4.0,
                150.0,
                10.0, // MaxFrequencyDriftHz (Tolerance)
                10,
                new ConfidenceWeights(1,1,1,1),
                5.0,
                0.0
            ),
            new FreezePolicy(false, 0.7, 10, false),
            new UiSettings(15)
        );

        var tracker = new PeakTracker();
        var rand = new Random(42);

        // 1. Initialize tracker with stable tracks
        // We use a wide spacing (20Hz) to ensure no accidental overlap initially
        var initialPeaks = new List<Peak>();
        for (int i = 0; i < numTracks; i++)
        {
            initialPeaks.Add(new Peak(100 + i * 20, -10, 10));
        }
        tracker.Update(initialPeaks, settings);

        // 2. Generate input peaks for the benchmark
        // These will be slightly jittered from the tracks to force distance calculations
        var inputPeaks = new List<Peak>();
        for (int i = 0; i < numPeaks; i++)
        {
            // Jitter +/- 2.0 Hz (within 10Hz tolerance)
            double jitter = (rand.NextDouble() - 0.5) * 4.0;
            // We align these with the first 'numPeaks' tracks
            // If numPeaks > numTracks, we add new ones at the end
            inputPeaks.Add(new Peak(100 + i * 20 + jitter, -10, 10));
        }

        // Shuffle input peaks to simulate unsorted input from detection
        inputPeaks = inputPeaks.OrderBy(x => rand.Next()).ToList();

        // Warmup
        // Run a few times to stabilize JIT and branch predictors
        // Note: Update modifies tracker state, but since our peaks always match the same tracks (mostly),
        // the track list size should remain stable around max(numTracks, numPeaks).
        for (int i = 0; i < 50; i++)
        {
            tracker.Update(inputPeaks, settings);
        }

        // Benchmark
        var sw = Stopwatch.StartNew();
        int iterations = 2000;

        for (int i = 0; i < iterations; i++)
        {
            // We pass the same list every time.
            // In reality, a new list is passed every frame.
            // But here we want to measure the processing time of Update.
            tracker.Update(inputPeaks, settings);
        }

        sw.Stop();

        double totalMs = sw.Elapsed.TotalMilliseconds;
        double avgMs = totalMs / iterations;
        double opsPerSec = 1000.0 / avgMs;

        Console.WriteLine($"  Total time ({iterations} iterations): {totalMs:F2} ms");
        Console.WriteLine($"  Avg time per update: {avgMs:F4} ms");
        Console.WriteLine($"  Ops/sec: {opsPerSec:F0}");
        Console.WriteLine();
    }
}
