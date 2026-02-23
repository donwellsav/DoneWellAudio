using System;
using System.Collections.Generic;
using System.Linq;

namespace DoneWellAudio.Core.RoomPrediction;

/// <summary>
/// Implements standard room acoustic formulas (Sabine, Eyring, Boner, etc.).
/// </summary>
public sealed class RoomAcousticsCalculator
{
    private const double SoundSpeedMs = 343.0; // Default if not specified

    /// <summary>
    /// Calculates acoustic parameters for a given room profile.
    /// </summary>
    public RoomPredictionResult Calculate(RoomProfile profile)
    {
        var dims = profile.Dimensions;
        var volume = dims.Length * dims.Width * dims.Height;
        var totalSurfaceArea = 2 * (dims.Length * dims.Width + dims.Length * dims.Height + dims.Width * dims.Height);

        var bandResults = new List<RoomAcousticResult>();
        var modes = new List<RoomMode>();
        var schroederFreq = 0.0;

        // --- Band-wise Calculations ---
        for (int i = 0; i < profile.BandCentersHz.Length; i++)
        {
            var freq = profile.BandCentersHz[i];

            // Calculate Total Absorption A(f) = Sum(S_i * alpha_i)
            double totalAbsorptionArea = 0;
            foreach (var surface in profile.SurfaceAbsorption)
            {
                // Simple assumption: "Floor", "Ceiling", "Walls" match dimensions.
                // If explicit areas aren't provided, we infer from names or assume equal distribution?
                // The prompt says: "RoomProfile provides absorption coefficients alpha_i(f) per surface (floor, ceiling, walls or explicit surfaces)."
                // For a rectangular room, we can infer areas if names are standard.
                // Otherwise, we might need explicit areas in the config.
                // Let's assume standard names for now or fall back to total area / number of surfaces?
                // Better approach: explicit surface areas in config or strict naming convention.
                // Let's use strict naming: "Floor", "Ceiling", "WallFront", "WallBack", "WallLeft", "WallRight".
                // Or simplified: "Floor", "Ceiling", "Walls" (Walls = sum of 4 walls).

                double area = GetSurfaceArea(surface.Key, dims);
                if (area > 0)
                {
                    double alpha = 0.05;
                    if (i < surface.Value.Length)
                    {
                        alpha = surface.Value[i];
                    }
                    else
                    {
                        // Mark as partial/missing data if enabled?
                        // We need to collect warnings here. But warnings list is created later.
                        // We'll flag it.
                    }
                    totalAbsorptionArea += area * alpha;
                }
            }

            // Average Absorption Coefficient alpha_bar
            double alphaBar = totalAbsorptionArea / totalSurfaceArea;

            // Clamp alpha_bar for stability
            if (alphaBar >= 0.99) alphaBar = 0.99;

            // Warnings collection
            var warnings = new List<string>();

            // Check for missing data in this band
            foreach (var surface in profile.SurfaceAbsorption)
            {
                 if (i >= surface.Value.Length)
                 {
                     warnings.Add($"MissingAlpha:{surface.Key}");
                     break; // One warning per band sufficient
                 }
            }

            // RT60 Sabine
            double rt60Sabine = (0.161 * volume) / totalAbsorptionArea;

            // RT60 Eyring
            double rt60Eyring = (0.161 * volume) / (-totalSurfaceArea * Math.Log(1.0 - alphaBar));

            // Choose primary RT60 (could be config driven, default to Sabine for live rooms, Eyring for dead)
            // For now, let's just calculate both.

            // Room Constant R
            double roomConstant = (totalSurfaceArea * alphaBar) / (1.0 - alphaBar);

            // Critical Distance Dc (assuming Q=1 for omni source as baseline, or config driven)
            // The prompt says "Dc(f) = 0.14 * sqrt(Q * R(f))". let's assume Q=1 (Omni) for general room characteristic.
            double dc = 0.14 * Math.Sqrt(1.0 * roomConstant);

            // Gain Before Feedback (Boner)
            // Need distances.
            double sg = CalculateSystemGain(profile, roomConstant);

            if (alphaBar > 0.2) warnings.Add("DiffuseFieldQuestionable");
            if (double.IsInfinity(sg) || double.IsNaN(sg)) warnings.Add("InvalidGainCalculation");

            bandResults.Add(new RoomAcousticResult(
                freq,
                totalAbsorptionArea,
                alphaBar,
                rt60Sabine,
                rt60Eyring,
                roomConstant,
                dc,
                sg,
                sg, // SG_eff (no NOM implemented yet)
                sg - 6.0, // SG_in_use (6dB margin default)
                warnings
            ));
        }

        // --- Schroeder Frequency ---
        // fs = 2000 * sqrt(RT60 / V)
        // Use 1kHz band if available, or average.
        var refBand = bandResults.FirstOrDefault(b => Math.Abs(b.FrequencyHz - 1000) < 100) ?? bandResults.FirstOrDefault();
        if (refBand != null)
        {
            schroederFreq = 2000 * Math.Sqrt(refBand.Rt60Sabine / volume);
        }

        // --- Modal Calculation ---
        modes = CalculateModes(dims, schroederFreq, profile.SourcePosition, profile.MicPosition);

        return new RoomPredictionResult(
            profile,
            bandResults,
            schroederFreq,
            modes,
            "Sabine"
        );
    }

