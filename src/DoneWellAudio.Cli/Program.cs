using System.Diagnostics;
using NAudio.CoreAudioApi;
using NAudio.Wave;
using DoneWellAudio.Core;

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

            int bellBands = opts.BellBands ?? 3;

            var configDir = AppPaths.FindConfigDirectory();
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
}

internal sealed record CliOptions(bool ListDevices, int? DeviceIndex, int? BellBands)
{
    public static CliOptions Parse(string[] args)
    {
        bool list = args.Contains("--list-devices");
        int? deviceIndex = GetInt("--device-index");
        int? bell = GetInt("--bell-bands");
        return new CliOptions(list, deviceIndex, bell);

        int? GetInt(string key)
        {
            int i = Array.IndexOf(args, key);
            if (i >= 0 && i + 1 < args.Length && int.TryParse(args[i + 1], out var v)) return v;
            return null;
        }
    }
}
