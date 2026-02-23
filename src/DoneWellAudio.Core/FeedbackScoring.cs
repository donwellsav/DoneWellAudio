namespace DoneWellAudio.Core;

public static class FeedbackScoring
{
    public static ConfidenceComponents ScoreComponents(
        TrackedPeak tracked,
        double estimatedQ,
        DetectorSettings settings,
        double roomPriorScore = 0.0)
    {
        // Prominence score: normalize around minProminenceDb..(min+18)
        double pMin = settings.Detection.MinProminenceDb;
        double pMax = pMin + 18.0;
        double prominenceScore = Clamp01((tracked.ProminenceDb - pMin) / (pMax - pMin));

        // Narrowness score: Q normalized between minEstimatedQ..maxEstimatedQ
        double qMin = settings.Detection.MinEstimatedQ;
        double qMax = settings.Detection.MaxEstimatedQ;
        double narrownessScore = Clamp01((estimatedQ - qMin) / (qMax - qMin));

        // Persistence score: total hits normalized to minPersistenceFrames..(min+20)
        double hitsMin = settings.Detection.MinPersistenceFrames;
        double hitsMax = hitsMin + 20.0;
        double persistenceScore = Clamp01((tracked.TotalHits - hitsMin) / (hitsMax - hitsMin));

        // Stability score: frequency stddev inverted; 0..maxDrift
        double maxStd = Math.Max(1.0, settings.Detection.MaxFrequencyDriftHz);
        double stabilityScore = Clamp01(1.0 - (tracked.FrequencyStdDevHz / maxStd));

        return new ConfidenceComponents(prominenceScore, narrownessScore, persistenceScore, stabilityScore, roomPriorScore);
    }

    public static double Combine(ConfidenceComponents c, DetectorSettings settings)
    {
        var w = settings.Detection.ConfidenceWeights;
        double sumW = w.Prominence + w.Narrowness + w.Persistence + w.Stability + w.RoomPrior;
        if (sumW <= 0) sumW = 1;

        double score =
            c.ProminenceScore * w.Prominence +
            c.NarrownessScore * w.Narrowness +
            c.PersistenceScore * w.Persistence +
            c.StabilityScore * w.Stability +
            c.RoomPriorScore * w.RoomPrior;

        return Clamp01(score / sumW);
    }

    private static double Clamp01(double x) => x < 0 ? 0 : x > 1 ? 1 : x;
}
