using System.Collections.Immutable;

namespace DoneWellAudio.Core;

public enum EqFilterType
{
    LowCut,
    LowShelf,
    Bell,
    HighShelf
}

public sealed record Peak(
    double FrequencyHz,
    double MagnitudeDb,
    double ProminenceDb
);

public sealed record TrackedPeak(
    Guid TrackId,
    double FrequencyHz,
    double MagnitudeDb,
    double ProminenceDb,
    int TotalHits,
    int ConsecutiveHits,
    double FrequencyStdDevHz
);

public sealed record FeedbackCandidate(
    TrackedPeak Tracked,
    double EstimatedQ,
    double Confidence,
    ConfidenceComponents Components
);

public sealed record ConfidenceComponents(
    double ProminenceScore,
    double NarrownessScore,
    double PersistenceScore,
    double StabilityScore
);

public sealed record EqRecommendation(
    int BandIndex,
    EqFilterType FilterType,
    double FrequencyHz,
    double GainDb,
    double? Q,
    string Rationale
);

public sealed record AnalysisSnapshot(
    DateTimeOffset Timestamp,
    bool IsFrozen,
    ImmutableArray<FeedbackCandidate> Candidates,
    ImmutableArray<EqRecommendation> Recommendations
);
