using System;
using DoneWellAudio.Core;
using Xunit;

namespace DoneWellAudio.Tests;

public class AudioConversionTests
{
    [Fact]
    public void ToMonoFloat_FromStereoFloat32_ReturnsAverage()
    {
        // Arrange
        // 2 frames, 2 channels, 32-bit float
        int channels = 2;
        int frames = 2;
        int bytesRecorded = frames * channels * 4;
        var buffer = new byte[bytesRecorded];

        // Frame 0: Left=1.0, Right=0.5 -> Mono=(1.0+0.5)/2 = 0.75
        BitConverter.GetBytes(1.0f).CopyTo(buffer, 0);
        BitConverter.GetBytes(0.5f).CopyTo(buffer, 4);

        // Frame 1: Left=-1.0, Right=-0.5 -> Mono=(-1.0-0.5)/2 = -0.75
        BitConverter.GetBytes(-1.0f).CopyTo(buffer, 8);
        BitConverter.GetBytes(-0.5f).CopyTo(buffer, 12);

        // Act
        var result = AudioConversion.ToMonoFloat(buffer, bytesRecorded, channels, 32, true);

        // Assert
        Assert.Equal(2, result.Length);
        Assert.Equal(0.75f, result[0], 5);
        Assert.Equal(-0.75f, result[1], 5);
    }

    [Fact]
    public void ToMonoFloat_FromStereoPcm16_ReturnsNormalizedFloat()
    {
        // Arrange
        // 2 frames, 2 channels, 16-bit PCM
        int channels = 2;
        int frames = 2;
        int bytesRecorded = frames * channels * 2;
        var buffer = new byte[bytesRecorded];

        // Scale factor is 1/32768.0f

        // Frame 0: Left=32767 (max), Right=0 -> Mono = 16383.5 -> float approx 0.5
        short valL0 = 32767;
        short valR0 = 0;
        BitConverter.GetBytes(valL0).CopyTo(buffer, 0);
        BitConverter.GetBytes(valR0).CopyTo(buffer, 2);

        // Frame 1: Left=-32768 (min), Right=0 -> Mono = -16384 -> float = -0.5
        short valL1 = -32768;
        short valR1 = 0;
        BitConverter.GetBytes(valL1).CopyTo(buffer, 4);
        BitConverter.GetBytes(valR1).CopyTo(buffer, 6);

        // Act
        var result = AudioConversion.ToMonoFloat(buffer, bytesRecorded, channels, 16, false);

        // Assert
        Assert.Equal(2, result.Length);

        float expected0 = ((float)valL0 + valR0) / 2.0f / 32768.0f;
        float expected1 = ((float)valL1 + valR1) / 2.0f / 32768.0f;

        Assert.Equal(expected0, result[0], 5);
        Assert.Equal(expected1, result[1], 5);
    }

    [Fact]
    public void ToMonoFloat_ThrowsOnUnsupportedFormat()
    {
        var buffer = new byte[10];
        Assert.Throws<NotSupportedException>(() =>
            AudioConversion.ToMonoFloat(buffer, 10, 2, 24, false)); // 24-bit PCM not supported
    }
}
