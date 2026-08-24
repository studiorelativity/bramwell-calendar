# Stage 05 — Polish: Identity, Settings, Add Affordance, Visual Pass

**Status: APPROVED 2026-08-23.** Mock approved by the human (calendar +
year view sections); spec revision applied to BUILD-SPEC-V3.md the same
day, including one amendment beyond the draft: `signOut()` added to
auth.ts's export list (Settings requires it; flagged at approval).
SPEC-REVISION-DRAFT.md deleted after application per its own instruction.

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — sections **"Visual direction"**,
  **"Layout details"**, **"File layout"**, **"First-run and connection
  state"** (new), **"Settings"** (new), **"Definition of done"** — as
  revised per SPEC-REVISION-DRAFT.md
- L3: `../_references/conventions.md`
- L3: `mock.html` in this folder — the approved visual reference. Token
  values come from here; the spec describes intent, the mock fixes numbers.
- L4: everything built in 01–04, consumed through existing interfaces

## Process
1. **Token pass.** Replace the palette in `index.html`'s `<style>` block
   (or `src/style.css` if this stage adds it to the spec's file layout
   first — see recurring-edit log; three strikes have already accrued).
   Dark surfaces lift to the mock's warm graphite; add `--ink-faint`,
   `--rule-strong`, `--hover` tokens. Light palette warms slightly.
2. **Grid pass** in `render.ts` styles: hairline rules between rows and
   columns, hover wash on day cells (desktop), day numbers `tabular-nums`,
   today number in a filled ink circle, month pill unchanged (already
   shared with year view).
3. **Event bar pass**: tinted-fill bars (category color ~16% over band,
   text/spine at full color), 5px radius, 3px left spine, continuation
   variants keep flat edges at row breaks. Chips gain a category dot and
   muted time. Dark mode uses the brightened category variants from the
   mock — the light-mode hues fail contrast on tinted dark fills.
4. **First-run screen** (new, in `main.ts` or a small module the revised
   file layout names): shown when `isSignedIn()` is false and no cached
   months exist — mark, name, one-liner, Connect button (wraps
   `auth.signIn`), storage note. If a cache exists but auth is stale, the
   calendar renders read-only from cache with a reconnect pill in the
   header instead of the full screen (this preserves 04's offline-open
   behavior).
5. **Header rework**: month title heavier; Cal/Year, Today, avatar. The
   15/30/45 selector MOVES to settings. Avatar shows account initial and a
   connection dot driven by auth state; opens the settings sheet.
6. **Settings sheet** (part of the same module as 4): account row +
   sign-out, snap granularity (writes `prefs.snapStepDays`), default view,
   sound stub. Persisted via existing prefs; no new storage.
7. **FAB**: bottom-right, safe-area aware, opens the stage 04 event form
   pre-filled with the date nearest the viewport center. Desktop: `n` key
   does the same. No drag-to-create in this stage.
8. **Year view pass** in `year.ts` styles — same tokens, no structural
   change: band + weekend + hairline treatment on cells, 2px-radius bars
   (full color at that size; tinting does not read at 4px), today ring
   scaled down, a 2px `--rule-strong` rule on each month's leading edge,
   hover wash on cells, and the hover/tap panel restyled per the mock
   (card, focus row emphasized, category dots, meridiem times — content
   unchanged from 03). The FAB shows in the year view too, pre-filled with
   today.

## Constraints
- Module boundaries hold: the new UI talks to `auth.ts` and `state.ts`
  through their existing exports. If an export is missing (e.g. a
  sign-out/revoke on auth.ts), STOP and flag it — that is a contract
  amendment decided at the gate, not an ad-hoc export.
- Do not re-tune scroll feel. `scroll.ts` constants are gate-approved from
  03; this stage touches presentation only.
- Transient-UI rule from 04 applies to the settings sheet and first-run
  screen: a background month refresh must not close or reset either.
- The four category colors remain the only strong color on screen. The
  connection dot and destructive sign-out red are the sole exceptions,
  both tiny.
- Every value tuned by eye during this stage goes back into `mock.html`
  so mock and product cannot drift.

## Outputs
- Revised tokens, render/bar/chip styles, first-run screen, settings
  sheet, FAB, header rework
- `output/verification.md` — including before/after screenshots at phone
  and desktop widths, light and dark

## Gate (human, phone + desktop, light + dark)
- Cold start signed out shows the first-run screen; Connect completes and
  lands on today. Kill the token (revoke in Google account settings),
  reload: cached calendar renders read-only with the reconnect pill — the
  full first-run screen must NOT appear over a warm cache.
- Month boundary readable from bands alone in dark mode at arm's length —
  in BOTH views. The year view's 365-cell grid is the harder test.
- Today findable within one second on a full grid.
- FAB creates an event on the centered date; `n` works on desktop; FAB
  never overlaps the last week row's Sunday events on a notched phone.
- Settings: all three snap values still land on valid anchors (03's
  verified behavior unchanged); sign-out returns to first-run.
- Carried from 02/04, still open: category colors and all-day
  exclusive-end confirmed in the Google Calendar app on the real wire.
  This stage creates events anyway — close these two while at it.
