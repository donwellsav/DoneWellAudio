namespace DoneWellAudio.Core;

public static class WindowFunctions
{
    public static void ApplyHannInPlace(float[] frame)
    {
        // Hann: w[n] = 0.5 * (1 - cos(2*pi*n/(N-1)))
        int n = frame.Length;
        if (n <= 1) return;
        for (int i = 0; i < n; i++)
        {
            var w = 0.5 * (1.0 - Math.Cos(2.0 * Math.PI * i / (n - 1)));
            frame[i] = (float)(frame[i] * w);
        }
    }
}
