using System;
using Xunit;
using DoneWellAudio.Core;

namespace DoneWellAudio.Tests
{
    public class WindowFunctionsTests
    {
        [Fact]
        public void ApplyHannInPlace_StandardInput_AppliesCorrectWindow()
        {
            // Arrange
            float[] frame = new float[] { 1.0f, 1.0f, 1.0f, 1.0f, 1.0f };
            float[] expected = new float[5];
            int n = frame.Length;

            // Expected Hann window values manually calculated
            // w[n] = 0.5 * (1 - cos(2*pi*n/(N-1)))
            // for N=5, indices 0, 1, 2, 3, 4
            // i=0: 0.5 * (1 - cos(0)) = 0
            // i=1: 0.5 * (1 - cos(pi/2)) = 0.5 * (1 - 0) = 0.5
            // i=2: 0.5 * (1 - cos(pi)) = 0.5 * (1 - (-1)) = 1.0
            // i=3: 0.5 * (1 - cos(3pi/2)) = 0.5 * (1 - 0) = 0.5
            // i=4: 0.5 * (1 - cos(2pi)) = 0.5 * (1 - 1) = 0

            expected[0] = 0.0f;
            expected[1] = 0.5f;
            expected[2] = 1.0f;
            expected[3] = 0.5f;
            expected[4] = 0.0f;

            // Act
            WindowFunctions.ApplyHannInPlace(frame);

            // Assert
            Assert.Equal(expected.Length, frame.Length);
            for (int i = 0; i < n; i++)
            {
                Assert.Equal(expected[i], frame[i], 1e-6f);
            }
        }

        [Fact]
        public void ApplyHannInPlace_EmptyArray_NoOp()
        {
            // Arrange
            float[] frame = Array.Empty<float>();

            // Act & Assert
            var exception = Record.Exception(() => WindowFunctions.ApplyHannInPlace(frame));
            Assert.Null(exception);
        }

        [Fact]
        public void ApplyHannInPlace_SingleElementArray_NoOp()
        {
            // Arrange
            float[] frame = new float[] { 42.0f };

            // Act
            WindowFunctions.ApplyHannInPlace(frame);

            // Assert
            Assert.Equal(42.0f, frame[0]);
        }

        [Fact]
        public void ApplyHannInPlace_NullInput_ThrowsNullReferenceException()
        {
            // Arrange
            float[] frame = null!;

            // Act & Assert
            Assert.Throws<NullReferenceException>(() => WindowFunctions.ApplyHannInPlace(frame));
        }
    }
}
