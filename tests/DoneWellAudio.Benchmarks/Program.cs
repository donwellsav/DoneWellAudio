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
        // Run the new PeakTracker benchmark
        PeakTrackerBenchmark.Run();

        Console.WriteLine();

        // Run the previous HarmonicFilter benchmark
        HarmonicFilterBenchmark.Run();
    }
}
