using System.Collections.Concurrent;

namespace DoneWellAudio.Core;

public static class WindowFunctions
{
    private static readonly ConcurrentDictionary<int, float[]> _hannCache = new();

    public static void ApplyHannInPlace(float[] frame)
    {
        // Hann: w[n] = 0.5 * (1 - cos(2*pi*n/(N-1)))
        int n = frame.Length;
        if (n <= 1) return;

        float[] window = _hannCache.GetOrAdd(n, size =>
        {
            float[] w = new float[size];
            for (int i = 0; i < size; i++)
            {
                w[i] = (float)(0.5 * (1.0 - Math.Cos(2.0 * Math.PI * i / (size - 1))));
            }
            return w;
        });

        for (int i = 0; i < n; i++)
        {
            frame[i] *= window[i];
        }
    }
}