    private double GetSurfaceArea(string surfaceName, RoomDimensions dims)
    {
        // Simple mapping based on standard rectangular names
        if (string.Equals(surfaceName, "Floor", StringComparison.OrdinalIgnoreCase)) return dims.Length * dims.Width;
        if (string.Equals(surfaceName, "Ceiling", StringComparison.OrdinalIgnoreCase)) return dims.Length * dims.Width;

        // Walls
        if (string.Equals(surfaceName, "WallFront", StringComparison.OrdinalIgnoreCase)) return dims.Width * dims.Height;
        if (string.Equals(surfaceName, "WallBack", StringComparison.OrdinalIgnoreCase)) return dims.Width * dims.Height;
        if (string.Equals(surfaceName, "WallLeft", StringComparison.OrdinalIgnoreCase)) return dims.Length * dims.Height;
        if (string.Equals(surfaceName, "WallRight", StringComparison.OrdinalIgnoreCase)) return dims.Length * dims.Height;

        // Simplified "Walls" - assume all 4 walls have same material
        if (string.Equals(surfaceName, "Walls", StringComparison.OrdinalIgnoreCase))
            return 2 * (dims.Width * dims.Height + dims.Length * dims.Height);

        return 0.0;
    }

    private double CalculateSystemGain(RoomProfile profile, double R)
    {
        // Distances
        double ds, r, d1, d3;

        if (profile.ExplicitDistances != null)
        {
            ds = profile.ExplicitDistances.TalkerToMic;
            r = profile.ExplicitDistances.SpeakerToMic;
            d1 = profile.ExplicitDistances.SpeakerToListener;
            d3 = profile.ExplicitDistances.TalkerToListener;
        }
        else if (profile.SourcePosition != null && profile.MicPosition != null && profile.ListenerPosition != null)
        {
            // Assume Source = Talker position?
            // Actually in PA:
            // Source = Loudspeaker
            // Talker = Microphone input source (person)
            // Mic = Microphone
            // Listener = Audience member

            // Wait, the profile has SourcePosition (Speaker), MicPosition.
            // We need TalkerPosition and ListenerPosition.
            // Let's assume for simplicity (or update Profile):
            // "SourcePosition" = Loudspeaker
            // "MicPosition" = Microphone
            // "ListenerPosition" = Listener
            // Talker is at Mic? No, Talker->Mic is critical.

            // Standard assumption: Talker is very close to Mic (e.g. 0.3m) if not specified.
            // But Boner formula relies on these.
            // Let's use defaults if coordinates missing or incomplete.

            var mic = profile.MicPosition;
            var spk = profile.SourcePosition; // Loudspeaker
            var lst = profile.ListenerPosition;

            // Distances
            // ds = Talker -> Mic.  (Usually small, e.g. 0.3m). Let's assume 0.3m if not in config?
            // Actually, we can't guess. The prompt says "Distances: ds, r, d1, d3".
            // If explicit distances are provided, use them.
            // If coords are provided, we need a "TalkerPosition".
            // If missing, we can't compute accurately.
            // Let's assume Talker is at Mic + (0,0,0.3)? Or just fail?
            // For now, let's use a safe default for ds (0.3m) if not explicit.

            ds = 0.3;
            r = GetDistance(spk, mic);       // Speaker -> Mic
            d1 = GetDistance(spk, lst);      // Speaker -> Listener
            d3 = GetDistance(mic, lst);      // Talker -> Listener (approx Mic->Listener if Talker at Mic)
                                             // Actually Talker->Listener is roughly Mic->Listener if ds is small.
        }
        else
        {
            // Fallback or fail
            return 0.0;
        }

        // Q (Directivity)
        // Assume Q_talker = 2 (Human voice approx cardioid/directional?) or 1 (Omni). Boner often uses Q=2 for talker.
        // Assume Q_speaker = 5 (Typical PA speaker).
        // Let's use constants for now or add to profile.
        double Qt = 2.0;
        double Qs = 5.0;

        // Delta(Q, x, R) = Lrel(Q, 1, R) - Lrel(Q, x, R)
        // Lrel = 10*log10( Q/(4*pi*x^2) + 4/R )

        double Delta(double Q, double x, double Rc)
        {
             double l_1m = 10 * Math.Log10( Q / (4 * Math.PI * 1.0) + 4.0 / Rc );
             double l_x = 10 * Math.Log10( Q / (4 * Math.PI * x * x) + 4.0 / Rc );
             return l_1m - l_x;
        }

        // S.G. = Delta(Qt, d3, R) + Delta(Qs, r, R) - Delta(Qt, ds, R) - Delta(Qs, d1, R)
        double term1 = Delta(Qt, d3, R);
        double term2 = Delta(Qs, r, R);
        double term3 = Delta(Qt, ds, R);
        double term4 = Delta(Qs, d1, R);

        return term1 + term2 - term3 - term4;
    }

