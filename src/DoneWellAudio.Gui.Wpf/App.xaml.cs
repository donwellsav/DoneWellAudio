using System.Windows;

namespace DoneWellAudio.Gui.Wpf;

public partial class App : Application
{
    public App()
    {
        DispatcherUnhandledException += App_DispatcherUnhandledException;
    }

    private void App_DispatcherUnhandledException(object sender, System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
    {
        // Global error handler to catch startup crashes (e.g. missing config, resource errors)
        string msg = $"A critical error occurred:\n{e.Exception.Message}\n\nStack Trace:\n{e.Exception.StackTrace}";

        // Try to use our custom message box, fallback to system if that fails (e.g. resource issues)
        try
        {
            CustomMessageBox.Show(msg, "Error");
        }
        catch
        {
            MessageBox.Show(msg, "Error", MessageBoxButton.OK, MessageBoxImage.Error);
        }

        e.Handled = true;
        Shutdown(1);
    }
}
