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
1. `src/scroll.ts` — virtualizer (~40 recycled week rows, week index as
   source of truth), two-week detent snapping (momentum settles into the
   detent, never hard-stops), scroll-linked lens interpolation (row height,
   opacity, detail reveal as continuous functions of distance-from-lens),
   `navigator.vibrate(8)` on dock where supported.
2. `src/render.ts` — week rows (7 columns, weekend shade), lens rows at full
   detail vs. compressed bar-only rows, multi-week bars wrapping across rows
   with longest-first lane packing, timed-event chips sorted by start time
   in lens rows, inline month boundary rules, sticky cross-fading month/year
   header, today marker, Today button with animated return-and-dock.
3. Wire into `main.ts`: first load docks current week + next, today marked.

## Constraints
- Transform-based positioning only. No layout reads in the scroll handler —
  interpolation math on cached measurements.
- Lens height is proportional (~35% viewport), never fixed px. Verify on a
  notched-phone viewport and a desktop viewport.
- No audio work. Sound toggle is a pref stub only; motion is the priority.
- Do not modify 02's modules. If their interface is insufficient, stop and
  flag it — that is an upstream fix, decided at the gate, not silently patched.

## Outputs
- Implemented `scroll.ts`, `render.ts`, wired `main.ts`
- `output/verification.md` — include what was tuned by feel (easing curves,
  detent thresholds) so the decisions are recoverable

## Gate (human, on a real phone + desktop)
- Flick three months ahead: 60fps, weeks lift into the lens and settle out,
  momentum ends docked, header updates, haptic tick fires
- Scroll a year into the past: months load as approached, no jank, DOM node
  count stays bounded (verify in devtools)
- A 3-week all-day event renders as a wrapping bar across three week rows
- Today button returns and docks from anywhere
