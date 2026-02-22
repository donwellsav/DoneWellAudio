using System.Windows;

namespace DoneWellAudio.Gui.Wpf;

public partial class SettingsWindow : Window
{
    private readonly UserSettings _settings;
    private bool _initialized;

    public SettingsWindow(UserSettings settings)
    {
        InitializeComponent();
        _settings = settings;

        // Apply current
        FontSizeSlider.Value = _settings.FontSize;
        UpdateDisplay(_settings.FontSize);

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

    private void Reset_Click(object sender, RoutedEventArgs e)
    {
        FontSizeSlider.Value = 18.0;
    }

    private void Close_Click(object sender, RoutedEventArgs e)
    {
        Close();
    }
}
