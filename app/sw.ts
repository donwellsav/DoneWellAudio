import type { PrecacheEntry, SerwistGlobalConfig, RuntimeCaching } from "serwist";
import {
  Serwist,
  CacheFirst,
  NetworkFirst,
  StaleWhileRevalidate,
  ExpirationPlugin,
  CacheableResponsePlugin,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// ── Cache strategies tailored for Kill The Ring ─────────────────────────

const runtimeCaching: RuntimeCaching[] = [
  // 1. App shell (HTML) — NetworkFirst to pick up deploys quickly,
  //    3s timeout falls back to cache for offline venue use.
  {
    matcher: ({ request, sameOrigin }) =>
      sameOrigin && request.destination === "document",
    handler: new NetworkFirst({
      cacheName: "ktr-pages",
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 8, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      ],
    }),
  },

  // 2. Next.js static JS/CSS bundles — content-hashed, immutable.
  {
    matcher: /\/_next\/static\/.+\.(js|css)$/i,
    handler: new CacheFirst({
      cacheName: "ktr-next-static",
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },

  // 3. Static assets (icons, images, manifest).
  {
    matcher: /\.(?:png|jpg|jpeg|svg|ico|webp|webmanifest|json)$/i,
    handler: new CacheFirst({
      cacheName: "ktr-static-assets",
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      ],
    }),
  },

  // 4. Google Fonts font files (gstatic.com) — immutable.
  {
    matcher: /^https:\/\/fonts\.gstatic\.com\/.*/i,
    handler: new CacheFirst({
      cacheName: "ktr-google-fonts",
      plugins: [
        new CacheableResponsePlugin({ statuses: [0, 200] }),
        new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 }),
      ],
    }),
  },

  // 5. Google Fonts stylesheets (googleapis.com) — can change.
  {
    matcher: /^https:\/\/fonts\.googleapis\.com\/.*/i,
    handler: new StaleWhileRevalidate({
      cacheName: "ktr-google-fonts-css",
      plugins: [
        new ExpirationPlugin({ maxEntries: 4, maxAgeSeconds: 7 * 24 * 60 * 60 }),
      ],
    }),
  },

  // 6. RSC prefetch/data payloads (Next.js App Router).
  {
    matcher: ({ request, sameOrigin }) =>
      sameOrigin && request.headers.get("RSC") === "1",
    handler: new NetworkFirst({
      cacheName: "ktr-rsc",
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },

  // 7. Catch-all same-origin — safety net.
  {
    matcher: ({ sameOrigin }) => sameOrigin,
    handler: new NetworkFirst({
      cacheName: "ktr-other",
      networkTimeoutSeconds: 3,
      plugins: [
        new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 }),
      ],
    }),
  },
];

// ── Service Worker instance ─────────────────────────────────────────────

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // Don't auto-activate — wait for explicit message to avoid disrupting live sessions.
  // The app sends { type: 'SKIP_WAITING' } via useServiceWorkerUpdate hook.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching,
  fallbacks: {
    entries: [
      {
        url: "/~offline",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

serwist.addEventListeners();

// Allow the app to trigger SW activation when the user explicitly accepts an update
self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
