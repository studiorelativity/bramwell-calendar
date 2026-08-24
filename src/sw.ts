// STAGE 04 — service worker. Revised 2026-08-24 (see 07_notes gate notes).
//
// Two strategies, split on whether the URL is content-addressed:
//   /assets/*  cache-first  — hashed filenames, a hit is always current
//   everything else  network-first, cache as offline fallback
// The shell HTML keeps its URL across deploys, so serving it cache-first made
// every deploy invisible to installed clients.
//
// Calendar API responses are NEVER cached here: the localStorage cache owns
// data, and SW-cached API responses cause stale-auth confusion.
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

// v4 (stage 07 deploy): the shell is no longer served cache-first, so this no
// longer has to be bumped on every shell change — that requirement was the bug.
// Bumped once here to evict the v3 caches holding a pre-stage-07 index.html.
const CACHE = 'bramwell-shell-v4';
/**
 * Only paths the build actually emits at these URLs. The manifest, JS and CSS
 * are content-hashed into /assets/ and cannot be named here; they are picked
 * up by the runtime cache below on the first online load, which always happens
 * before the app is useful anyway — signing in requires the network.
 *
 * `/index.html` is deliberately ABSENT. Cloudflare Workers static assets 307s
 * it to `/`, and a redirected response cannot be replayed for a navigation —
 * `cache.add` would store one and offline open would then fail. `/` is the
 * canonical entry and returns 200.
 */
const SHELL = ['/', '/icon-192.png', '/icon-512.png'];

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

/**
 * Store a copy without blocking the response.
 *
 * A redirected response is never stored: replaying one for a navigation is
 * rejected by the browser, and the host 307s `/index.html` to `/`.
 */
function keep(request: Request, response: Response): void {
  if (!response.ok || response.redirected) return;
  const copy = response.clone();
  void caches.open(CACHE).then((cache) => cache.put(request, copy));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Cross-origin means googleapis.com (data) or accounts.google.com (auth).
  // Neither may ever be cached here.
  if (url.origin !== self.location.origin) return;

  // Content-hashed by the build: a changed byte means a changed URL, so a hit
  // is always current and can be served without asking the network.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            keep(request, response);
            return response;
          }),
      ),
    );
    return;
  }

  // Everything else — the shell HTML above all — keeps its URL when its
  // contents change, so a cached copy can be arbitrarily stale. Serving it
  // cache-first is what made deploys invisible to installed clients: the
  // cached index.html kept pointing at a bundle that was no longer current,
  // and only a manual CACHE bump could break the loop. Network-first, with
  // the cache as the offline fallback.
  event.respondWith(
    fetch(request)
      .then((response) => {
        keep(request, response);
        return response;
      })
      .catch(async () => {
        const hit = await caches.match(request);
        if (hit) return hit;
        // Offline: a navigation still opens, read-only, from the cached shell.
        if (request.mode === 'navigate') {
          const shell = await caches.match('/');
          if (shell) return shell;
        }
        return Response.error();
      }),
  );
});
