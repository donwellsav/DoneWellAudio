import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import withSerwistInit from "@serwist/next";
import { withSentryConfig } from "@sentry/nextjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "package.json"), "utf-8"));

const withSerwist = withSerwistInit({
  swSrc: "app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
});

// CSP is handled by middleware.ts (per-request nonce-based script-src).
// Non-CSP security headers remain here as static config.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    value: 'microphone=(self), camera=(), geolocation=()',
  },
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }]
  },
  turbopack: {},
  webpack(config) {
    // OpenSSL 3.x (Node 18+) disables md4. Webpack's WASM fallback crashes
    // on Windows. Use sha256 instead — universally supported.
    config.output.hashFunction = 'sha256'
    return config
  },
  env: {
    NEXT_PUBLIC_APP_VERSION: pkg.version,
  },
  images: {
    unoptimized: true,
  },
}

export default withSentryConfig(withSerwist(nextConfig), {
  // Suppress Sentry CLI source map upload warnings when no auth token is set
  silent: !process.env.SENTRY_AUTH_TOKEN,

  // Disable source map upload until SENTRY_AUTH_TOKEN is configured
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },

  // Don't widen the existing Webpack config unnecessarily
  hideSourceMaps: true,

  // Tree-shake Sentry debug logging in production
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
})
