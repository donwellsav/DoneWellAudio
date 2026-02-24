using System;
using DoneWellAudio.AudioAdapters;
using NAudio.Wave;
using Xunit;

namespace DoneWellAudio.Tests;

public class AdapterAudioConversionTests
{
    [Fact]
    public void ToMonoFloat_AdaptsWaveFormatCorrectly_ForStereoFloat()
    {
        // Arrange
        // Create a WaveFormat: 48kHz, 2 channels, 32-bit float
        var format = WaveFormat.CreateIeeeFloatWaveFormat(48000, 2);

        int frames = 2;
        int bytesRecorded = frames * format.Channels * (format.BitsPerSample / 8);
        var buffer = new byte[bytesRecorded];

        // Frame 0: L=1.0, R=0.5 -> Mono = 0.75
        BitConverter.GetBytes(1.0f).CopyTo(buffer, 0);
        BitConverter.GetBytes(0.5f).CopyTo(buffer, 4);

        // Frame 1: L=-1.0, R=-0.5 -> Mono = -0.75
        BitConverter.GetBytes(-1.0f).CopyTo(buffer, 8);
        BitConverter.GetBytes(-0.5f).CopyTo(buffer, 12);

        // Act
        var result = AudioConversion.ToMonoFloat(buffer, bytesRecorded, format);

        // Assert
        Assert.Equal(2, result.Length);
        Assert.Equal(0.75f, result[0], 5);
        Assert.Equal(-0.75f, result[1], 5);
    }

    [Fact]
    public void ToMonoFloat_AdaptsWaveFormatCorrectly_ForMonoPcm16()
    {
        // Arrange
        var format = new WaveFormat(44100, 16, 1); // 44.1kHz, 16-bit, Mono

        int frames = 2;
        int bytesRecorded = frames * format.Channels * (format.BitsPerSample / 8);
        var buffer = new byte[bytesRecorded];

        // Frame 0: 32767 -> approx 1.0 (normalized)
        short val0 = 32767;
        BitConverter.GetBytes(val0).CopyTo(buffer, 0);

        // Frame 1: -32768 -> -1.0
        short val1 = -32768;
        BitConverter.GetBytes(val1).CopyTo(buffer, 2);

        // Act
        var result = AudioConversion.ToMonoFloat(buffer, bytesRecorded, format);

        // Assert
        Assert.Equal(2, result.Length);

        float expected0 = val0 / 32768.0f;
        float expected1 = val1 / 32768.0f;

        Assert.Equal(expected0, result[0], 5);
        Assert.Equal(expected1, result[1], 5);
    }
}
