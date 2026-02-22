using System.Collections.Immutable;

namespace DoneWellAudio.Core;

public static class RecommendationEngine
{
    public static ImmutableArray<EqRecommendation> Recommend(
        ImmutableArray<FeedbackCandidate> candidates,
        EqProfile eq,
        int bellBandsRequested)
    {
        int n = Math.Clamp(bellBandsRequested, eq.BellBandsUi.Min, eq.BellBandsUi.Max);
        n = Math.Min(n, eq.SuggestedDefaults.MaxRecommendations);

        if (!eq.Bell.Enabled || n <= 0 || candidates.Length == 0)
            return ImmutableArray<EqRecommendation>.Empty;

        var top = candidates
            .OrderByDescending(c => c.Confidence)
            .Take(n)
            .ToArray();

        var recs = new List<EqRecommendation>();

        for (int i = 0; i < top.Length; i++)
        {
            var c = top[i];
            var freq = Clamp(c.Tracked.FrequencyHz, eq.Bell.FrequencyHz.Min, eq.Bell.FrequencyHz.Max);

            double cut = MapProminenceToCutDb(c.Tracked.ProminenceDb, eq.SuggestedDefaults);
            cut = Clamp(cut, eq.Bell.GainDb.Min, eq.Bell.GainDb.Max);
            if (eq.Bell.GainDb.Step is double step && step > 0)
                cut = RoundToStep(cut, step);

            double q = Clamp(c.EstimatedQ, eq.Bell.Q.Min, eq.Bell.Q.Max);
            if (eq.Bell.Q.Step is double qStep && qStep > 0)
                q = RoundToStep(q, qStep);

            string rationale =
                $"confidence={c.Confidence:0.00} (prom={c.Components.ProminenceScore:0.00}, " +
                $"narrow={c.Components.NarrownessScore:0.00}, persist={c.Components.PersistenceScore:0.00}, " +
                $"stable={c.Components.StabilityScore:0.00})";

            recs.Add(new EqRecommendation(
                BandIndex: i + 1,
                FilterType: EqFilterType.Bell,
                FrequencyHz: freq,
                GainDb: cut,
                Q: eq.Bell.Q.Adjustable ? q : null,
                Rationale: rationale
            ));
        }

        return recs.ToImmutableArray();
    }

    private static double MapProminenceToCutDb(double prominenceDb, SuggestedDefaults defaults)
    {
        // Choose the strongest mapping that applies.
        double best = defaults.FallbackCutDb;
        foreach (var m in defaults.ProminenceDbToCutDb.OrderBy(x => x.ProminenceDbAtLeast))
        {
            if (prominenceDb >= m.ProminenceDbAtLeast)
                best = m.CutDb;
        }
        return best;
    }

    private static double Clamp(double x, double min, double max) => x < min ? min : (x > max ? max : x);

    private static double RoundToStep(double x, double step)
    {
        return Math.Round(x / step) * step;
    }
}
