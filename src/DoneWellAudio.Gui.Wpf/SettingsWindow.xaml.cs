using System.Windows;
using System.Windows.Controls;
using DoneWellAudio.Core;

namespace DoneWellAudio.Gui.Wpf;

public partial class SettingsWindow : Window
{
    private readonly UserSettings _settings;
    private readonly Action? _onSettingsChanged;
    private bool _initialized;

    public SettingsWindow(UserSettings settings, Action? onSettingsChanged = null)
    {
        InitializeComponent();
        _settings = settings;
        _onSettingsChanged = onSettingsChanged;

        // Apply current
        FontSizeSlider.Value = _settings.FontSize;
        UpdateDisplay(_settings.FontSize);

        // Populate Combos
        SensitivityCombo.ItemsSource = Enum.GetValues(typeof(SensitivityLevel));
        ResponseCombo.ItemsSource = Enum.GetValues(typeof(ResponseSpeed));

        // Set Values
        ContinuousCheck.IsChecked = _settings.ContinuousMode;
        SensitivityCombo.SelectedItem = _settings.Sensitivity;
        ResponseCombo.SelectedItem = _settings.ResponseSpeed;

        _initialized = true;
    }

    private void FontSizeSlider_ValueChanged(object sender, RoutedPropertyChangedEventArgs<double> e)
    {
        if (!_initialized) return;

        double newVal = e.NewValue;
        _settings.FontSize = newVal;

        UpdateDisplay(newVal);

        // Update global resource
        Application.Current.Resources["BaseFontSize"] = newVal;

        // Auto-save
        _settings.Save();
    }

    private void UpdateDisplay(double size)
    {
        if (FontSizeValueText != null)
            FontSizeValueText.Text = size.ToString("0");
    }

    private void ContinuousCheck_Click(object sender, RoutedEventArgs e)
    {
        if (!_initialized) return;
        _settings.ContinuousMode = ContinuousCheck.IsChecked ?? false;
        _settings.Save();
        _onSettingsChanged?.Invoke();
    }

    private void SensitivityCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_initialized) return;
        if (SensitivityCombo.SelectedItem is SensitivityLevel level)
        {
            _settings.Sensitivity = level;
            _settings.Save();
            _onSettingsChanged?.Invoke();
        }
    }

    private void ResponseCombo_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_initialized) return;
        if (ResponseCombo.SelectedItem is ResponseSpeed speed)
        {
            _settings.ResponseSpeed = speed;
            _settings.Save();
            _onSettingsChanged?.Invoke();
        }
    }

    private void Reset_Click(object sender, RoutedEventArgs e)
    {
        FontSizeSlider.Value = 18.0;

        ContinuousCheck.IsChecked = false;
        _settings.ContinuousMode = false;

        SensitivityCombo.SelectedItem = SensitivityLevel.Medium;
        ResponseCombo.SelectedItem = ResponseSpeed.Medium;

        _settings.Save();
        _onSettingsChanged?.Invoke();
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
