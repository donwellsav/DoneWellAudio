namespace DoneWellAudio.Core;

public static class FeedbackScoring
{
    private const double ProminenceScoringRangeDb = 18.0;
    private const double PersistenceScoringRangeFrames = 20.0;
    private const double MinFrequencyDriftNormalizationHz = 1.0;

    public static ConfidenceComponents ScoreComponents(
        TrackedPeak tracked,
        double estimatedQ,
        DetectorSettings settings)
    {
        // Prominence score: normalize around minProminenceDb..(min + range)
        double pMin = settings.Detection.MinProminenceDb;
        double pMax = pMin + ProminenceScoringRangeDb;
        double prominenceScore = Clamp01((tracked.ProminenceDb - pMin) / (pMax - pMin));

        // Narrowness score: Q normalized between minEstimatedQ..maxEstimatedQ
        double qMin = settings.Detection.MinEstimatedQ;
        double qMax = settings.Detection.MaxEstimatedQ;
        double narrownessScore = Clamp01((estimatedQ - qMin) / (qMax - qMin));

        // Persistence score: total hits normalized to minPersistenceFrames..(min + range)
        double hitsMin = settings.Detection.MinPersistenceFrames;
        double hitsMax = hitsMin + PersistenceScoringRangeFrames;
        double persistenceScore = Clamp01((tracked.TotalHits - hitsMin) / (hitsMax - hitsMin));

        // Stability score: frequency stddev inverted; 0..maxDrift
        double maxStd = Math.Max(MinFrequencyDriftNormalizationHz, settings.Detection.MaxFrequencyDriftHz);
        double stabilityScore = Clamp01(1.0 - (tracked.FrequencyStdDevHz / maxStd));

        return new ConfidenceComponents(prominenceScore, narrownessScore, persistenceScore, stabilityScore);
    }

    public static double Combine(ConfidenceComponents c, DetectorSettings settings)
    {
        var w = settings.Detection.ConfidenceWeights;
        double sumW = w.Prominence + w.Narrowness + w.Persistence + w.Stability;
        if (sumW <= 0) sumW = 1.0;

        double score =
            c.ProminenceScore * w.Prominence +
            c.NarrownessScore * w.Narrowness +
            c.PersistenceScore * w.Persistence +
            c.StabilityScore * w.Stability;

        return Clamp01(score / sumW);
    }

    private static double Clamp01(double x) => x < 0 ? 0 : x > 1 ? 1 : x;
}
