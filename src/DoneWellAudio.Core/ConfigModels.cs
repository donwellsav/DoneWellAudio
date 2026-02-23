namespace DoneWellAudio.Core;

public sealed record RangeDouble(double Min, double Max, double? Step = null);

public sealed record FrequencyControl(double Min, double Max, bool Continuous);

public sealed record QControl(bool Adjustable, double Min, double Max, double? Step);

public sealed record BellProfile(
    bool Enabled,
    FrequencyControl FrequencyHz,
    RangeDouble GainDb,
    QControl Q
);

public sealed record ShelfProfile(
    bool Enabled,
    FrequencyControl FrequencyHz,
    RangeDouble GainDb
);

public sealed record LowCutProfile(
    bool Enabled,
    string Mode, // "fixed" | "variable" | "unknown"
    FrequencyControl Variable,
    double[] FixedPositionsHz
);

public sealed record ProminenceToCutMapping(double ProminenceDbAtLeast, double CutDb);

public sealed record SuggestedDefaults(
    int MaxRecommendations,
    ProminenceToCutMapping[] ProminenceDbToCutDb,
    double FallbackCutDb
);

public sealed record BellBandsUi(int Min, int Max);

public sealed record EqProfile(
    int Version,
    string ProductName,
    string AnalogEqProfileName,
    BellProfile Bell,
    ShelfProfile LowShelf,
    ShelfProfile HighShelf,
    LowCutProfile LowCut,
    BellBandsUi BellBandsUi,
    SuggestedDefaults SuggestedDefaults
);

public sealed record AudioSettings(
    int FrameSize,
    int HopSize,
    double MinFrequencyHz,
    double MaxFrequencyHz
);

public sealed record ConfidenceWeights(
    double Prominence,
    double Narrowness,
    double Persistence,
    double Stability,
    double RoomPrior = 0.0
);

public sealed record DetectionSettings(
    int LocalNeighborhoodBins,
    double MinProminenceDb,
    double MinEstimatedQ,
    double MaxEstimatedQ,
    double MaxFrequencyDriftHz,
    int MinPersistenceFrames,
    ConfidenceWeights ConfidenceWeights,
    double RoomPriorToleranceHz = 5.0,
    double RoomPriorLowGainThresholdDb = 0.0
);

public sealed record FreezePolicy(
    bool Enabled,
    double ConfidenceThreshold,
    int ConsecutiveFramesAboveThreshold,
    bool StopCaptureOnFreeze
);

public sealed record UiSettings(
    int UpdateHz
);

public enum SensitivityLevel { Low, Medium, High, Custom }
public enum ResponseSpeed { Slow, Medium, Fast }

public sealed record DetectorSettings(
    int Version,
    AudioSettings Audio,
    DetectionSettings Detection,
    FreezePolicy FreezePolicy,
    UiSettings Ui,
    bool ContinuousMode = false,
    SensitivityLevel Sensitivity = SensitivityLevel.Medium,
    ResponseSpeed ResponseSpeed = ResponseSpeed.Medium,
    bool SpectralWhitening = true // Pink noise compensation
);
