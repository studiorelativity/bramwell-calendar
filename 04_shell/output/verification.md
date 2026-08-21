# Stage 04 — Verification

Date: 2026-08-21 · Implements `drawer.ts`, `sw.ts`, write orchestration in
`state.ts`, offline handling, install polish

## Gate — CLOSED 2026-08-21

Closed on the human's sign-off. **Read the two caveats below before treating
this build as fully verified** — they are the only Definition-of-done items
that have never been checked against the real Google Calendar API, and they
have been deferred since the stage 02 gate.

### Not confirmed on the real wire

1. **Category colours.** `colorId` mapping is proven against a stubbed
   `fetch` (12/12 in stage 02) and the four ids come straight from v2, which
   used them in production — but no event created by this build has been
   opened in the Google Calendar app to confirm its colour.
2. **All-day exclusive-end conversion.** Proven against the stub: a 3-day
   event goes out as `2026-08-20 → 2026-08-23`, and a naive port would send
   the 22nd. Never confirmed against the live API. If it were wrong, every
   multi-day event would be created one day short or long. Risk is low — the
   logic is directly tested — but it is untested end to end.

A real-API `createEvent` did succeed on 2026-08-20, so the write path reaches
Google. It is specifically these two conversions that remain unconfirmed.

### Could not be verified in this environment

**Service worker registration.** Headless Chrome hangs when a page registers a
service worker under a virtual-time budget, so registration, scope and cache
population could not be exercised here. What *was* verified statically:
`sw.js` is emitted at the site root (so its scope is `/`), contains no ESM
syntax (so it registers as a classic worker anywhere), and its precache list
matches paths the build actually emits. **First real install is the test.**

## Definition of done — item by item

The gate is the spec's Definition of done executed by the human on a real
phone against a real account. Items needing a device or a real API call are
marked **awaiting human** and cannot be self-certified.

| # | Definition-of-done item | Result |
|---|---|---|
| 1 | Sign in → a full month visible at once, today marked, month(s) named in header, bands legible | **Awaiting human** (sign-in). Rendering verified in stage 03. |
| 2 | Flick three months: 60fps, settles softly onto a centred anchor at the chosen granularity | **Passed at the stage 03 gate** ("it is usable"). |
| 3 | On a phone, double-tapping a day never zooms | **Passed at the stage 03 gate** — confirmed fixed on device. |
| 4 | Year view: all 365 days at once, week-aligned, month badges, today marked; clicking a day returns to it | **Verified headlessly** at stage 03; day-click returns to the calendar. |
| 5 | Hover (tap on phone) shows the day with the day either side, events in full | **Verified headlessly**; tap path added at the stage 03 gate, **awaiting human on device**. |
| 6 | Scroll a year back: months load as approached, no jank, no unbounded DOM growth | **Partly verified** — 14 rows realized at every viewport, fixed by construction. Jank is a device judgement. |
| 7 | Create a 3-week all-day commitment → wrapping bar across three rows, **correct colour in the Google Calendar app** | Rendering **verified headlessly**; the wire colour is **awaiting human** — inherited item 1 from the stage 02 gate. |
| 8 | Edit one occurrence of a weekly event; delete the series with confirmation | UI **verified headlessly** (scope picker, confirm on series delete); the real-API round trip is **awaiting human** — inherited item 3. |
| 9 | Install as PWA; kill the network; app opens read-only from cache; a write fails visibly and rolls back | Write-failure-and-rollback **verified headlessly** (below). Install and true offline open are **awaiting human**. |
| 10 | A full month fits on a notched phone and a 27" monitor; day numbers never clipped | Ratio and clipping **verified headlessly** at three viewports; the notch itself is **awaiting human**. |

## Automated evidence

Headless Chrome, cache seeded through localStorage, driving the real UI in a
same-origin iframe. Tapping 20 Aug, which carries an all-day event, a timed
event, and a recurring instance:

```
drawer open: true
date: Thursday, August 20
events listed: Sabbatical | Standup | Weekly 1:1 ↻
form shown: true
scope picker shown for recurring: true
repeat disabled when editing: true
delete button shown: true
validation error: Title is required.
offline error: You are offline. This change was not saved.
toast: You are offline. This change was not saved.  tone=bad
rolled back (list unchanged): Sabbatical | Standup | Weekly 1:1 ↻
```

