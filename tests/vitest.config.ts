import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'tests/**/*.test.ts',
      'lib/**/__tests__/**/*.test.ts',
      'hooks/__tests__/**/*.test.ts',
      'contexts/__tests__/**/*.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'lib/dsp/**/*.ts',
        'lib/storage/**/*.ts',
        'lib/export/**/*.ts',
        'hooks/**/*.ts',
        'contexts/**/*.tsx',
      ],
      exclude: ['lib/dsp/dspWorker.ts'], // Worker needs separate test env
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
