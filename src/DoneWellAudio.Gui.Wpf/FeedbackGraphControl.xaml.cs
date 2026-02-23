using System;
using System.Collections.Generic;
using System.Collections.Immutable;
using System.Linq;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using DoneWellAudio.Core;

namespace DoneWellAudio.Gui.Wpf;

public enum GraphMode
{
    Spectrum,
    Waterfall,
    Confidence
}

public partial class FeedbackGraphControl : UserControl
{
    private GraphMode _mode = GraphMode.Spectrum;
    public GraphMode Mode
    {
        get => _mode;
        set
        {
            if (_mode != value)
            {
                _mode = value;
                if (ModeText != null) ModeText.Text = _mode.ToString().ToUpper();
                UpdateVisibility();
                RenderAxis();
                Render(_currentSnapshot); // Re-render current data
            }
        }
    }

    private WriteableBitmap? _waterfallBmp;
    private AnalysisSnapshot? _currentSnapshot;
    private readonly SolidColorBrush _spectrumBrush = new SolidColorBrush(Color.FromRgb(0, 255, 0)); // Green
    private readonly SolidColorBrush _confidenceBrush = new SolidColorBrush(Color.FromRgb(255, 170, 0)); // Orange
    private readonly SolidColorBrush _gridBrush = new SolidColorBrush(Color.FromArgb(50, 255, 255, 255));
    private readonly SolidColorBrush _axisTextBrush = new SolidColorBrush(Colors.Gray);
    private readonly SolidColorBrush _cursorBrush = new SolidColorBrush(Colors.White) { Opacity = 0.5 };

    private const double MinFreq = 20.0;
    private double MaxFreq = 24000.0; // Updated from snapshot
    private const double MinDb = -120.0;
    private const double MaxDb = 0.0;

    public FeedbackGraphControl()
    {
        InitializeComponent();
        this.SizeChanged += (s, e) => {
            RenderAxis();
            Render(_currentSnapshot);
        };
    }

    private void UpdateVisibility()
    {
        if (WaterfallImage != null)
            WaterfallImage.Visibility = _mode == GraphMode.Waterfall ? Visibility.Visible : Visibility.Collapsed;

        if (MainCanvas != null)
            MainCanvas.Visibility = _mode != GraphMode.Waterfall ? Visibility.Visible : Visibility.Collapsed;
    }

    public void Render(AnalysisSnapshot? snapshot)
    {
        _currentSnapshot = snapshot;
        if (snapshot == null) return;

        if (this.ActualWidth <= 0 || this.ActualHeight <= 0) return;

        // Update MaxFreq if sample rate changed
        if (snapshot.SampleRate > 0)
            MaxFreq = snapshot.SampleRate / 2.0;

        switch (_mode)
        {
            case GraphMode.Spectrum:
                RenderSpectrum(snapshot);
                break;
            case GraphMode.Confidence:
                RenderConfidence(snapshot);
                break;
            case GraphMode.Waterfall:
                RenderWaterfall(snapshot);
                break;
        }
    }

    // --- Helper Math functions ---
    private double FreqToX(double freq, double width)
    {
        if (freq <= MinFreq) return 0;
        if (freq >= MaxFreq) return width;
        double minLog = Math.Log10(MinFreq);
        double maxLog = Math.Log10(MaxFreq);
        return width * (Math.Log10(freq) - minLog) / (maxLog - minLog);
    }

    private double XToFreq(double x, double width)
    {
        if (width <= 0) return MinFreq;
        double minLog = Math.Log10(MinFreq);
        double maxLog = Math.Log10(MaxFreq);
        double logFreq = (x / width) * (maxLog - minLog) + minLog;
        return Math.Pow(10, logFreq);
    }

    private double DbToY(double db, double height)
    {
         double range = MaxDb - MinDb;
         return height - ((db - MinDb) / range * height);
    }

    private void RenderAxis()
    {
        if (AxisCanvas == null || ActualWidth <= 0 || ActualHeight <= 0) return;
        AxisCanvas.Children.Clear();

        double w = ActualWidth;
        double h = ActualHeight;

        // Freq Ticks
        double[] freqs = { 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000 };
        foreach (var f in freqs)
        {
            double x = FreqToX(f, w);
            if (x >= 0 && x <= w)
            {
                var line = new Line { X1 = x, Y1 = 0, X2 = x, Y2 = h, Stroke = _gridBrush, StrokeThickness = 1 };
                AxisCanvas.Children.Add(line);

                var txt = new TextBlock { Text = f >= 1000 ? (f/1000) + "k" : f.ToString(), FontSize = 10, Foreground = _axisTextBrush };
                Canvas.SetLeft(txt, x + 2);
                Canvas.SetTop(txt, h - 15);
                AxisCanvas.Children.Add(txt);
            }
        }

        // Amplitude Ticks
        for (double db = 0; db >= MinDb; db -= 20)
        {
            double y = DbToY(db, h);
            if (y >= 0 && y <= h)
            {
                var line = new Line { X1 = 0, Y1 = y, X2 = w, Y2 = y, Stroke = _gridBrush, StrokeThickness = 1 };
                AxisCanvas.Children.Add(line);

                var txt = new TextBlock { Text = db + "dB", FontSize = 10, Foreground = _axisTextBrush };
                Canvas.SetLeft(txt, 2);
                Canvas.SetTop(txt, y - 15);
                AxisCanvas.Children.Add(txt);
            }
        }
    }

