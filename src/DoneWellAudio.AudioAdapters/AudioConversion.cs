using NAudio.Wave;
using CoreAudioConversion = DoneWellAudio.Core.AudioConversion;

namespace DoneWellAudio.AudioAdapters;

public static class AudioConversion
{
    /// <summary>
    /// Converts audio buffer to mono float array using WaveFormat for metadata.
    ///Adapter around core DSP logic.
    /// </summary>
    public static float[] ToMonoFloat(byte[] buffer, int bytesRecorded, WaveFormat format)
    {
        return CoreAudioConversion.ToMonoFloat(
            buffer,
            bytesRecorded,
            format.Channels,
            format.BitsPerSample,
            format.Encoding == WaveFormatEncoding.IeeeFloat
        );
    }
}
