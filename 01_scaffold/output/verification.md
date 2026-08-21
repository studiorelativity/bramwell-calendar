# Stage 01 — Verification

Date: 2026-08-20 · Commit: `8d4343b`

## Gate criteria

| Criterion | Result |
|---|---|
| `npm run dev` serves without errors | **Pass.** Vite 8.2.2 ready in 88ms. `/` 200, `/manifest.webmanifest` 200, `/icon-192.png` 200, `/src/main.ts` 200. No warnings in the server log. |
| `tsc --noEmit` passes — all stub imports resolve | **Pass.** Clean under `strict: true`. `npm run build` also succeeds (`tsc && vite build`), icons and manifest emitted to `dist/`. |
| types.ts reviewed by human against the spec's API section | **Pass.** Signed off by the human 2026-08-20. Stage 01 gate closed. |

Toolchain: node 26.5.0, npm 11.17.0, vite ^8.2.0, typescript ~6.0.2.

## What exists

Repo-root Vite tree matching the spec's file layout exactly. Every `/src`
module is a stub exporting its spec-defined public interface and nothing
else, headed by a `// STAGE NN` comment: auth/gcal/categories/state → 02,
scroll/render → 03, drawer/sw → 04. Stub bodies throw
`Error('STAGE NN: not implemented')`; no implementation logic anywhere
outside `types.ts`.

`types.ts` is implemented in full — `CalendarEvent`, `EventDraft`,
`EventSpan`, `Category`, the week-index scalars, and the localStorage cache
shapes.

## Decisions the spec left open

1. **Two date representations, not one.** Conventions say the internal
   representation is week index + day offset. Taken literally that breaks
   two things: WeekIndex is anchored to *today*, so a stored event would
   shift by one every midnight, and a cached month would decode differently
   in the next session. Split it: `DayNumber` (absolute civil-date integer)
   is what events and prefs store; `WeekIndex`/`DayOffset` are the
   layout/scroll coordinate, derived from `DayNumber` by a pure function in
   `state.ts`. Date objects still appear only at the API and display
   boundaries, which is what the rule is protecting.
   → **Resolved 2026-08-20:** ratified by the human and written into
   conventions.md — "storage uses DayNumber (absolute, epoch-anchored).
   WeekIndex/DayOffset are layout-time derivations relative to today; never
   persisted. Conversion lives in state.ts only." Audited: no persisted
   shape carries a WeekIndex, and WeekIndex appears outside `state.ts` only
   in `scroll.ts`/`render.ts`.

2. **Week starts Monday**, `DayOffset` 0=Mon … 5=Sat, 6=Sun. The spec only
   says weekend columns get a shade; Monday-start keeps Sat/Sun adjacent as
   one weekend block at the end of the row, which is what the shading
   implies.

3. **All-day `end` is inclusive internally.** The Google API's exclusive end
   date is converted at the `gcal.ts` boundary only, matching the spec's
   note that the form's end field is inclusive. Nothing upstream of the
   wire has to think about it.

4. **`prefs.lastDockedDay` is a `DayNumber`, not a WeekIndex** — same
   overnight-drift reason as (1). Re-anchored against the new session's
   week 0 on launch.

5. **`MonthLoadState`** (`absent | loading | ready | error`) added — the
   spec's lazy month loading needs a state per month that render.ts can see
   without touching gcal.ts.

6. **Icons live in `public/`.** The spec's file layout does not enumerate
   icon files, but the PWA section requires them. `public/` is where Vite
   copies static assets to the site root; the manifest references
   `/icon-192.png` and `/icon-512.png`. Generated: the lens motif — two
   bright docked rows between dimmer compressed ones on the work-blue
   theme color.

## Deviation to watch

**No `src/style.css`.** The spec's file layout does not include a
stylesheet, so none was created — the four category custom properties and
the light/dark surface tokens live in one `<style>` block in `index.html`,
"defined once" per conventions. Stage 03 will almost certainly outgrow
this. When it does, add `/src/style.css` **to the spec's file layout
first**, then create it (fix upstream, don't just drop a file in).

## For review before stage 02 starts

- `src/types.ts` against the spec's Auth / Calendar API / Categories
  sections — the gate's human check.
- ~~Decision 1~~ — resolved; conventions.md now carries the reworded rule.

## Blocking human step before stage 02

`.env.local` with `VITE_GOOGLE_CLIENT_ID=` per the spec's MANUAL SETUP
section (v2's client ID carries over if it exists). Not created here —
`.env.local` is gitignored and Claude cannot do the Console step. Stage 02
cannot pass its gate without it.
