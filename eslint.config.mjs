import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const coreWebVitals = require('eslint-config-next/core-web-vitals')
const typescript = require('eslint-config-next/typescript')

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ['.claude/**'],
  },
  {
    rules: {
      'no-console': 'warn',
      'prefer-const': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
]

export default eslintConfig
