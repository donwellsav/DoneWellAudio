using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Input;
using System.Windows.Threading;
using DoneWellAudio.Core;
using DoneWellAudio.Core.RoomPrediction;
using NAudio.CoreAudioApi;
using NAudio.Wave;

namespace DoneWellAudio.Gui.Wpf;

public partial class MainWindow : Window
{
    private readonly ObservableCollection<CandidateRow> _candidateRows = new();
    private readonly ObservableCollection<RecRow> _recRows = new();
    private readonly ObservableCollection<RoomAcousticResultUi> _roomRows = new();
    private readonly ObservableCollection<RoomModeUi> _modeRows = new();

    private readonly object _snapLock = new();
    private AnalysisSnapshot _latest = new(DateTimeOffset.UtcNow, false,
        System.Collections.Immutable.ImmutableArray<FeedbackCandidate>.Empty,
        System.Collections.Immutable.ImmutableArray<EqRecommendation>.Empty);

    private WasapiCapture? _capture;
    private FeedbackAnalyzer? _analyzer;
    private DetectorSettings? _settings;
    private DetectorSettings? _originalSettings;
    private EqProfile? _eq;
    private UserSettings? _userSettings;

    private bool _manualFrozen;
    private DispatcherTimer? _uiTimer;

    private volatile int _targetBellBands = 3;
    private volatile bool _filterHarmonics = true;
    private volatile float _currentLevel = 0f;

    public MainWindow()
    {
        InitializeComponent();

        CandidatesList.ItemsSource = _candidateRows;
        RecsList.ItemsSource = _recRows;
        RoomBandsList.ItemsSource = _roomRows;
        RoomModesList.ItemsSource = _modeRows;

        Loaded += (_, __) => Initialize();
        Closing += (_, __) => StopCapture();
    }

    private void Initialize()
    {
        try
        {
            // Load configs
            var configDir = AppPaths.FindConfigDirectory();
            _eq = ConfigLoader.LoadEqProfile(configDir);
            _settings = ConfigLoader.LoadDetectorSettings(configDir);
            _originalSettings = _settings;
            _userSettings = UserSettings.Load();

            // Apply User Settings
            ContinuousToggle.IsChecked = _userSettings.ContinuousMode;
            Application.Current.Resources["BaseFontSize"] = _userSettings.FontSize;
            ApplyDetectorOverrides();

            // Populate bell band dropdown 1..7
            BellBandsCombo.ItemsSource = Enumerable.Range(_eq.BellBandsUi.Min, _eq.BellBandsUi.Max - _eq.BellBandsUi.Min + 1);
            BellBandsCombo.SelectedItem = Math.Clamp(3, _eq.BellBandsUi.Min, _eq.BellBandsUi.Max);

            // Init fields
            if (BellBandsCombo.SelectedItem is int b) _targetBellBands = b;
            _filterHarmonics = HarmonicFilterCheck.IsChecked ?? true;

            // Events
            BellBandsCombo.SelectionChanged += (_, __) =>
            {
                if (BellBandsCombo.SelectedItem is int v) _targetBellBands = v;
            };
            HarmonicFilterCheck.Checked += (_, __) => _filterHarmonics = true;
            HarmonicFilterCheck.Unchecked += (_, __) => _filterHarmonics = false;

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

            var version = System.Reflection.Assembly.GetExecutingAssembly().GetName().Version;
            if (version != null)
            {
                VersionText.Text = $"v{version.Major}.{version.Minor}.{version.Build}";
            }

            // Load Room Profile (Best effort)
            try
            {
                var profilePath = System.IO.Path.Combine(configDir, "room_profile.json");
                if (!System.IO.File.Exists(profilePath))
                    profilePath = System.IO.Path.Combine(configDir, "room_profile.example.json");

                if (System.IO.File.Exists(profilePath))
                {
                    var profile = RoomProfileLoader.Load(profilePath);
                    if (profile != null)
                    {
                        var calc = new RoomAcousticsCalculator();
                        var result = calc.Calculate(profile);

                        if (_analyzer != null) _analyzer.SetRoomPrediction(result);

                        RoomProfileNameText.Text = profile.Name;
                        RoomDimensionsText.Text = $"{profile.Dimensions.Length}x{profile.Dimensions.Width}x{profile.Dimensions.Height}m";

                        foreach (var band in result.BandResults)
                        {
                            _roomRows.Add(new RoomAcousticResultUi(
                                band.FrequencyHz,
                                band.Rt60Sabine,
                                band.RoomConstant,
                                band.CriticalDistance,
                                band.SystemGainInUse,
                                string.Join(", ", band.Warnings)
                            ));
                        }

                        foreach (var mode in result.ModesBelowSchroeder)
                        {
                            string type = mode.IsAxial ? "Axial" : mode.IsTangential ? "Tangential" : "Oblique";
                            _modeRows.Add(new RoomModeUi(mode.FrequencyHz, mode.CouplingWeight, type));
                        }
                    }
                }
                else
                {
                    RoomProfileNameText.Text = "Not Found";
                }
            }
            catch (Exception ex)
            {
                RoomProfileNameText.Text = "Error Loading";
                // Log silently or show warning
            }
        }
        catch (Exception ex)
        {
            CustomMessageBox.Show($"Failed to initialize application:\n{ex.Message}\n\nPlease ensure you have extracted all files from the ZIP archive, including the 'config' folder.", "Startup Error");
            Close();
        }
    }

