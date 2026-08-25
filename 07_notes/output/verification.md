# Stage 07 — Verification

Date: 2026-08-24 · Implements day notes: `isDayNote` at the wire boundary,
`noteForDay`/`saveNote` upsert in state, cell marker, year-panel indicator,
drawer Notes panel

## Gate — OPEN, awaiting the human checklist

`tsc --noEmit` clean and `npm run build` green. Everything reachable without
a real Google account has been exercised headlessly and passes. **The wire
format itself is unverified** — no note created by this build has been opened
in the Google Calendar app. That is the first item of the human gate and it
cannot be self-certified.

## Toolchain

node 26.5.0, vite 8.2.2, typescript 6.0.2. Headless Chrome 
(`--dump-dom --virtual-time-budget`) against `npm run dev`, driving the real
UI in a same-origin iframe — the stage 04 method. Dev, not the production
build, because the service worker registers only in prod and headless Chrome
hangs on SW registration under a virtual-time budget (stage 04, still true).

## Gate criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Save a note: marker appears; survives reload; correct shape in the Google Calendar app | **Awaiting human.** Marker and persistence verified headlessly against the demo cache; the wire shape is stub-free but has never been sent to Google. |
| 2 | Edit to empty: event deleted, marker gone | **Logic verified, wire awaiting human.** `saveNote` routes empty text to `deleteEvent`. |
| 3 | A day with events AND a note: bars/chips unchanged, "+N" excludes the note, drawer shows Notes panel above the list | **Pass**, headless. Evidence below. |
| 4 | Type a note, background refresh, text survives | **Pass**, headless. |
| 5 | Offline: note save fails visibly and rolls back | **Inherited, not separately exercised.** See "What was not tested" below. |
| 6 | `?demo`: two seeded notes visible; editing rejects with the demo message | **Pass**, headless. |

## Automated evidence

### No-regression: lane packing is byte-identical

The constraint was that a seeded week must render identically to pre-stage
except for the marker. Measured three ways, same demo seed, same viewport:

```
baseline (notes absent from the seed entirely):  13 bars, 32 chips
stage 07 (notes seeded, filter active):          13 bars, 32 chips   IDENTICAL
filter deliberately disabled (control):          15 bars, 32 chips
```

The third row is the control that makes the first two mean something: with
the filter off, the two notes *do* claim lanes, so the filter is load-bearing
rather than incidentally inert. Comparing the 13 non-note bars attribute by
attribute — title, `data-cat`, `--c0`, `--cs`, `--lane` — the baseline and
stage-07 lists are equal, so no event was renumbered or resorted.

Cell markers: 91 `.notedot` spans (one per realized day cell), exactly **2**
visible, on 22 and 27 August — the two seeded days (`t-2`, `t+3`; today is
24 August). Zero bars or chips carry note text.

### Drawer

Tapping 27 August, which carries a note, two timed events and two all-day
events:

```
drawer date: Thursday, August 27
notes panel present: true
notes panel above list: true
note text shown: "Ask Alex about the Q4 handover.\nBring the printed timeline."
event rows: Flat viewing | Product launch runway | 1:1 with Alex | Dentist | Gym
editor open: true
textarea prefilled: "Ask Alex about the Q4 handover.\nBring the printed timeline."
text survives repaint: "typed but not saved"
demo rejection shown: true
demo message: "Demo — connect your Google Calendar to save."
still in editor (not saved): true
```

The event row list is the note-free list — the note is in the panel, not the
rows. `text survives repaint` is the transient-UI rule: a repaint was forced
while the editor held unsaved text and the text was still there afterwards.

### Year view

```
year cells: 365          total year bars: 205
any ybars element carries note text: false
panel date line: THU 27 AUG      note indicator: true
panel event rows: Product launch runway | Gym | 1:1 with Alex | Dentist | Flat viewing
note text in panel rows: false
control day (FRI 28 AUG) has indicator: false
```

The control day matters: it shows the indicator tracks notes rather than
appearing on every card.

## Decisions the spec left open

