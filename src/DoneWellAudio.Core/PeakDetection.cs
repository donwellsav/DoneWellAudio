using System.Collections.Generic;

namespace DoneWellAudio.Core;

public static class PeakDetection
{
    public static double[] ConvertToDb(double[] magnitudeLinear)
    {
        var magDb = new double[magnitudeLinear.Length];
        ConvertToDb(magnitudeLinear, magDb);
        return magDb;
    }

    public static void ConvertToDb(double[] magnitudeLinear, double[] destinationDb)
    {
        if (destinationDb.Length < magnitudeLinear.Length)
            throw new ArgumentException("Destination array too small.", nameof(destinationDb));

        const double floor = 1e-12;
        for (int i = 0; i < magnitudeLinear.Length; i++)
        {
            destinationDb[i] = 20.0 * Math.Log10(Math.Max(floor, magnitudeLinear[i]));
        }
    }

    public static void ApplyWhitening(double[] magDb, double binHz)
    {
        for (int i = 1; i < magDb.Length; i++)
        {
            // Add 10 * log10(f) to flatten 1/f power spectrum
            double f = i * binHz;
            if (f > 1.0)
                magDb[i] += 10.0 * Math.Log10(f);
        }
    }

    public static IReadOnlyList<Peak> FindPeaks(
        double[] magDb,
        int sampleRate,
        DetectorSettings settings)
    {
        var peaks = new List<Peak>();
        FindPeaks(magDb, sampleRate, settings, peaks);
        return peaks;
    }

    public static void FindPeaks(
        double[] magDb,
        int sampleRate,
        DetectorSettings settings,
        List<Peak> destination)
    {
        if (destination == null) throw new ArgumentNullException(nameof(destination));
        destination.Clear();

        int nFft = (magDb.Length - 1) * 2;
        double binHz = sampleRate / (double)nFft;

        int minBin = (int)Math.Max(1, Math.Floor(settings.Audio.MinFrequencyHz / binHz));
        int maxBin = (int)Math.Min(magDb.Length - 2, Math.Ceiling(settings.Audio.MaxFrequencyHz / binHz));

        int nb = Math.Max(2, settings.Detection.LocalNeighborhoodBins);

        for (int i = minBin + 1; i < maxBin - 1; i++)
        {
            // local maximum
            if (!(magDb[i] > magDb[i - 1] && magDb[i] >= magDb[i + 1]))
                continue;

            // local baseline: mean of neighborhood excluding center +/-1
            int lo = Math.Max(minBin, i - nb);
            int hi = Math.Min(maxBin, i + nb);
            double sum = 0;
            int count = 0;
            for (int j = lo; j <= hi; j++)
            {
                if (Math.Abs(j - i) <= 1) continue;
                sum += magDb[j];
                count++;
            }
            if (count == 0) continue;
            double baseline = sum / count;
            double prominence = magDb[i] - baseline;

            double threshold = settings.Detection.MinProminenceDb;
            switch (settings.Sensitivity)
            {
                case SensitivityLevel.High: threshold -= 3.0; break;
                case SensitivityLevel.Low: threshold += 3.0; break;
            }

            if (prominence < threshold) continue;

            double freq = i * binHz;
            destination.Add(new Peak(freq, magDb[i], prominence));
        }

        // Sort by prominence (desc)
        destination.Sort((a, b) => b.ProminenceDb.CompareTo(a.ProminenceDb));
    }

    public static double EstimateQFromDbCurve(double[] magDb, int peakIndex, double binHz, double dropDb = 6.0)
    {
        double peakDb = magDb[peakIndex];
        double targetDb = peakDb - dropDb;

        int left = peakIndex;
        while (left > 1 && magDb[left] > targetDb) left--;

        int right = peakIndex;
        while (right < magDb.Length - 2 && magDb[right] > targetDb) right++;

        double bwHz = Math.Max(binHz, (right - left) * binHz);
        double f0 = peakIndex * binHz;
        return f0 / bwHz;
    }
}
