namespace DoneWellAudio.Core;

public static class PeakDetection
{
    public static IReadOnlyList<Peak> FindPeaksDb(
        double[] magnitudeLinear,
        int sampleRate,
        DetectorSettings settings)
    {
        // Convert to dB with small floor to avoid log(0).
        var magDb = new double[magnitudeLinear.Length];
        const double floor = 1e-12;
        int nFft = (magnitudeLinear.Length - 1) * 2;
        double binHz = sampleRate / (double)nFft;

        for (int i = 0; i < magnitudeLinear.Length; i++)
        {
            double valDb = 20.0 * Math.Log10(Math.Max(floor, magnitudeLinear[i]));

            // Pink Noise Compensation (+3dB/octave slope)
            if (settings.SpectralWhitening && i > 0)
            {
                // Add 10 * log10(f) to flatten 1/f power spectrum
                // We use a normalized frequency relative to 1Hz or just raw Hz.
                // Since we care about slope, absolute offset doesn't matter for peak prominence relative to neighbor,
                // BUT it matters for overall shape.
                // Using frequency in Hz:
                double f = i * binHz;
                if (f > 1.0)
                    valDb += 10.0 * Math.Log10(f);
            }

            magDb[i] = valDb;
        }

        int minBin = (int)Math.Max(1, Math.Floor(settings.Audio.MinFrequencyHz / binHz));
        int maxBin = (int)Math.Min(magDb.Length - 2, Math.Ceiling(settings.Audio.MaxFrequencyHz / binHz));

        var peaks = new List<Peak>();

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
            peaks.Add(new Peak(freq, magDb[i], prominence));
        }

        // Sort by prominence (desc)
        peaks.Sort((a, b) => b.ProminenceDb.CompareTo(a.ProminenceDb));
        return peaks;
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
