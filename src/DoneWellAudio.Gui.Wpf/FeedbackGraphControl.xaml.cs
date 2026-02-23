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
                ModeText.Text = _mode.ToString().ToUpper();
                UpdateVisibility();
                Render(_currentSnapshot); // Re-render current data
            }
        }
    }

    private WriteableBitmap? _waterfallBmp;
    private AnalysisSnapshot? _currentSnapshot;
    private readonly SolidColorBrush _spectrumBrush = new SolidColorBrush(Color.FromRgb(0, 255, 0)); // Green
    private readonly SolidColorBrush _confidenceBrush = new SolidColorBrush(Color.FromRgb(255, 170, 0)); // Orange
    private readonly SolidColorBrush _gridBrush = new SolidColorBrush(Color.FromArgb(50, 255, 255, 255));

    public FeedbackGraphControl()
    {
        InitializeComponent();
        this.SizeChanged += (s, e) => Render(_currentSnapshot);
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

    private void RenderSpectrum(AnalysisSnapshot snapshot)
    {
        if (MainCanvas == null) return;
        MainCanvas.Children.Clear();

        if (snapshot.SpectrumDb.IsDefaultOrEmpty) return;

        var spectrum = snapshot.SpectrumDb;
        double width = this.ActualWidth;
        double height = this.ActualHeight;

        double minDb = -100;
        double maxDb = 0;
        double dbRange = maxDb - minDb;
        if (dbRange <= 0) dbRange = 1;

        var points = new PointCollection(spectrum.Length);

        for (int i = 0; i < spectrum.Length; i++)
        {
            double x = (double)i / (spectrum.Length - 1) * width;
            double db = spectrum[i];
            double y = height - ((db - minDb) / dbRange * height);

            // Clamp y
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

        double maxFreq = 24000; // Approximate Nyquist

        foreach (var c in snapshot.Candidates)
        {
            double freq = c.Tracked.FrequencyHz;
            double conf = c.Confidence; // 0..1 usually

            double x = (freq / maxFreq) * width;
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
            // Clear to black
             _waterfallBmp.WritePixels(new Int32Rect(0, 0, width, height), new int[width * height], width * 4, 0);
        }

        int stride = width * 4;
        var pixels = new byte[height * stride];
        _waterfallBmp.CopyPixels(pixels, stride, 0);

        // Shift UP: Copy rows 1..H-1 to 0..H-2
        Array.Copy(pixels, stride, pixels, 0, (height - 1) * stride);

        // Generate new row
        var spectrum = snapshot.SpectrumDb;
        double minDb = -100;
        double maxDb = 0;

        int newRowStart = (height - 1) * stride;

        for (int x = 0; x < width; x++)
        {
            int bin = (int)((double)x / width * (spectrum.Length - 1));
            if (bin < 0) bin = 0;
            if (bin >= spectrum.Length) bin = spectrum.Length - 1;

            double db = spectrum[bin];
            double val = Math.Clamp((db - minDb) / (maxDb - minDb), 0, 1);

            byte r = 0, g = 0, b = 0;

            if (val < 0.25) // Black to Blue
            {
                b = (byte)(val * 4 * 255);
            }
            else if (val < 0.5) // Blue to Red
            {
                b = (byte)((0.5 - val) * 4 * 255);
                r = (byte)((val - 0.25) * 4 * 255);
            }
            else if (val < 0.75) // Red to Yellow
            {
                r = 255;
                g = (byte)((val - 0.5) * 4 * 255);
            }
            else // Yellow to White
            {
                r = 255;
                g = 255;
                b = (byte)((val - 0.75) * 4 * 255);
            }

            int p = newRowStart + x * 4;
            pixels[p] = b;
            pixels[p + 1] = g;
            pixels[p + 2] = r;
            pixels[p + 3] = 255; // Alpha
        }

        _waterfallBmp.WritePixels(new Int32Rect(0, 0, width, height), pixels, stride, 0);
    }
}
