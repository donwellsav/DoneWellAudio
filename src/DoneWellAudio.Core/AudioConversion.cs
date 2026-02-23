using System;

namespace DoneWellAudio.Core;

public static class AudioConversion
{
    /// <summary>
    ///     Converts a byte array of audio samples (PCM or IEEE Float) into a mono float array.
    /// </summary>
    /// <param name="buffer">The raw byte buffer containing audio data.</param>
    /// <param name="bytesRecorded">The number of valid bytes in the buffer.</param>
    /// <param name="channels">Number of channels (e.g., 1 for Mono, 2 for Stereo).</param>
    /// <param name="bitsPerSample">Bit depth (e.g., 16 or 32).</param>
    /// <param name="isFloat">True if the format is IEEE Float, False if PCM (Integer).</param>
    /// <returns>A float array containing the mono mix of the audio.</returns>
    /// <exception cref="NotSupportedException">Thrown if the format is not supported.</exception>
    public static float[] ToMonoFloat(byte[] buffer, int bytesRecorded, int channels, int bitsPerSample, bool isFloat)
    {
        if (channels <= 0) channels = 1;

        // Handle 32-bit Float
        if (isFloat && bitsPerSample == 32)
        {
            int samples = bytesRecorded / 4;
            int frames = samples / channels;
            var mono = new float[frames];
            int offset = 0;
            for (int f = 0; f < frames; f++)
            {
                float sum = 0;
                for (int c = 0; c < channels; c++)
                {
                    sum += BitConverter.ToSingle(buffer, offset);
                    offset += 4;
                }
                mono[f] = sum / channels;
            }
            return mono;
        }

        // Handle 16-bit PCM
        if (!isFloat && bitsPerSample == 16)
        {
            int samples = bytesRecorded / 2;
            int frames = samples / channels;
            var mono = new float[frames];
            int offset = 0;
            const float scale = 1.0f / 32768f;
            for (int f = 0; f < frames; f++)
            {
                int sum = 0;
                for (int c = 0; c < channels; c++)
                {
                    short s = BitConverter.ToInt16(buffer, offset);
                    offset += 2;
                    sum += s;
                }
                mono[f] = (sum / (float)channels) * scale;
            }
            return mono;
        }

        // Fallback
        throw new NotSupportedException($"Unsupported input format: {(isFloat ? "Float" : "PCM")}, {bitsPerSample} bits.");
    }
}
