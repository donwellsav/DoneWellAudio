using System.Windows;
using System.Windows.Controls;
using DoneWellAudio.Core;

namespace DoneWellAudio.Gui.Wpf;

public partial class SettingsWindow : Window
{
    private readonly UserSettings _settings;
    private readonly Action? _onSettingsChanged;
    private bool _initialized;

    public SettingsWindow(UserSettings settings, int minBellBands, int maxBellBands, Action? onSettingsChanged = null)
    {
        InitializeComponent();
        _settings = settings;
        _onSettingsChanged = onSettingsChanged;

        // Populate Combos
        SensitivityCombo.ItemsSource = Enum.GetValues(typeof(SensitivityLevel));
        ResponseCombo.ItemsSource = Enum.GetValues(typeof(ResponseSpeed));
        BellBandsCombo.ItemsSource = Enumerable.Range(minBellBands, maxBellBands - minBellBands + 1);

        // Set Values
        SensitivityCombo.SelectedItem = _settings.Sensitivity;
        ResponseCombo.SelectedItem = _settings.ResponseSpeed;
        BellBandsCombo.SelectedItem = Math.Clamp(_settings.BellBands, minBellBands, maxBellBands);
        HarmonicFilterCheck.IsChecked = _settings.FilterHarmonics;
        ImperialCheck.IsChecked = _settings.UseImperialUnits;
        RoomPriorCheck.IsChecked = _settings.UseRoomPrior;

        // Advanced
        SpectralWhiteningCheck.IsChecked = _settings.SpectralWhitening;
        FreezeThresholdSlider.Value = _settings.ConfidenceThreshold;
        DriftSlider.Value = _settings.MaxFrequencyDriftHz;
        ProminenceSlider.Value = _settings.MinProminenceDb;

        UpdateCustomSensitivityVisibility();

        _initialized = true;
    }

    private void UpdateCustomSensitivityVisibility()
    {
        if (SensitivityCombo.SelectedItem is SensitivityLevel level && level == SensitivityLevel.Custom)
        {
            CustomSensitivityPanel.Visibility = Visibility.Visible;
        }
        else
        {
            CustomSensitivityPanel.Visibility = Visibility.Collapsed;
        }
    }

    private void SensitivityCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_initialized) return;
        if (SensitivityCombo.SelectedItem is SensitivityLevel level)
        {
            _settings.Sensitivity = level;
            UpdateCustomSensitivityVisibility();
            SaveAndNotify();
        }
    }

    private void ResponseCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_initialized) return;
        if (ResponseCombo.SelectedItem is ResponseSpeed speed)
        {
            _settings.ResponseSpeed = speed;
            SaveAndNotify();
        }
    }

    private void BellBandsCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_initialized) return;
        if (BellBandsCombo.SelectedItem is int bands)
        {
            _settings.BellBands = bands;
            SaveAndNotify();
        }
    }

    private void HarmonicFilterCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (!_initialized) return;
        _settings.FilterHarmonics = HarmonicFilterCheck.IsChecked ?? true;
        SaveAndNotify();
    }

    private void RoomPriorCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (!_initialized) return;
        _settings.UseRoomPrior = RoomPriorCheck.IsChecked ?? false;
        SaveAndNotify();
    }

    private void ImperialCheck_Changed(object sender, RoutedEventArgs e)
    {
        if (!_initialized) return;
        _settings.UseImperialUnits = ImperialCheck.IsChecked ?? false;
        SaveAndNotify();
    }

    private void Advanced_Changed(object sender, RoutedEventArgs e)
    {
        if (!_initialized) return;
        _settings.SpectralWhitening = SpectralWhiteningCheck.IsChecked ?? true;
        _settings.ConfidenceThreshold = FreezeThresholdSlider.Value;
        _settings.MaxFrequencyDriftHz = DriftSlider.Value;
        _settings.MinProminenceDb = ProminenceSlider.Value;
        SaveAndNotify();
    }

    private void Reset_Click(object sender, RoutedEventArgs e)
    {
        _initialized = false;

        SensitivityCombo.SelectedItem = SensitivityLevel.Medium;
        ResponseCombo.SelectedItem = ResponseSpeed.Medium;
        BellBandsCombo.SelectedItem = 3;
        HarmonicFilterCheck.IsChecked = true;
        ImperialCheck.IsChecked = true;
        RoomPriorCheck.IsChecked = false;

        SpectralWhiteningCheck.IsChecked = true;
        FreezeThresholdSlider.Value = 0.72;
        DriftSlider.Value = 8.0;
        ProminenceSlider.Value = 6.0;

        _settings.Sensitivity = SensitivityLevel.Medium;
        _settings.ResponseSpeed = ResponseSpeed.Medium;
        _settings.BellBands = 3;
        _settings.FilterHarmonics = true;
        _settings.UseImperialUnits = true;
        _settings.UseRoomPrior = false;
        _settings.SpectralWhitening = true;
        _settings.ConfidenceThreshold = 0.72;
        _settings.MaxFrequencyDriftHz = 8.0;
        _settings.MinProminenceDb = 6.0;

        UpdateCustomSensitivityVisibility();

        _initialized = true;
        SaveAndNotify();
    }

    private void SaveAndNotify()
    {
        _settings.Save();
        _onSettingsChanged?.Invoke();
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