1. **`EventDraft` gained `isDayNote?: true` — an interface gap in stage 01's
   `types.ts`, fixed upstream rather than worked around.** The contract's
   step 1 named only `CalendarEvent`, but that flag is set on *read*. On the
   write side `state.saveNote` must tell `gcal.ts` "this is a note", and the
   only channel from state to gcal is `EventDraft`. Without the field the
   options were (a) `state.ts` emits the extended property itself, putting
   the wire format in two modules, or (b) `gcal.ts` grows daynote-specific
   create/patch entry points, so notes bypass the optimistic write paths the
   contract requires them to use. Both break a hard boundary. One optional
   field does not. `07_notes/CONTEXT.md` step 1 has been corrected to match.

2. **The year panel marks the date line; the year cell does not get a
   marker.** The contract left this to the implementer. A year cell is ~44px
   and already spends its space on up to 3 bars; a second marker class there
   would compete with them at the size where they are least legible. The
   calendar view has the room and carries the marker; the year view surfaces
   notes on hover instead.

3. **A note-only day reads "Note only", not "Nothing".** The year panel's
   empty state would otherwise assert a day was empty when it holds a note —
   the one place where excluding notes from the event list produces a false
   statement rather than a quiet omission.

4. **`saveNote` does not short-circuit an unchanged save.** Skipping the
   write when text is unmodified would be a cheap optimization, but it also
   skips the demo and offline guards, so an unchanged save in demo would
   silently appear to succeed. Every non-trivial path goes through a guarded
   write. Empty text on a day with no note still returns early — that is not
   a write at all, so there is nothing to reject.

5. **The extended property is re-sent on PATCH, not just POST.** Not required
   — a patch preserves it — but it makes any save repair a note whose
   property was stripped by hand-editing in the Google apps.

6. **Optimistic creates carry the flag.** `state.createEvent` builds its
   optimistic event field by field rather than spreading the draft, so
   without an explicit copy a new note would paint as a bar for one frame
   before the server's answer replaced it.

7. **Duplicate daynotes: earliest id wins, extras are left alone.** Per the
   contract. `noteForDay` scans for the lowest id rather than taking the
   first match, so the choice is stable across cache reorderings — a
   first-match rule would let a background refresh silently swap which of two
   notes the drawer edits.

8. **`render.ts` collects note days during lane packing instead of calling
   `noteForDay` per cell.** The contract's step 4 says to mark the cell "when
   `noteForDay` hits", which reads as a per-cell call — 7 per row, each one
   re-walking that week's events, ~98 redundant scans per full repaint in a
   file whose whole job is holding 60fps. `layoutWeek` already walks the
   row's events once to filter notes out, so it records the columns while it
   is there. Verified equivalent: marker days and all 13 bar attribute tuples
   are identical before and after the change.

9. **`style.css` was edited although the contract's Outputs list omitted it.**
   The marker and the Notes panel are new UI. Recorded per the conventions
   file-layout rule and added to the contract's Outputs.

## What was not tested

- **The wire format.** Gate items 1 and 2. No note has round-tripped through
  Google. The extended property, the 60-char summary derivation, the `other`
  colorId and the single-day all-day span are all unexercised against the
  real API. This is the same class of gap as the stage 02 carry-forwards
  (category colours, exclusive-end conversion), which also remain open.
- **Offline rollback for notes specifically.** `saveNote` delegates to
  `createEvent`/`updateEvent`/`deleteEvent`, whose offline-failure and
  rollback behaviour was verified at the stage 04 gate. Notes add no new
  path, so this is inherited rather than retested — but it is inherited, not
  demonstrated, and the human gate should still run it.
- **Real-device drawer layout.** The Notes panel adds height above the event
  list; whether it crowds the list on a small notched phone is a device
  judgement.

## Service worker, fixed while closing this stage

Stage 07 shipped to the deployed origin and was invisible on an installed
client. Cause: `sw.ts` served every same-origin GET cache-first, including
the shell HTML. `/index.html` keeps its URL across deploys, so the cached
copy kept pointing at a bundle that was no longer current, and the hashed
bundle it named was cached too. Nothing could break the loop except bumping
`CACHE` by hand — which stage 05 had done, and stage 07 had not. **No deploy
could ever reach an installed client on its own.**

