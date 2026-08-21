# Stage 04 — Drawer, PWA, Offline

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — sections **"Layout details"**
  (drawer trigger behavior), **"PWA requirements"**, **"Definition of done"**
- L3: `../_references/year-planner-v2.html` — the day drawer and event form:
  markup structure, field behavior, instance-vs-series choices, series-delete
  confirmation. Port the logic; restyle to v3's visual direction.
- L4: everything built in 01–03, consumed through existing interfaces

## Process
1. `src/drawer.ts` — day drawer + add/edit form ported from v2. Opens on a
   day tap in the calendar view, via `scroll.onDayTap` (already wired to a
   console log in `main.ts`). Writes go through state.ts optimistic flow —
   the drawer never calls gcal.ts directly. *(Revised 2026-08-21: the lens
   was removed in stage 03, so there are no compressed rows to tap.)*
2. `src/sw.ts` — precache app shell, runtime cache-first for static assets.
   Never cache Calendar API responses in the SW.
3. Offline behavior: app opens read-only from localStorage cache; writes fail
   with a visible message and roll back; reconnect triggers background refresh.
4. Install path: viewport meta, safe-area insets, verify a full month still
   fits on a notched phone.
5. Dark mode pass per `prefers-color-scheme`, same restraint as light.

## Constraints
- Drawer respects module boundaries: UI → state.ts → gcal.ts. No shortcuts.
  This means stage 04 ADDS write orchestration (optimistic apply → API →
  reconcile/rollback) to `state.ts`; the stage 03 ban on touching 02's
  modules does not apply here, the contract requires it.
- Transient UI must survive a background refresh. Stage 03 lost its hover
  panel to exactly this: an arriving month repainted and tore it down. The
  drawer is open for far longer — do not let a refresh close or reset it.
- SW scope: static shell only. Data caching already lives in state.ts.

## Outputs
- Implemented `drawer.ts`, `sw.ts`, offline handling, install polish
- `output/verification.md` — the spec's full Definition of Done, item by
  item, each checked with result

## Inherited from the stage 02 gate (2026-08-20)
Recorded here because stages read only their own CONTEXT.md — these would
otherwise be invisible. Detail in `../02_data/output/verification.md`.

1. **Category colors on the real wire.** Deferred from 02: create one event
   per category through the drawer and confirm all four colors in the Google
   Calendar app. Stub-proven only so far.
2. **All-day exclusive-end conversion on the real wire.** Deferred from 02:
   create a 3-week all-day commitment through the drawer and confirm in the
   Google Calendar app that it ends on the chosen day and NOT a day later.
3. **Edit one occurrence, delete the series** with confirmation, through the
   drawer. Deferred from 02.
4. **`apple-mobile-web-app-capable` is deprecated** — `index.html` warns.
   Add the standard `mobile-web-app-capable` alongside it (keep both; iOS
   still reads the Apple one).

Items 1-3 are also Definition-of-done items, so the gate below covers them.
A real-API `createEvent` succeeded 2026-08-20, so the write path is known to
reach Google; what is still unconfirmed on the real wire is the category
colour mapping and the all-day exclusive-end conversion. Do not sign those
off from the stub evidence.

## Gate
The spec's **Definition of done** section, verbatim, executed by the human
on a real phone: every item passes, including kill-the-network read-only
open and visible write rollback. This gate closes the build.
