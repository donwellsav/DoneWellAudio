namespace DoneWellAudio.Tests;

internal static class SignalGen
{
    public static float[] SineWithNoise(int sampleRate, double seconds, double freqHz, float amp, float noiseAmp, int seed)
    {
        int n = (int)(seconds * sampleRate);
        var x = new float[n];
        var rng = new Random(seed);
        double w = 2.0 * Math.PI * freqHz / sampleRate;

        for (int i = 0; i < n; i++)
        {
            float s = (float)(Math.Sin(w * i) * amp);
            float noise = (float)((rng.NextDouble() * 2 - 1) * noiseAmp);
            x[i] = s + noise;
        }

        return x;
    }

    public static float[] TwoSinesWithNoise(int sampleRate, double seconds, double f1, double f2, float amp, float noiseAmp, int seed)
    {
        int n = (int)(seconds * sampleRate);
        var x = new float[n];
        var rng = new Random(seed);

        double w1 = 2.0 * Math.PI * f1 / sampleRate;
        double w2 = 2.0 * Math.PI * f2 / sampleRate;

        for (int i = 0; i < n; i++)
        {
            float s = (float)((Math.Sin(w1 * i) + Math.Sin(w2 * i)) * 0.5 * amp);
            float noise = (float)((rng.NextDouble() * 2 - 1) * noiseAmp);
            x[i] = s + noise;
        }

        return x;
    }

    public static float[] HarmonicStackWithNoise(int sampleRate, double seconds, double f0, int harmonics, float amp, float noiseAmp, int seed)
    {
        int n = (int)(seconds * sampleRate);
        var x = new float[n];
        var rng = new Random(seed);

        // Sum 1..harmonics of f0 with decreasing amplitude
        for (int i = 0; i < n; i++)
        {
            double sum = 0;
            for (int h = 1; h <= harmonics; h++)
            {
                double wh = 2.0 * Math.PI * (f0 * h) / sampleRate;
                sum += Math.Sin(wh * i) * (1.0 / h);
            }
            sum *= amp;
            float noise = (float)((rng.NextDouble() * 2 - 1) * noiseAmp);
            x[i] = (float)sum + noise;
        }

        return x;
    }
}