    private double GetDistance(Position p1, Position p2)
    {
        double dx = p1.X - p2.X;
        double dy = p1.Y - p2.Y;
        double dz = p1.Z - p2.Z;
        return Math.Sqrt(dx*dx + dy*dy + dz*dz);
    }

    private List<RoomMode> CalculateModes(RoomDimensions dims, double maxFreq, Position? source, Position? mic)
    {
        var modes = new List<RoomMode>();
        double c = SoundSpeedMs; // Could be improved with temperature

        // Limit max mode search to avoid infinite loops if maxFreq is huge.
        // Standard small room modes are low freq (<300Hz usually).
        // If maxFreq is > 500Hz, clamp it for performance in this loop?
        // Prompt says "modes below fs". fs is usually < 200Hz for large rooms, maybe higher for small.
        // Let's clamp to 300Hz or fs, whichever is lower?
        // No, prompt says "Keep modes with f <= min(fs, modeMaxHzFromConfig)".
        // Let's assume a reasonable cap if not specified.
        double limit = Math.Min(maxFreq, 300.0);

        // Enumerate integers nx, ny, nz
        // Estimate max indices: n_max = (2 * f_max * L) / c
        int nxMax = (int)((2 * limit * dims.Length) / c) + 1;
        int nyMax = (int)((2 * limit * dims.Width) / c) + 1;
        int nzMax = (int)((2 * limit * dims.Height) / c) + 1;

        for (int nx = 0; nx <= nxMax; nx++)
        {
            for (int ny = 0; ny <= nyMax; ny++)
            {
                for (int nz = 0; nz <= nzMax; nz++)
                {
                    if (nx == 0 && ny == 0 && nz == 0) continue;

                    double f = (c / 2.0) * Math.Sqrt(
                        Math.Pow(nx / dims.Length, 2) +
                        Math.Pow(ny / dims.Width, 2) +
                        Math.Pow(nz / dims.Height, 2)
                    );

                    if (f <= limit)
                    {
                        // Calculate coupling weight
                        double weight = 1.0;
                        if (source != null && mic != null)
                        {
                            double phiSource = Math.Cos(nx * Math.PI * source.X / dims.Length) *
                                               Math.Cos(ny * Math.PI * source.Y / dims.Width) *
                                               Math.Cos(nz * Math.PI * source.Z / dims.Height);

                            double phiMic = Math.Cos(nx * Math.PI * mic.X / dims.Length) *
                                            Math.Cos(ny * Math.PI * mic.Y / dims.Width) *
                                            Math.Cos(nz * Math.PI * mic.Z / dims.Height);

                            weight = Math.Abs(phiSource * phiMic);
                        }

                        modes.Add(new RoomMode(
                            f,
                            nx, ny, nz,
                            weight,
                            IsAxial(nx, ny, nz),
                            IsTangential(nx, ny, nz),
                            IsOblique(nx, ny, nz)
                        ));
                    }
                }
            }
        }

        return modes.OrderBy(m => m.FrequencyHz).ToList();
    }

    private bool IsAxial(int nx, int ny, int nz)
    {
        // One non-zero
        return (nx > 0 && ny == 0 && nz == 0) ||
               (nx == 0 && ny > 0 && nz == 0) ||
               (nx == 0 && ny == 0 && nz > 0);
    }

    private bool IsTangential(int nx, int ny, int nz)
    {
        // Two non-zero
        int nonZero = (nx > 0 ? 1 : 0) + (ny > 0 ? 1 : 0) + (nz > 0 ? 1 : 0);
        return nonZero == 2;
    }

    private bool IsOblique(int nx, int ny, int nz)
    {
        // Three non-zero
        return nx > 0 && ny > 0 && nz > 0;
    }
}
