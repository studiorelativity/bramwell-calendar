# Stage 03 — Scroll Engine & Rendering

The hard stage. Expect iteration; keep the human in the loop on motion feel.

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — sections **"The core interaction:
  the lens"**, **"Layout details"**, **"Perpetual scroll mechanics"**
  (virtualization portion), **"Visual direction"**
- L3: `../_references/conventions.md`
- L4: `src/state.ts`, `src/types.ts` as built in 02 — consume their real
  interfaces; do not reach around them

## Process
*(Revised 2026-08-20 after the lens was built and rejected. See the spec's
"The core interaction: the rolling month".)*

1. `src/scroll.ts` — virtualizer (uniform recycled week rows, count derived
   from viewport height, week index as source of truth), month snapping
   (each detent = one month, resting with the month boundary at the vertical
   centre of the viewport; momentum settles softly, never hard-stops).
   Haptics off by default.
2. `src/render.ts` — week rows (7 columns, weekend shade, alternating neutral
   month band per day column), day numbers top-RIGHT and the inline month
   label top-LEFT so they cannot collide, multi-week bars wrapping across rows
   with longest-first lane packing, timed-event chips sorted by start time,
   inline month boundary rules, sticky cross-fading header naming the
   month(s) in view, today marker, Today button, 15/30/45 snap selector.
3. Wire into `main.ts`: first load rests on the boundary nearest today, today
   marked.

## Constraints
- Transform-based positioning only. No layout reads in the scroll handler —
  interpolation math on cached measurements.
- Row height is proportional (~6.5 weeks fill the viewport), within sane px
  bounds. Verify on a notched-phone viewport and a desktop viewport.
- Nothing may overflow the row horizontally — no scaling of rows. Day numbers
  clipping at the left edge was a real defect the first time round.
- The page must not double-tap-zoom on a phone; the scroller owns the gesture.
  Note iOS Safari ignores `user-scalable=no` — `touch-action` plus explicit
  gesture suppression is what actually works.
- No audio work. Sound toggle is a pref stub only; motion is the priority.
- Do not modify 02's modules. If their interface is insufficient, stop and
  flag it — that is an upstream fix, decided at the gate, not silently patched.

## Outputs
- Implemented `scroll.ts`, `render.ts`, wired `main.ts`
- `output/verification.md` — include what was tuned by feel (easing curves,
  detent thresholds) so the decisions are recoverable

## Gate (human, on a real phone + desktop)
- Flick three months ahead: 60fps, momentum settles softly onto a month
  boundary centred in the viewport, header updates
- A full month is readable at a glance; alternating month bands make the
  boundary obvious without reading labels
- Scroll a year into the past: months load as approached, no jank, DOM node
  count stays bounded (verify in devtools)
- A 3-week all-day event renders as a wrapping bar across three week rows
- Today button returns and snaps from anywhere
- Desktop: no day number clipped at the left edge, at any window width
- Phone: double-tapping a day does not zoom the page
