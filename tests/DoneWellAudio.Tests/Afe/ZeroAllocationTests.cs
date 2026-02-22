using System;
using System.Buffers;
using DoneWellAudio.Core.Afe;
using Xunit;

namespace DoneWellAudio.Tests.Afe;

public class ZeroAllocationTests
{
    [Fact]
    public void Engine_Process_ShouldAllocatedZeroBytes()
    {
        // Setup
        var config = new AfeConfig(48000, 256);
        using var engine = new FeedbackSuppressionEngine(config);

        // Use stackalloc or pooled buffers for test input
        float[] inBuffer = new float[256];
        float[] outBuffer = new float[256];

        // Warmup (JIT, static initializers)
        for (int i = 0; i < 100; i++)
        {
            engine.Process(inBuffer, outBuffer);
        }

        // Measure
        long before = GC.GetAllocatedBytesForCurrentThread();

        // Run loop
        for (int i = 0; i < 1000; i++)
        {
            engine.Process(inBuffer, outBuffer);
        }

        long after = GC.GetAllocatedBytesForCurrentThread();

        Assert.Equal(0, after - before);
    }
}
