# Stage 04 — Drawer, PWA, Offline

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — sections **"Layout details"**
  (drawer trigger behavior), **"PWA requirements"**, **"Definition of done"**
- L3: `../_references/year-planner-v2.html` — the day drawer and event form:
  markup structure, field behavior, instance-vs-series choices, series-delete
  confirmation. Port the logic; restyle to v3's visual direction.
- L4: everything built in 01–03, consumed through existing interfaces

## Process
1. `src/drawer.ts` — day drawer + add/edit form ported from v2. Opens on
   lens-day tap only; tapping a compressed week scrolls it into the lens
   instead. Writes go through state.ts optimistic flow — the drawer never
   calls gcal.ts directly.
2. `src/sw.ts` — precache app shell, runtime cache-first for static assets.
   Never cache Calendar API responses in the SW.
3. Offline behavior: app opens read-only from localStorage cache; writes fail
   with a visible message and roll back; reconnect triggers background refresh.
4. Install path: viewport meta, safe-area insets, verify lens ratio holds on
   a notched phone.
5. Dark mode pass per `prefers-color-scheme`, same restraint as light.

## Constraints
- Drawer respects module boundaries: UI → state.ts → gcal.ts. No shortcuts.
- SW scope: static shell only. Data caching already lives in state.ts.

## Outputs
- Implemented `drawer.ts`, `sw.ts`, offline handling, install polish
- `output/verification.md` — the spec's full Definition of Done, item by
  item, each checked with result

## Gate
The spec's **Definition of done** section, verbatim, executed by the human
on a real phone: every item passes, including kill-the-network read-only
open and visible write rollback. This gate closes the build.
