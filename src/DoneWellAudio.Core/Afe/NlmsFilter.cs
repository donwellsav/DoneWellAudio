using System;

namespace DoneWellAudio.Core.Afe;

/// <summary>
///     Layer 4: Adaptive Feedback Cancellation (NLMS) with Noise Rescue.
/// </summary>
public sealed class NlmsFilter : IAdaptiveFilter, IDisposable
{
    private readonly int _filterOrder; // P
    private readonly float _mu;        // Step size (learning rate)
    private readonly float[] _weights; // FIR coefficients [P]
    private readonly RingBuffer _xHistory; // Reference signal history (Loudspeaker signal)
    private readonly float[] _xBuffer;     // Temp buffer for history vector
    private readonly float[] _oneSampleBuffer = new float[1]; // CA2014 fix

    public bool Enabled { get; set; } = true;

    // Rescue Mode State
    private bool _rescueMode;
    private int _rescueCounter;
    private const int RescueDurationSamples = 768; // 16ms @ 48kHz
    private readonly Random _rng = new Random();

    // Rescue Data Collection
    // We need to collect f(n) (Noise) and y(n) (Mic) for the duration of the burst
    // to build the Correlation Matrix R and Vector r.
    private readonly float[] _noiseBurstBuffer;
    private readonly float[] _micBurstBuffer;
    private int _burstIndex;

    // GLD Solver Buffers (Pre-allocated for Zero-Alloc)
    private readonly float[] _gldR;
    private readonly float[] _gldV;
    private readonly float[] _gldW;
    private readonly float[] _gldPrevW;

    public NlmsFilter(AfeConfig config)
    {
        _filterOrder = 256; // Fixed order P
        _mu = 0.05f;
        _weights = new float[_filterOrder];
        _xHistory = new RingBuffer(_filterOrder * 2);
        _xBuffer = new float[_filterOrder];

        _noiseBurstBuffer = new float[RescueDurationSamples];
        _micBurstBuffer = new float[RescueDurationSamples];

        // Pre-allocate GLD buffers
        int p = _filterOrder;
        _gldR = new float[p + 1];
        _gldV = new float[p + 1];
        _gldW = new float[p + 1];
        _gldPrevW = new float[p + 1];
    }

    public void TriggerRescue()
    {
        if (_rescueMode) return;
        _rescueMode = true;
        _rescueCounter = RescueDurationSamples;
        _burstIndex = 0;
        // Freeze adaptation during rescue? Yes.
    }

    public void CancelFeedback(ReadOnlySpan<float> inputMic, Span<float> output)
    {
        if (!Enabled)
        {
            inputMic.CopyTo(output);
            _xHistory.Write(output);
            return;
        }

        for (int i = 0; i < inputMic.Length; i++)
        {
            if (_rescueMode)
            {
                // Inject Noise f(n)
                float noise = (float)(_rng.NextDouble() * 2.0 - 1.0) * 0.05f; // -26dB noise burst
                output[i] = noise;

                // Record
                if (_burstIndex < RescueDurationSamples)
                {
                    _noiseBurstBuffer[_burstIndex] = noise;
                    _micBurstBuffer[_burstIndex] = inputMic[i];
                    _burstIndex++;
                }

                _rescueCounter--;
                if (_rescueCounter <= 0)
                {
                    SolveGldAndReset();
                    _rescueMode = false;
                }

                // Update History with Noise (since that's what's playing)
                _oneSampleBuffer[0] = noise;
                _xHistory.Write(_oneSampleBuffer);
            }
            else
            {
                // Standard NLMS
                _xHistory.Read(_xBuffer, 0);
                float y_hat = DotProduct(_weights, _xBuffer);
                float d = inputMic[i];
                float e = d - y_hat;
                output[i] = e;

                float energy = DotProduct(_xBuffer, _xBuffer) + 1e-10f;
                float step = _mu * e / energy;

                for (int k = 0; k < _filterOrder; k++)
                {
                    _weights[k] += step * _xBuffer[k];
                }

                _oneSampleBuffer[0] = e;
                _xHistory.Write(_oneSampleBuffer);
            }
        }
    }

    private void SolveGldAndReset()
    {
        // Levinson-Durbin requires Autocorrelation R[k] of noise
        // and Cross-correlation P[k] of noise/mic.
        // k = 0..P (lags)

        int P = _filterOrder;
        // Zero out buffers
        Array.Clear(_gldR, 0, P + 1);
        Array.Clear(_gldV, 0, P + 1);
        Array.Clear(_gldW, 0, P + 1);
        Array.Clear(_gldPrevW, 0, P + 1);

        // Calculate Autocorrelation R[k] = sum(f[n]*f[n-k])
        // Calculate Cross-correlation V[k] = sum(y[n]*f[n-k])

        // Naive O(N*P) correlation calculation
        int N = RescueDurationSamples;
        for (int k = 0; k <= P; k++)
        {
            float rSum = 0;
            float vSum = 0;
            for (int n = k; n < N; n++)
            {
                rSum += _noiseBurstBuffer[n] * _noiseBurstBuffer[n - k];
                vSum += _micBurstBuffer[n] * _noiseBurstBuffer[n - k];
            }
            _gldR[k] = rSum;
            _gldV[k] = vSum;
        }

        // Levinson-Durbin Recursion to solve Rw = V
        float E = _gldR[0];

        // Order 1..P
        for (int i = 1; i <= P; i++)
        {
            float sum = 0;
            for (int j = 1; j < i; j++)
                sum += _gldPrevW[j] * _gldR[i - j];

            float k_i = (_gldV[i] - sum) / (E + 1e-20f);

            _gldW[i] = k_i;
            for (int j = 1; j < i; j++)
                _gldW[j] = _gldPrevW[j] - k_i * _gldPrevW[i - j];

            E = E * (1 - k_i * k_i);

            // Swap buffers for next iteration
            Array.Copy(_gldW, _gldPrevW, i + 1);
        }

        // Apply solved weights
        for(int i=0; i<P; i++)
        {
             if (i < _gldW.Length) _weights[i] = _gldW[i+1]; // Shift?
             else _weights[i] = 0;
        }

        // Or simply Zero out if unstable/NaN
        if (float.IsNaN(_weights[0])) Array.Clear(_weights, 0, P);
    }

    private float DotProduct(float[] a, float[] b)
    {
        float sum = 0;
        for (int i = 0; i < a.Length; i++) sum += a[i] * b[i];
        return sum;
    }

    public void Dispose()
    {
        _xHistory.Dispose();
    }
}