    private void RenderSpectrum(AnalysisSnapshot snapshot)
    {
        if (MainCanvas == null) return;
        MainCanvas.Children.Clear();

        if (snapshot.SpectrumDb.IsDefaultOrEmpty) return;

        var spectrum = snapshot.SpectrumDb;
        double width = this.ActualWidth;
        double height = this.ActualHeight;

        var points = new PointCollection();

        // Use binHz based on max freq
        double binHz = MaxFreq / (spectrum.Length - 1);

        for (int i = 0; i < spectrum.Length; i++)
        {
            double freq = i * binHz;
            if (freq < MinFreq) continue;

            double x = FreqToX(freq, width);
            double db = spectrum[i];
            double y = DbToY(db, height);

            if (y < 0) y = 0;
            if (y > height) y = height;

            points.Add(new Point(x, y));
        }

        var polyline = new Polyline
        {
            Stroke = _spectrumBrush,
            StrokeThickness = 1,
            Points = points
        };

        MainCanvas.Children.Add(polyline);
    }

    private void RenderConfidence(AnalysisSnapshot snapshot)
    {
        if (MainCanvas == null) return;
        MainCanvas.Children.Clear();

        if (snapshot.Candidates.IsDefaultOrEmpty) return;

        double width = this.ActualWidth;
        double height = this.ActualHeight;

        foreach (var c in snapshot.Candidates)
        {
            double freq = c.Tracked.FrequencyHz;
            double conf = c.Confidence;

            double x = FreqToX(freq, width);
            double h = conf * height;
            double y = height - h;

            if (x >= 0 && x < width)
            {
                var rect = new Rectangle
                {
                    Width = 4,
                    Height = h,
                    Fill = _confidenceBrush,
                    Opacity = 0.8
                };

                Canvas.SetLeft(rect, x - 2);
                Canvas.SetTop(rect, y);
                MainCanvas.Children.Add(rect);
            }
        }
    }

    private void RenderWaterfall(AnalysisSnapshot snapshot)
    {
        if (snapshot.SpectrumDb.IsDefaultOrEmpty) return;
        if (WaterfallImage == null) return;

        int width = (int)this.ActualWidth;
        int height = (int)this.ActualHeight;

        if (width <= 0 || height <= 0) return;

        // Initialize Bitmap if needed
        if (_waterfallBmp == null || _waterfallBmp.PixelWidth != width || _waterfallBmp.PixelHeight != height)
        {
            _waterfallBmp = new WriteableBitmap(width, height, 96, 96, PixelFormats.Bgr32, null);
            WaterfallImage.Source = _waterfallBmp;
             _waterfallBmp.WritePixels(new Int32Rect(0, 0, width, height), new int[width * height], width * 4, 0);
        }

        int stride = width * 4;
        var pixels = new byte[height * stride];
        _waterfallBmp.CopyPixels(pixels, stride, 0);
        Array.Copy(pixels, stride, pixels, 0, (height - 1) * stride);

        // Generate new row
        var spectrum = snapshot.SpectrumDb;
        double minDb = MinDb;
        double maxDb = MaxDb;
        int newRowStart = (height - 1) * stride;

        double binHz = MaxFreq / (spectrum.Length - 1);

        for (int x = 0; x < width; x++)
        {
            double freq = XToFreq(x, width);
            int bin = (int)(freq / binHz);

            if (bin < 0) bin = 0;
            if (bin >= spectrum.Length) bin = spectrum.Length - 1;

            double db = spectrum[bin];
            double val = Math.Clamp((db - minDb) / (maxDb - minDb), 0, 1);

            // Color map
            byte r = 0, g = 0, b = 0;
            if (val < 0.25) { b = (byte)(val * 4 * 255); }
            else if (val < 0.5) { b = (byte)((0.5 - val) * 4 * 255); r = (byte)((val - 0.25) * 4 * 255); }
            else if (val < 0.75) { r = 255; g = (byte)((val - 0.5) * 4 * 255); }
            else { r = 255; g = 255; b = (byte)((val - 0.75) * 4 * 255); }

            int p = newRowStart + x * 4;
            pixels[p] = b; pixels[p + 1] = g; pixels[p + 2] = r; pixels[p + 3] = 255;
        }

        _waterfallBmp.WritePixels(new Int32Rect(0, 0, width, height), pixels, stride, 0);
    }

    private void Grid_MouseMove(object sender, System.Windows.Input.MouseEventArgs e)
    {
        if (CursorCanvas == null || DataText == null) return;

        double width = ActualWidth;
        double height = ActualHeight;
        Point p = e.GetPosition(this);
        double x = p.X;

        if (x < 0 || x > width) return;

        double freq = XToFreq(x, width);
        double db = MinDb;

        // Find dB value
        if (_currentSnapshot != null && !_currentSnapshot.SpectrumDb.IsDefaultOrEmpty)
        {
            var spectrum = _currentSnapshot.SpectrumDb;
            double binHz = MaxFreq / (spectrum.Length - 1);
            int bin = (int)(freq / binHz);
            if (bin >= 0 && bin < spectrum.Length)
                db = spectrum[bin];
        }

        DataText.Text = $"{freq:F0} Hz | {db:F1} dB";

        CursorCanvas.Children.Clear();
        var line = new Line { X1 = x, Y1 = 0, X2 = x, Y2 = height, Stroke = _cursorBrush, StrokeThickness = 1, StrokeDashArray = new DoubleCollection { 4, 4 } };
        CursorCanvas.Children.Add(line);
    }

    private void Grid_MouseLeave(object sender, System.Windows.Input.MouseEventArgs e)
    {
        if (CursorCanvas != null) CursorCanvas.Children.Clear();
        if (DataText != null) DataText.Text = "";
    }
}
