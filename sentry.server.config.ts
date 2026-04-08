// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://14440e525ce83db2e024a2c1491ae1d9@o4511038802952192.ingest.us.sentry.io/4511088677748736",

  // Sample 10% of traces in production to avoid quota exhaustion.
  // Errors are always captured (100%); only performance traces are sampled.
  tracesSampleRate: 0.1,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Disable sending user PII — aligns with GDPR consent flow and data minimization
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: false,
});
