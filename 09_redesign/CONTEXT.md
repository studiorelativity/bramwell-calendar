# Stage 09 — Redesign (Night Depth: motion system + inline day)

**Status: PROPOSED.** Direction chosen 2026-08-29 ("Night Depth", design
canvas in Claude artifacts: week-view artboard + motion-primitives
artboard). Per the fix-upstream rule, the spec must gain a "Visual
direction v4 (Night Depth)" section and a "Motion" section from the
canvas before this stage opens; the drawer sections it obsoletes get
marked superseded, not deleted.

## What this stage is

Two things, in order, and the first is the primitive the second consumes:

1. **A motion system.** Duration and easing tokens in `:root` beside the
   color tokens (`--t-fast: 140ms`, `--t-base: 240ms`, `--t-open: 380ms`,
   `--ease-out: cubic-bezier(0.22,1,0.36,1)`,
   `--ease-spring: cubic-bezier(0.34,1.56,0.64,1)`), a three-level
   elevation scale (resting cell / hovered cell / open day — nothing else
   casts), one enter/exit utility that solves `display:none` vs.
   animation once (`@starting-style` + `transition-behavior:
   allow-discrete` on enter, `transitionend` on exit), and
   `prefers-reduced-motion` collapsing everything to 80ms opacity.
   Components never write their own transitions after this stage.

2. **Inline day expansion replaces the drawer.** Click a day and it grows
   in place inside its week row — row height and the row's
   grid-template-columns animate together (380ms spring), neighbors
   compress, content staggers in 40ms apart (fade + 6px rise). Collapse
   is 240ms, no stagger. Hover lifts a cell -2px with a ring (140ms in,
   240ms out). The expanded day carries what the drawer carried: events,
   note, add/edit form — plus the layout shown on the canvas.

## The crux (read before planning)

`scroll.ts`'s virtualizer places uniform, transform-positioned week
rows. One expanded row breaks the uniform-height assumption. The
virtualizer must support exactly one variable-height row: rows below the
expanded one shift by the delta, and the delta animates. This is the
architectural work of the stage; the visuals are cheap by comparison.
If the plan can't make the virtualizer do this cleanly, stop and revise
this contract — do not fake it with an overlay.

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — "Visual direction v4" + "Motion"
  (to be added), "Rendering", "Scrolling", "Day drawer" (superseded parts)
- L3: `../_references/conventions.md`
- L3: the design canvas (Night Depth week view + motion primitives)
- L4: `src/scroll.ts`, `src/render.ts`, `src/drawer.ts`, `src/style.css`,
  `index.html`, `src/main.ts` as built through 08

## Process (per file)

1. `index.html` — motion + elevation tokens in `:root`.
2. `style.css` — token consumption only: cell resting/hover/open,
   expanded-day layout, stagger rules, reduced-motion block. Delete the
   fixed-overlay drawer styles when nothing references them.
3. `scroll.ts` — variable-height row support: an `expandedWeek` +
   animated delta the transform placement respects.
4. `render.ts` — renders the expanded state of a week row; day cells get
   hover affordance and today ring per the canvas.
5. `drawer.ts` — the content (event list, form, notes) survives; the
   fixed-overlay shell dies. Whether the file is renamed or repurposed is
   the plan's call; module boundaries hold either way (`gcal.ts` stays
   the only network file).
6. `main.ts` — wiring: one open day at a time; opening another collapses
   the first; Escape collapses; scroll does not force-collapse.

## Open decisions (log rulings in output/verification.md)
- Phone (≤560px): the day expands to the full row width inline, or keeps
  a bottom sheet. Leaning inline-full-width; ruling at plan time.
- Year-view hover panel: untouched this stage, restyled with the same
  tokens in a later pass.

## Definition of done
- No transition/animation values outside the token layer.
- Drawer overlay gone; every drawer capability reachable inline.
- 60fps expand/collapse on the MacBook and on a mid phone (compositor
  properties only for hover; the row-height animation is the one
  layout animation and is contained).
- Reduced-motion path verified.
- Demo mode identical in behavior.
- `output/verification.md` written: gate criteria, results, rulings.
