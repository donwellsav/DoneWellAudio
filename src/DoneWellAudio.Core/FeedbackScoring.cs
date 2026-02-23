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
        double pRange = Math.Max(pMax - pMin, 1e-9);
        double prominenceScore = Math.Clamp((tracked.ProminenceDb - pMin) / pRange, 0.0, 1.0);

        // Narrowness score: Q normalized between minEstimatedQ..maxEstimatedQ
        double qMin = settings.Detection.MinEstimatedQ;
        double qMax = settings.Detection.MaxEstimatedQ;
        double qRange = Math.Max(qMax - qMin, 1e-9);
        double narrownessScore = Math.Clamp((estimatedQ - qMin) / qRange, 0.0, 1.0);

        // Persistence score: total hits normalized to minPersistenceFrames..(min+20)
        double hitsMin = settings.Detection.MinPersistenceFrames;
        double hitsMax = hitsMin + 20.0;
        double hitsRange = Math.Max(hitsMax - hitsMin, 1e-9);
        double persistenceScore = Math.Clamp((tracked.TotalHits - hitsMin) / hitsRange, 0.0, 1.0);

        // Stability score: frequency stddev inverted; 0..maxDrift
        double maxStd = Math.Max(1.0, settings.Detection.MaxFrequencyDriftHz);
        double stabilityScore = Math.Clamp(1.0 - (tracked.FrequencyStdDevHz / maxStd), 0.0, 1.0);

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

        return Math.Clamp(score / sumW, 0.0, 1.0);
    }
}
