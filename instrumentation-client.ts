/**
 * Sentry client-side initialization - runs in the browser runtime.
 *
 * This captures:
 *  - Unhandled exceptions and promise rejections
 *  - React ErrorBoundary-reported errors
 *  - DSP worker crash reports (via Sentry.captureMessage)
 *  - Console errors (if enabled)
 *
 * Configuration:
 *  - Set NEXT_PUBLIC_SENTRY_DSN in .env.local, or rely on the current Sentry project DSN fallback
 *  - Tracing: 10% of sessions in production, 100% in dev
 *  - Replay: 10% baseline, 100% on error sessions
 */

import * as Sentry from '@sentry/nextjs'

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN
  ?? 'https://14440e525ce83db2e024a2c1491ae1d9@o4511038802952192.ingest.us.sentry.io/4511088677748736'

Sentry.init({
  dsn: SENTRY_DSN,

  enabled: Boolean(SENTRY_DSN),

  tracesSampleRate: process.env.NODE_ENV === 'development' ? 1.0 : 0.1,

  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  enableLogs: true,
  sendDefaultPii: false,

  release: process.env.NEXT_PUBLIC_APP_VERSION
    ? `donewellaudio@${process.env.NEXT_PUBLIC_APP_VERSION}`
    : undefined,

  environment: process.env.NODE_ENV,

  integrations: [
    Sentry.replayIntegration(),
  ],

  beforeSend(event) {
    if (event.exception?.values?.some(
      (value) => value.value?.includes('ResizeObserver loop')
    )) {
      return null
    }
    return event
  },
})

// Guard: captureRouterTransitionStart was added in @sentry/nextjs 9.x but removed
// in 10.x. Exporting undefined crashes Next.js 16 on every client navigation.
export const onRouterTransitionStart = typeof Sentry.captureRouterTransitionStart === 'function'
  ? Sentry.captureRouterTransitionStart
  : undefined
