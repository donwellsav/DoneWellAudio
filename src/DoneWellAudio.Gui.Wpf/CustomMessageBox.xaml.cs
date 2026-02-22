using System.Windows;

namespace DoneWellAudio.Gui.Wpf;

public partial class CustomMessageBox : Window
{
    public CustomMessageBox(string message, string title)
    {
        InitializeComponent();
        this.Title = title;
        MessageText.Text = message;

        // Ensure proper ownership and center on owner if available
        if (Application.Current.MainWindow != null && Application.Current.MainWindow.IsVisible)
        {
            this.Owner = Application.Current.MainWindow;
            this.WindowStartupLocation = WindowStartupLocation.CenterOwner;
        }
        else
        {
            this.WindowStartupLocation = WindowStartupLocation.CenterScreen;
        }
    }

    private void OkButton_Click(object sender, RoutedEventArgs e)
    {
        this.Close();
    }

    public static void Show(string message, string title = "Message")
    {
        var msgBox = new CustomMessageBox(message, title);
        msgBox.ShowDialog();
    }
}
