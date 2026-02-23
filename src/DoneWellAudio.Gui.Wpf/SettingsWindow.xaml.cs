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

        // Populate Combos
        SensitivityCombo.ItemsSource = Enum.GetValues(typeof(SensitivityLevel));
        ResponseCombo.ItemsSource = Enum.GetValues(typeof(ResponseSpeed));

        // Set Values
        SensitivityCombo.SelectedItem = _settings.Sensitivity;
        ResponseCombo.SelectedItem = _settings.ResponseSpeed;

        _initialized = true;
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