    private void RefreshDevices()
    {
        using var enumerator = new MMDeviceEnumerator();
        var devices = enumerator.EnumerateAudioEndPoints(DataFlow.Capture, DeviceState.Active).ToList();

        var items = devices.Select((d, i) => new DeviceItem(i, d)).ToList();
        DeviceCombo.ItemsSource = items;
        DeviceCombo.SelectedIndex = items.Count > 0 ? 0 : -1;
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
            CustomMessageBox.Show("No capture device selected.", "Error");
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

            // Calculate Level (RMS)
            float sum = 0;
            for (int i = 0; i < mono.Length; i++) sum += mono[i] * mono[i];
            _currentLevel = (float)Math.Sqrt(sum / mono.Length);

            var snap = _analyzer.ProcessSamples(mono, _targetBellBands, _filterHarmonics);

            lock (_snapLock) _latest = snap;

            if (snap.IsFrozen && _settings.FreezePolicy.StopCaptureOnFreeze)
            {
                // Stop capture on the capture thread; WasapiCapture tolerates StopRecording here.
                _capture.StopRecording();
            }
        };

        _capture.RecordingStopped += (_, __) =>
        {
            Dispatcher.Invoke(() =>
            {
                StatusText.Text = "Capture stopped.";
                InputLevelMeter.Value = 0;
            });
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

    private void ContinuousToggle_Click(object sender, RoutedEventArgs e)
    {
        if (_userSettings != null)
        {
            _userSettings.ContinuousMode = ContinuousToggle.IsChecked ?? false;
            _userSettings.Save();
            ApplyDetectorOverrides();
        }
    }

    private void Window_KeyDown(object sender, KeyEventArgs e)
    {
        if (e.Handled) return;

        switch (e.Key)
        {
            case Key.Space:
                if (_capture == null)
                    Start_Click(sender, new RoutedEventArgs());
                else
                    Stop_Click(sender, new RoutedEventArgs());
                break;
            case Key.F:
                Freeze_Click(sender, new RoutedEventArgs());
                break;
            case Key.R:
                Rescan_Click(sender, new RoutedEventArgs());
                break;
        }
    }

    private void Settings_Click(object sender, RoutedEventArgs e)
    {
        if (_userSettings == null) _userSettings = new UserSettings();
        var dlg = new SettingsWindow(_userSettings, ApplyDetectorOverrides);
        dlg.Owner = this;
        dlg.ShowDialog();

        ApplyDetectorOverrides();
    }

    private void Exit_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }

    private void About_Click(object sender, RoutedEventArgs e)
    {
        var about = new AboutWindow();
        about.Owner = this;
        about.ShowDialog();
    }

    private void UseRoomPriorCheck_Changed(object sender, RoutedEventArgs e)
    {
        ApplyDetectorOverrides();
    }

