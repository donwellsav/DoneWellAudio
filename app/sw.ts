import { defaultCache } from "@serwist/next/worker";
import { CacheFirst, ExpirationPlugin } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/** Known runtime cache names — used for stale cache cleanup on activation. */
const RUNTIME_CACHE_NAMES = ["static-assets-v1", "wasm-runtime-v1"];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    ...defaultCache,
    {
      matcher: /\.(?:js|css|woff2?)$/i,
      handler: new CacheFirst({
        cacheName: "static-assets-v1",
        plugins: [
          new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 7 * 24 * 60 * 60 }),
        ],
      }),
    },
    {
      // ONNX Runtime WASM blobs fetched lazily by onnxruntime-web.
      // The .onnx model file itself is covered by precaching (public/models/).
      matcher: /\.wasm$/i,
      handler: new CacheFirst({
        cacheName: "wasm-runtime-v1",
        plugins: [
          new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 30 * 24 * 60 * 60 }),
        ],
      }),
    },
  ],
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

// Clean up stale runtime caches from previous SW versions on activation.
// Serwist handles precache cleanup automatically; this covers only our
// custom runtime caches whose names may change across versions.
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      const known = new Set([...RUNTIME_CACHE_NAMES, ...keys.filter(k => k.startsWith("serwist-") || k.startsWith("workbox-"))]);
      return Promise.all(
        keys
          .filter((key) => !known.has(key) && (key.startsWith("static-assets-") || key.startsWith("wasm-runtime-") || key.startsWith("models-")))
          .map((key) => caches.delete(key)),
      );
    }),
  );
});
