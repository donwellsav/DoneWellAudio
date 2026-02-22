using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Threading;
using DoneWellAudio.Core;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace DoneWellAudio.Gui.Wpf;

public partial class MainWindow : Window
{
    private readonly ObservableCollection<CandidateRow> _candidateRows = new();
    private readonly ObservableCollection<RecRow> _recRows = new();

    private readonly object _snapLock = new();
    private AnalysisSnapshot _latest = new(DateTimeOffset.UtcNow, false,
        System.Collections.Immutable.ImmutableArray<FeedbackCandidate>.Empty,
        System.Collections.Immutable.ImmutableArray<EqRecommendation>.Empty);

    private WasapiCapture? _capture;
    private FeedbackAnalyzer? _analyzer;
    private DetectorSettings? _settings;
    private EqProfile? _eq;

    private bool _manualFrozen;
    private DispatcherTimer? _uiTimer;

    public MainWindow()
    {
        InitializeComponent();

        CandidatesList.ItemsSource = _candidateRows;
        RecsList.ItemsSource = _recRows;

        Loaded += (_, __) => Initialize();
        Closing += (_, __) => StopCapture();
    }

    private void Initialize()
    {
        // Load configs
        var configDir = AppPaths.FindConfigDirectory();
        _eq = ConfigLoader.LoadEqProfile(configDir);
        _settings = ConfigLoader.LoadDetectorSettings(configDir);

        // Populate bell band dropdown 1..7
        BellBandsCombo.ItemsSource = Enumerable.Range(_eq.BellBandsUi.Min, _eq.BellBandsUi.Max - _eq.BellBandsUi.Min + 1);
        BellBandsCombo.SelectedItem = Math.Clamp(3, _eq.BellBandsUi.Min, _eq.BellBandsUi.Max);

        // Populate device dropdown
        RefreshDevices();

        // Analyzer
        _analyzer = new FeedbackAnalyzer(_settings, _eq, new MathNetFft());

        // UI timer (throttled)
        _uiTimer = new DispatcherTimer();
        _uiTimer.Interval = TimeSpan.FromMilliseconds(1000.0 / Math.Max(1, _settings.Ui.UpdateHz));
        _uiTimer.Tick += (_, __) => RenderLatest();
        _uiTimer.Start();

        StatusText.Text = "Ready.";
    }

    private void RefreshDevices()
    {
        using var enumerator = new MMDeviceEnumerator();
        var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active).ToList();

        var items = devices.Select((d, i) => new DeviceItem(i, d)).ToList();
        DeviceCombo.ItemsSource = items;
        DeviceCombo.SelectedIndex = items.Count > 0 ? 0 : -1;
    }

    private int GetBellBands()
    {
        return BellBandsCombo.SelectedItem is int v ? v : 3;
    }

    private MMDevice? GetSelectedDevice()
    {
        return DeviceCombo.SelectedItem is DeviceItem item ? item.Device : null;
    }

    private void Start_Click(object sender, RoutedEventArgs e)
    {
        if (_settings is null || _eq is null || _analyzer is null) return;

        _manualFrozen = false;
        _analyzer.Reset();
        ClearLists();

        var device = GetSelectedDevice();
        if (device is null)
        {
            MessageBox.Show("No capture device selected.");
            return;
        }

        StopCapture();

        _capture = new WasapiCapture(device);
        _analyzer.SetSampleRate(_capture.WaveFormat.SampleRate);

        _capture.DataAvailable += (_, args) =>
        {
            if (_manualFrozen) return;
            if (_analyzer is null || _settings is null) return;

            var mono = AudioConversion.ToMonoFloat(args.Buffer, args.BytesRecorded, _capture.WaveFormat);
            var snap = _analyzer.ProcessSamples(mono, GetBellBands());

            lock (_snapLock) _latest = snap;

            if (snap.IsFrozen && _settings.FreezePolicy.StopCaptureOnFreeze)
            {
                // Stop capture on the capture thread; WasapiCapture tolerates StopRecording here.
                _capture.StopRecording();
            }
        };

        _capture.RecordingStopped += (_, __) =>
        {
            Dispatcher.Invoke(() => StatusText.Text = "Capture stopped.");
        };

        _capture.StartRecording();
        StatusText.Text = "Scanning…";
    }

    private void Freeze_Click(object sender, RoutedEventArgs e)
    {
        _manualFrozen = true;
        StatusText.Text = "Frozen (manual).";
    }

    private void Rescan_Click(object sender, RoutedEventArgs e)
    {
        if (_analyzer is null) return;
        _manualFrozen = false;
        _analyzer.Reset();
        ClearLists();
        StatusText.Text = "Rescan ready. Press Start.";
    }

    private void Stop_Click(object sender, RoutedEventArgs e)
    {
        StopCapture();
        StatusText.Text = "Stopped.";
    }

    private void StopCapture()
    {
        try
        {
            if (_capture is not null)
            {
                _capture.StopRecording();
                _capture.Dispose();
                _capture = null;
            }
        }
        catch
        {
            // ignore shutdown races
        }
    }

    private void RenderLatest()
    {
        AnalysisSnapshot snap;
        lock (_snapLock) snap = _latest;

        StatusText.Text = snap.IsFrozen ? "Frozen (auto). Adjust analog EQ, then Rescan." : (_manualFrozen ? "Frozen (manual)." : "Scanning…");

        // Candidates
        _candidateRows.Clear();
        foreach (var c in snap.Candidates.Take(20))
        {
            _candidateRows.Add(new CandidateRow(
                FrequencyHz: $"{c.Tracked.FrequencyHz:0}",
                Confidence: $"{c.Confidence:0.00}",
                EstimatedQ: $"{c.EstimatedQ:0.0}",
                ProminenceDb: $"{c.Tracked.ProminenceDb:0.0}",
                TotalHits: $"{c.Tracked.TotalHits}",
                FrequencyStdDevHz: $"{c.Tracked.FrequencyStdDevHz:0.0}"
            ));
        }

        // Recommendations
        _recRows.Clear();
        foreach (var r in snap.Recommendations)
        {
            _recRows.Add(new RecRow(
                BandIndex: $"{r.BandIndex}",
                FrequencyHz: $"{r.FrequencyHz:0}",
                GainDb: $"{r.GainDb:0.0}",
                Q: r.Q is null ? "" : $"{r.Q:0.0}"
            ));
        }
    }

    private void ClearLists()
    {
        _candidateRows.Clear();
        _recRows.Clear();
        lock (_snapLock)
        {
            _latest = new AnalysisSnapshot(DateTimeOffset.UtcNow, false,
                System.Collections.Immutable.ImmutableArray<FeedbackCandidate>.Empty,
                System.Collections.Immutable.ImmutableArray<EqRecommendation>.Empty);
        }
    }

    private sealed record DeviceItem(int Index, MMDevice Device)
    {
        public override string ToString() => $"[{Index}] {Device.FriendlyName}";
    }

    public sealed record CandidateRow(string FrequencyHz, string Confidence, string EstimatedQ, string ProminenceDb, string TotalHits, string FrequencyStdDevHz);
    public sealed record RecRow(string BandIndex, string FrequencyHz, string GainDb, string Q);
}