    private void ApplyDetectorOverrides()
    {
        if (_settings == null || _userSettings == null || _originalSettings == null) return;

        bool useRoomPrior = UseRoomPriorCheck.IsChecked ?? false;

        // Use configured weight or default 0.2 if 0
        double priorWeight = _originalSettings.Detection.ConfidenceWeights.RoomPrior;
        if (priorWeight <= 0.0001) priorWeight = 0.2;

        // Rebuild from original to preserve static config values while applying overrides
        _settings = _originalSettings with
        {
            ContinuousMode = _userSettings.ContinuousMode,
            Sensitivity = _userSettings.Sensitivity,
            ResponseSpeed = _userSettings.ResponseSpeed,
            Detection = _originalSettings.Detection with
            {
                ConfidenceWeights = _originalSettings.Detection.ConfidenceWeights with { RoomPrior = useRoomPrior ? priorWeight : 0.0 }
            }
        };

        if (_analyzer != null)
            _analyzer.UpdateSettings(_settings);
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
        // Update Level Meter
        InputLevelMeter.Value = _currentLevel;

        // Clipping indicator
        if (_currentLevel > 0.98)
            InputLevelMeter.Foreground = (System.Windows.Media.Brush)Application.Current.Resources["AppUrgentBrush"]; // Red
        else
            InputLevelMeter.Foreground = (System.Windows.Media.Brush)Application.Current.Resources["AppAccentHighlightBrush"]; // Orange

        AnalysisSnapshot snap;
        lock (_snapLock) snap = _latest;

        StatusText.Text = snap.IsFrozen ? "Frozen (auto). Adjust analog EQ, then Rescan." : (_manualFrozen ? "Frozen (manual)." : "Scanning…");

        // Candidates
        _candidateRows.Clear();
        foreach (var c in snap.Candidates.Take(20))
        {
            // Urgency Logic
            // High (Red): Confidence > 0.8 OR Prominence > 10dB
            // Medium (Orange): Confidence > 0.5 OR Prominence > 5dB
            // Low (Yellow): Default

            string color = "White"; // Default fallback
            if (Application.Current.Resources["AppUrgentBrush"] is System.Windows.Media.SolidColorBrush red) color = red.Color.ToString();
            if (Application.Current.Resources["AppWarningBrush"] is System.Windows.Media.SolidColorBrush orange) color = orange.Color.ToString();
            if (Application.Current.Resources["AppSafeBrush"] is System.Windows.Media.SolidColorBrush yellow) color = yellow.Color.ToString();

            // Re-eval
            string finalColor = "#FFF0F0F0"; // Default Text

            if (c.Confidence > 0.8 || c.Tracked.ProminenceDb > 10.0)
                finalColor = "#FFFF5555"; // Red
            else if (c.Confidence > 0.5 || c.Tracked.ProminenceDb > 5.0)
                finalColor = "#FFFFAA00"; // Orange
            else
                finalColor = "#FFFFEEAA"; // Yellow-ish

            _candidateRows.Add(new CandidateRow(
                FrequencyHz: $"{c.Tracked.FrequencyHz:0}",
                Confidence: $"{c.Confidence:0.00}",
                EstimatedQ: $"{c.EstimatedQ:0.0}",
                ProminenceDb: $"{c.Tracked.ProminenceDb:0.0}",
                TotalHits: $"{c.Tracked.TotalHits}",
                FrequencyStdDevHz: $"{c.Tracked.FrequencyStdDevHz:0.0}",
                RowColor: finalColor
            ));
        }

        // Recommendations
        _recRows.Clear();
        int n = _targetBellBands;
        for (int i = 0; i < n; i++)
        {
            if (i < snap.Recommendations.Length)
            {
                var r = snap.Recommendations[i];
                _recRows.Add(new RecRow(
                    BandIndex: $"{r.BandIndex}",
                    FrequencyHz: $"{r.FrequencyHz:0}",
                    GainDb: $"{r.GainDb:0.0}",
                    Q: r.Q is null ? "" : $"{r.Q:0.0}"
                ));
            }
            else
            {
                _recRows.Add(new RecRow(
                    BandIndex: $"{i + 1}",
                    FrequencyHz: "--",
                    GainDb: "--",
                    Q: ""
                ));
            }
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

    private void Snapshot_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            // Get DPI
            var dpi = System.Windows.Media.VisualTreeHelper.GetDpi(this);
            int width = (int)(this.ActualWidth * dpi.DpiScaleX);
            int height = (int)(this.ActualHeight * dpi.DpiScaleY);

            // Render the window client area
            var rtb = new System.Windows.Media.Imaging.RenderTargetBitmap(
                width,
                height,
                dpi.PixelsPerInchX,
                dpi.PixelsPerInchY,
                System.Windows.Media.PixelFormats.Pbgra32);

            rtb.Render(this);

            var encoder = new System.Windows.Media.Imaging.JpegBitmapEncoder();
            encoder.Frames.Add(System.Windows.Media.Imaging.BitmapFrame.Create(rtb));
            encoder.QualityLevel = 90;

            string desktop = Environment.GetFolderPath(Environment.SpecialFolder.Desktop);
            string filename = $"DoneWell_Snapshot_{DateTime.Now:yyyyMMdd_HHmmss}.jpg";
            string path = System.IO.Path.Combine(desktop, filename);

            using (var fs = new System.IO.FileStream(path, System.IO.FileMode.Create))
            {
                encoder.Save(fs);
            }

            StatusText.Text = $"Snapshot saved to Desktop: {filename}";
        }
        catch (Exception ex)
        {
            StatusText.Text = $"Snapshot failed: {ex.Message}";
        }
    }

    private sealed record DeviceItem(int Index, MMDevice Device)
    {
        public override string ToString() => $"[{Index}] {Device.FriendlyName}";
    }

    public sealed record CandidateRow(string FrequencyHz, string Confidence, string EstimatedQ, string ProminenceDb, string TotalHits, string FrequencyStdDevHz, string RowColor);
    public sealed record RecRow(string BandIndex, string FrequencyHz, string GainDb, string Q);

    public sealed record RoomAcousticResultUi(
        double FrequencyHz,
        double Rt60Sabine,
        double RoomConstant,
        double CriticalDistance,
        double SystemGainInUse,
        string WarningsString
    );

    public sealed record RoomModeUi(
        double FrequencyHz,
        double CouplingWeight,
        string TypeString
    );
}
