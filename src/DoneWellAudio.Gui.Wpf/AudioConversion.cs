using NAudio.Wave;

namespace DoneWellAudio.Gui.Wpf;

internal static class AudioConversion
{
    public static float[] ToMonoFloat(byte[] buffer, int bytesRecorded, WaveFormat format)
    {
        int channels = format.Channels;
        if (channels <= 0) channels = 1;

        if (format.Encoding == WaveFormatEncoding.IeeeFloat && format.BitsPerSample == 32)
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

        if (format.Encoding == WaveFormatEncoding.Pcm && format.BitsPerSample == 16)
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

        throw new NotSupportedException($"Unsupported input format: {format.Encoding}, {format.BitsPerSample} bits.");
    }
}
