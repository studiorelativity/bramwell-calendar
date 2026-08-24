// STAGE 04 — service worker. Precache the app shell, cache-first for static
// assets. Calendar API responses are NEVER cached here: the localStorage
// cache owns data, and SW-cached API responses cause stale-auth confusion.
//
// No imports: the build emits this as a standalone /sw.js so its scope is the
// site root. Anything imported here would be bundled in.

// Minimal shape of the worker globals we use. Declared locally rather than
// adding the "WebWorker" lib, which collides with "DOM" for the other modules.
interface ExtendableEventLike {
  waitUntil(promise: Promise<unknown>): void;
}

interface FetchEventLike extends ExtendableEventLike {
  readonly request: Request;
  respondWith(response: Response | Promise<Response>): void;
}

interface WorkerScope {
  readonly location: Location;
  readonly clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', fn: (event: ExtendableEventLike) => void): void;
  addEventListener(type: 'fetch', fn: (event: FetchEventLike) => void): void;
}

declare const self: WorkerScope;

// v3 (stage 05): index.html's tokens and header changed, and the shell is
// served cache-first — only a byte-change in this file makes an existing
// install re-fire install and re-prime. Bump this on EVERY shell change.
const CACHE = 'bramwell-shell-v3';
/**
 * Only paths the build actually emits at these URLs. The manifest, JS and CSS
 * are content-hashed into /assets/ and cannot be named here; they are picked
 * up by the runtime cache below on the first online load, which always happens
 * before the app is useful anyway — signing in requires the network.
 */
const SHELL = ['/', '/index.html', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // One miss must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Cross-origin means googleapis.com (data) or accounts.google.com (auth).
  // Neither may ever be cached here.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((response) => {
          if (response.ok && (url.pathname.startsWith('/assets/') || SHELL.includes(url.pathname))) {
            const copy = response.clone();
            void caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          // Offline: a navigation still opens, read-only, from the cache.
          if (request.mode === 'navigate') {
            const shell = await caches.match('/index.html');
            if (shell) return shell;
          }
          return Response.error();
        });
    }),
  );
});
