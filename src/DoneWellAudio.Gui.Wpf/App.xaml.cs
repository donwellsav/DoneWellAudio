using System.IO;
using System.Windows;
using DoneWellAudio.Core;

namespace DoneWellAudio.Gui.Wpf;

public partial class App : Application
{
    public App()
    {
        DispatcherUnhandledException += App_DispatcherUnhandledException;
    }

    private void App_DispatcherUnhandledException(object sender, System.Windows.Threading.DispatcherUnhandledExceptionEventArgs e)
    {
        try
        {
            string configDir = AppPaths.FindConfigDirectory();
            string logPath = Path.Combine(configDir, "error.log");
            File.AppendAllText(logPath, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} - UNHANDLED EXCEPTION:\n{e.Exception}\n\n");
        }
        catch
        {
            // Silently fail if logging fails to avoid secondary crash
        }

        // Global error handler to catch startup crashes (e.g. missing config, resource errors)
        string msg = "A critical error occurred. For security, technical details have been hidden. Please check the application logs or contact support.";

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
