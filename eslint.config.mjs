import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const coreWebVitals = require('eslint-config-next/core-web-vitals')
const typescript = require('eslint-config-next/typescript')
const reactHooks = require('eslint-plugin-react-hooks')

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    ignores: ['.claude/**', 'public/**', 'docs/**', 'autoresearch/**', 'companion/**', 'companion-module-dbx-driverack-pa2/**', 'companion-module/**', 'scripts/**', 'tmp/**', 'supabase/**'],
  },
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      'no-console': 'warn',
      'prefer-const': 'error',
      '@typescript-eslint/consistent-type-imports': ['warn', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'error',
      // React 19 experimental rules — downgrade from error (eslint-config-next default)
      // to warn. These flag legitimate patterns: setState in effects for browser-API
      // synchronization, "latest ref" pattern, and Date.now() in render paths.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
]

export default eslintConfig