Rewritten to split on whether a URL is content-addressed:

| Path | Strategy | Why |
|---|---|---|
| `/assets/*` | cache-first | Hashed filenames — a hit is always current |
| everything else | network-first, cache as offline fallback | URL is stable across content changes, so a cached copy can be arbitrarily stale |

Two related defects fixed in the same pass:

- `/index.html` is out of `SHELL`. Workers static assets 307s it to `/`, and
  `cache.add` would have stored a redirected response, which the browser
  refuses to replay for a navigation — so the offline fallback would have
  failed on the deployed host. It now falls back to `/`, which returns 200.
- Responses are never cached when `response.redirected` is true, so the same
  class of bug cannot be reintroduced by a different path.

`CACHE` bumped to `bramwell-shell-v4` once, to evict the v3 caches holding a
pre-stage-07 shell. It should not need bumping again: the strategy no longer
depends on it.

Verified: `dist/sw.js` still emits at the site root, parses as a classic
script (`node --check`), contains no ESM, and the minified output carries all
three behaviours. **The runtime behaviour is untested** — headless Chrome
still hangs on service worker registration under a virtual-time budget, which
is the same gap stage 04 recorded. First real install is the test.

## Human gate checklist

Requires a real Google account. `?demo` covers items 5–6 without one.

1. Save a note on a day. Confirm the marker appears bottom-right, and that
   reloading keeps it.
2. Open that day in the Google Calendar app. Confirm: title is the note's
   first line, description is the full text, colour is `other` (grey-blue).
3. Save a note longer than 60 characters on its first line. Confirm Google
   shows a clipped title and the full text still in the description.
4. Edit the note to empty and save. Confirm the event is gone from Google
   Calendar and the marker has gone.
5. On a day that already has events, confirm the bars and chips are exactly
   as they were before the note existed, and the drawer shows the Notes
   panel above the event list.
6. Type into the note editor, wait past the refresh interval, confirm the
   text is still there.
7. Go offline, edit a note, save. Confirm the visible failure and that the
   old text comes back.
8. Open `?demo`. Confirm two notes are visible and that editing one is
   rejected with the demo message.

## Amendment — 2026-08-24 · cell marker becomes a labelled pill

Requested directly: each day carrying a note shows a pill in the cell's
bottom-right corner reading "note", white fill, black text. This replaces
the 4px neutral dot the stage shipped; placement and semantics are
unchanged, so nothing in the layout or exclusion logic moved.

1. **`render.ts`**: the marker span is now `.notepill` and carries the
   static text `note`, set once at cell-build time. `renderWeekRow` still
   only toggles `hidden`, so the per-frame cost is what it was.
2. **`style.css`**: `.notedot` renamed to `.notepill` — a dot it no longer
   is — and restyled as a pill (`padding: 0 4px`, `border-radius: 999px`,
   `font-size: 8px`). Fill `#fff`, text `#000`, both literal rather than
   tokens: the request fixes the pill's colours in both themes.
3. **Hairline added** (`1px solid var(--rule-strong)`). In light mode the
   surface is `#faf9f7` and a `#fff` fill is very nearly invisible against
   it — without the border the pill reads as bare floating text, not a
   pill. The border changes neither the fill nor the text colour asked for.

`.ypnote` — the year panel's note marker — is deliberately untouched. It
sits on a date line, not in a grid cell, and there is no room there for a
word.

Evidence: `npm run build` clean (`tsc` + vite); no `.notedot` references
remain in `src/`. Note that the count in "Automated evidence" above (91
`.notedot` spans) refers to the pre-amendment class name.

Open, folds into the human gate — no headless browser is installed, so
neither was checked:

- **Light mode legibility.** A white pill on a warm-white surface is the
  weakest case; confirm it reads as a pill at arm's length, and in dark
  mode confirm it is not so bright it out-shouts the event bars, which are
  the only strong colour on screen by the spec's visual direction.
- **Collision with "+N" on a narrow cell.** The pill is ~28px wide; a day
  column on a 320px-wide phone is ~45px, leaving very little between it and
  `.more` at bottom-left. Check a day that has both a note and a "+N"
  overflow count on the narrowest phone in use.
