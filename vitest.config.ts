import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.'),
    },
  },
  test: {
    include: [
      'lib/**/__tests__/**/*.test.ts',
      'tests/**/*.test.ts',
      'hooks/__tests__/**/*.test.ts',
      'contexts/__tests__/**/*.test.ts',
    ],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      include: ['lib/dsp/**/*.ts'],
      exclude: ['lib/dsp/__tests__/**', 'lib/dsp/dspWorker.ts'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
})