The last two lines are Definition-of-done item 9's second half: with
`navigator.onLine` forced false, the write surfaced a visible message in both
the form and a toast, and the optimistic edit was rolled back — the list still
shows the original title, not "Renamed".

Also verified: `dist/sw.js` is emitted **at the site root**, not under
`/assets/`, so its scope covers the whole app; and it contains no ESM syntax,
so it registers as a classic worker on every browser.

### A bug found while closing the gate

The service worker precached `/manifest.webmanifest`, **which the build does
not emit** — Vite content-hashes it to `/assets/manifest-<hash>.webmanifest`.
The precache silently 404'd (it uses `allSettled`, so install still
succeeded). It went unnoticed because `curl /manifest.webmanifest` against
`vite preview` returns **200**: the preview server falls back to `index.html`
for unknown paths, so the check that was supposed to prove the file existed
proved nothing. Corrected to precache only paths the build really emits, and
the cache name bumped to `bramwell-shell-v2` so existing installs re-prime.

Consequence worth knowing: the hashed JS, CSS and manifest are **not**
precached at install. They are runtime-cached on the first online load, which
always precedes useful work because signing in needs the network. Offline
open therefore works from the second launch onward, not the first.

## Decisions the spec left open

1. **Write orchestration lives in `state.ts`.** The contract requires
   UI → state.ts → gcal.ts, so `createEvent` / `updateEvent` / `deleteEvent`
   were added there: apply locally as pending, call the API, reconcile from
   the server's answer, or roll back and rethrow. The drawer never imports
   `gcal.ts`. This modifies a stage 02 module, which stage 04's contract
   explicitly calls for.

2. **Reconciliation refetches the touched months.** A recurring write fans
   out unpredictably, so a series write additionally marks every resident
   month stale; they refresh as they are approached rather than in one burst.

3. **The offline check sits inside the try block**, after the optimistic
   apply. That is deliberate: the spec's Definition of done asks for a write
   that "fails visibly and rolls back", so the rollback path must actually
   run rather than being short-circuited before anything was applied.

4. **`repeat` is disabled when editing.** Changing an existing event's
   recurrence rule is a different kind of write against the API. v2 disabled
   it too. Creating a recurring event works.

5. **The scope picker appears only for recurring events**, defaulting to
   "This occurrence" per the spec. Series delete confirms first.

6. **The service worker registers in production only.** In dev, Vite serves
   modules unbundled and a shell cache would serve stale code on reload.

7. **`vite.config.ts` was added without a spec change.** The spec's file
   layout lists source files, not build infrastructure — `package.json` and
   `tsconfig.json` are not in it either. It exists to emit `sw.js` at the
   site root, which the SW's scope requires.

8. **`drawer.refresh()` is a no-op while the form is open.** Carried forward
   from stage 03, where an arriving month destroyed the year view's hover
   panel. A background refresh must never wipe what is being typed.

## Human gate checklist

Requires `npm run build && npm run preview` (the SW is production-only) and a
real Google account on a phone.

1. Sign in. Create one event per category. **Confirm all four colours in the
   Google Calendar app** — inherited item 1, still stub-proven only.
2. Create a 3-week all-day commitment. **Confirm in the Google Calendar app
   that it ends on the day you chose and not a day later** — inherited item 2,
   the exclusive-end conversion, still stub-proven only.
3. Edit one occurrence of a weekly event, leaving "This occurrence" selected.
   Confirm only that occurrence changed in Google Calendar.
4. Delete the series, choosing "Whole series". Confirm the prompt appears and
   the whole series goes.
5. Install as a PWA on the phone. Kill the network. Confirm the app opens and
   renders read-only from cache.
6. Still offline, try to save an edit. Confirm the visible failure and that
   the change rolls back.
7. Reconnect. Confirm the calendar refreshes without a reload.
8. Check the drawer on a notched phone: the bottom sheet clears the home
   indicator, and the header clears the notch.
