using System;
using System.Collections.Generic;

namespace DoneWellAudio.Core.RoomPrediction;

/// <summary>
/// Represents the physical dimensions of a rectangular room in meters.
/// </summary>
public sealed record RoomDimensions(
    double Length,
    double Width,
    double Height
);

/// <summary>
/// Represents the position of a source or receiver in the room.
/// </summary>
public sealed record Position(
    double X,
    double Y,
    double Z
);

/// <summary>
/// Represents the explicit distances between source, mic, and listener if coordinates are not used.
/// </summary>
public sealed record ExplicitDistances(
    double TalkerToMic,    // ds
    double SpeakerToMic,   // r
    double SpeakerToListener, // d1
    double TalkerToListener   // d3
);

/// <summary>
/// Configuration for the room profile.
/// </summary>
public sealed record RoomProfile(
    string Name,
    RoomDimensions Dimensions,
    Dictionary<string, double[]> SurfaceAbsorption, // Surface Name -> Alpha coefficients per band
    Position? SourcePosition,
    Position? MicPosition,
    Position? ListenerPosition,
    ExplicitDistances? ExplicitDistances, // Optional override
    double[] BandCentersHz, // Octave band centers corresponding to absorption arrays
    double? TemperatureCelsius = 20.0 // For speed of sound calculation
);

/// <summary>
/// Result of acoustic calculations for a specific frequency band.
/// </summary>
public sealed record RoomAcousticResult(
    double FrequencyHz,
    double TotalAbsorptionArea, // A(f)
    double AverageAbsorption,   // alpha_bar(f)
    double Rt60Sabine,
    double Rt60Eyring,
    double RoomConstant,        // R(f)
    double CriticalDistance,    // Dc(f)
    double SystemGainBeforeFeedback, // S.G.(f)
    double SystemGainEffective, // SG_eff (after NOM/modifiers)
    double SystemGainInUse,     // SG_in_use (after margin)
    List<string> Warnings       // e.g., "DiffuseFieldQuestionable"
);

/// <summary>
/// Represents a room mode (standing wave).
/// </summary>
public sealed record RoomMode(
    double FrequencyHz,
    int Nx,
    int Ny,
    int Nz,
    double CouplingWeight, // 0..1, based on source/mic position
    bool IsAxial,
    bool IsTangential,
    bool IsOblique
);

/// <summary>
/// Comprehensive prediction result.
/// </summary>
public sealed record RoomPredictionResult(
    RoomProfile Profile,
    List<RoomAcousticResult> BandResults,
    double SchroederFrequencyHz,
    List<RoomMode> ModesBelowSchroeder,
    string PrimaryRt60Model // "Sabine" or "Eyring"
);
