// STAGE 04 — service worker. Precache the app shell, cache-first for static
// assets. Calendar API responses are NEVER cached here: the localStorage
// cache owns data, and SW-cached API responses cause stale-auth confusion.

export {};

// STAGE 04: install / activate / fetch handlers.
