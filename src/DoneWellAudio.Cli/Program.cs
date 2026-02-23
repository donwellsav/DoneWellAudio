using System.Diagnostics;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using DoneWellAudio.Core;
using DoneWellAudio.Core.RoomPrediction;

namespace DoneWellAudio.Cli;

internal static class Program
{
    private static int Main(string[] args)
    {
        try
        {
            var opts = CliOptions.Parse(args);

            if (opts.ListDevices)
            {
                ListDevices();
                return 0;
            }

            var configDir = AppPaths.FindConfigDirectory();

            if (opts.PrintRoomPrediction || opts.PrintModes)
            {
                string profilePath = opts.RoomProfilePath ?? Path.Combine(configDir, "room_profile.json");
                if (!File.Exists(profilePath))
                {
                    // Fallback to example if default not found
                    if (opts.RoomProfilePath == null)
                        profilePath = Path.Combine(configDir, "room_profile.example.json");
                }

                var profile = RoomProfileLoader.Load(profilePath);
                if (profile == null)
                {
                    Console.WriteLine($"Room profile not found at {profilePath}");
                    return 1;
                }

                var calc = new RoomAcousticsCalculator();
                var result = calc.Calculate(profile);
                PrintRoomPrediction(result, opts.PrintModes);
                return 0;
            }

            int bellBands = opts.BellBands ?? 3;

            var eq = ConfigLoader.LoadEqProfile(configDir);
            var settings = ConfigLoader.LoadDetectorSettings(configDir);

            int deviceIndex = opts.DeviceIndex ?? PromptForDeviceIndex();

            using var enumerator = new MMDeviceEnumerator();
            var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active).ToList();
            if (deviceIndex < 0 || deviceIndex >= devices.Count)
                throw new ArgumentOutOfRangeException(nameof(deviceIndex), $"device-index must be 0..{devices.Count - 1}");

            var device = devices[deviceIndex];
            Console.WriteLine($"Using device: {device.FriendlyName}");

            var analyzer = new FeedbackAnalyzer(settings, eq, new MathNetFft());

            using var capture = new WasapiCapture(device);
            analyzer.SetSampleRate(capture.WaveFormat.SampleRate);

            var sw = Stopwatch.StartNew();
            double printEveryMs = 1000.0 / Math.Max(1, settings.Ui.UpdateHz);
            double nextPrint = 0;

            capture.DataAvailable += (_, e) =>
            {
                var mono = AudioConversion.ToMonoFloat(e.Buffer, e.BytesRecorded, capture.WaveFormat);
                var snap = analyzer.ProcessSamples(mono, bellBands);

                if (sw.Elapsed.TotalMilliseconds >= nextPrint)
                {
                    nextPrint += printEveryMs;
                    RenderSnapshot(snap, bellBands);
                }

                if (snap.IsFrozen && settings.FreezePolicy.StopCaptureOnFreeze)
                {
                    capture.StopRecording();
                }
            };

            capture.RecordingStopped += (_, __) => Console.WriteLine("Capture stopped.");

            Console.WriteLine("Press ENTER to stop. Scanning...");
            capture.StartRecording();

            Console.ReadLine();
            capture.StopRecording();

            return 0;
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine(ex);
            return 1;
        }
    }

    private static void RenderSnapshot(AnalysisSnapshot snap, int bellBands)
    {
        Console.WriteLine();
        Console.WriteLine(snap.IsFrozen ? "=== FROZEN ===" : "=== LIVE ===");

        if (snap.Candidates.Length == 0)
        {
            Console.WriteLine("No candidates yet.");
            return;
        }

        Console.WriteLine("Top candidates:");
        foreach (var c in snap.Candidates.Take(5))
        {
            Console.WriteLine($"- {c.Tracked.FrequencyHz,7:0} Hz | conf {c.Confidence:0.00} | Q~{c.EstimatedQ:0.0} | prom {c.Tracked.ProminenceDb:0.0} dB");
        }

        Console.WriteLine($"Recommendations (bell bands = {bellBands}):");
        foreach (var r in snap.Recommendations)
        {
            Console.WriteLine($"Band {r.BandIndex}: {r.FrequencyHz:0} Hz, cut {r.GainDb:0.0} dB, Q {r.Q:0.0}");
        }
    }

    private static void ListDevices()
    {
        using var enumerator = new MMDeviceEnumerator();
        var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active).ToList();
        Console.WriteLine("Capture devices:");
        for (int i = 0; i < devices.Count; i++)
        {
            Console.WriteLine($"[{i}] {devices[i].FriendlyName}");
        }
    }

    private static int PromptForDeviceIndex()
    {
        ListDevices();
        Console.Write("Select device index: ");
        var input = Console.ReadLine();
        return int.TryParse(input, out var idx) ? idx : 0;
    }

    private static void PrintRoomPrediction(RoomPredictionResult result, bool printModes)
    {
        Console.WriteLine($"Room Profile: {result.Profile.Name}");
        Console.WriteLine($"Dimensions: {result.Profile.Dimensions.Length:F2}m x {result.Profile.Dimensions.Width:F2}m x {result.Profile.Dimensions.Height:F2}m");
        Console.WriteLine($"Schroeder Frequency: {result.SchroederFrequencyHz:F2} Hz");

        Console.WriteLine("\n--- Band Analysis ---");
        Console.WriteLine($"{"Freq(Hz)",-10} {"A(m2)",-8} {"α_bar",-6} {"RT60(s)",-8} {"R",-8} {"Dc(m)",-8} {"SG(dB)",-8} {"SG_Use",-8} {"Warnings"}");
        foreach (var band in result.BandResults)
        {
             string warnings = string.Join(", ", band.Warnings);
             Console.WriteLine($"{band.FrequencyHz,-10:F0} {band.TotalAbsorptionArea,-8:F1} {band.AverageAbsorption,-6:F2} {band.Rt60Sabine,-8:F2} {band.RoomConstant,-8:F1} {band.CriticalDistance,-8:F2} {band.SystemGainBeforeFeedback,-8:F1} {band.SystemGainInUse,-8:F1} {warnings}");
        }

        if (printModes)
        {
            Console.WriteLine("\n--- Modal Analysis (Below Schroeder) ---");
             Console.WriteLine($"{"Freq(Hz)",-10} {"Indices",-12} {"Type",-12} {"Weight"}");
            foreach (var mode in result.ModesBelowSchroeder)
            {
                string type = mode.IsAxial ? "Axial" : mode.IsTangential ? "Tangential" : "Oblique";
                string indices = $"({mode.Nx},{mode.Ny},{mode.Nz})";
                Console.WriteLine($"{mode.FrequencyHz,-10:F2} {indices,-12} {type,-12} {mode.CouplingWeight:F2}");
            }
        }
    }
}

internal sealed record CliOptions(
    bool ListDevices,
    int? DeviceIndex,
    int? BellBands,
    string? RoomProfilePath,
    bool PrintRoomPrediction,
    bool PrintModes
)
{
    public static CliOptions Parse(string[] args)
    {
        bool list = args.Contains("--list-devices");
        int? deviceIndex = GetInt("--device-index");
        int? bell = GetInt("--bell-bands");

        string? profile = GetString("--room-profile");
        bool printRoom = args.Contains("--print-room-prediction");
        bool printModes = args.Contains("--print-modes");

        return new CliOptions(list, deviceIndex, bell, profile, printRoom, printModes);

        int? GetInt(string key)
        {
            int i = Array.IndexOf(args, key);
            if (i >= 0 && i + 1 < args.Length && int.TryParse(args[i + 1], out var v)) return v;
            return null;
        }

        string? GetString(string key)
        {
            int i = Array.IndexOf(args, key);
            if (i >= 0 && i + 1 < args.Length) return args[i + 1];
            return null;
        }
    }
}
