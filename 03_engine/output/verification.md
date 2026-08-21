# Stage 03 — Verification

Date: 2026-08-20 · Implements `scroll.ts`, `render.ts`, `style.css`, wires `main.ts`

## Revision — the lens was built, tried, and rejected

The first stage 03 build implemented the spec's lens: scroll-linked zoom, two
week rows at full detail, everything else compressed to 20px, two-week
detents. It worked and it snapped softly, but on the device the compressed
rows made the shape of a month **harder** to read, which was the entire
justification for compressing them. Human call, 2026-08-20: drop the lens.

Fixed upstream first, per the rules: the spec's "The core interaction"
section, Layout details, Perpetual scroll mechanics, Visual direction, and
Definition of done were rewritten, along with this stage's contract, before
any code changed. The spec now describes a **rolling month**: uniform rows,
month detents, alternating month bands.

## Two defects from the first build, both fixed at the root

1. **Day numbers clipped at the left edge on desktop.** Docked rows carried
   `transform: scale(1.01)` for the spec's "barely-there elevation". Scaling a
   full-width row from its centre pushes it ~0.5% past each edge — about 7px
   at 1440px wide — and `#calendar { overflow: hidden }` cut off the Monday
   column's day number. Row scaling is gone entirely (the revised Visual
   direction forbids it), and the contract now carries "nothing may overflow
   the row horizontally" as a constraint.

2. **Double-tap zoomed the phone and stranded it there.** The viewport meta
   allowed user scaling, so a double-tap triggered the browser's zoom — but
   `#calendar { touch-action: none }` swallows the gesture that would zoom
   back out, leaving no way to recover without a reload. The viewport meta is
   now `maximum-scale=1, user-scalable=no`: the scroller owns the gesture, so
   the browser must not also claim it.

## Gate (human, on a real phone + desktop) — NOT YET RUN

| Gate criterion | Status |
|---|---|
| Flick three months: 60fps, settles softly onto a centred month boundary, header updates | **Awaiting human.** Snap geometry verified; feel is untested. |
| A full month readable at a glance; bands make the boundary obvious | **Partly pre-verified** — bands render and split mid-row correctly. Legibility is a judgement. |
| Scroll a year into the past: months load as approached, no jank, DOM bounded | **Partly pre-verified.** 14 rows realized at every viewport, fixed by construction. |
| A 3-week all-day event wraps across three week rows | **Pre-verified in headless Chrome.** |
| Today button returns and snaps from anywhere | **Awaiting human.** |
| Desktop: no day number clipped at any window width | **Pre-verified** — no scaling remains; verify by eye. |
| Phone: double-tapping a day does not zoom | **Awaiting human** — needs a real touch device. |

## Automated evidence

Headless Chrome against the dev server, cache seeded through localStorage.

**Uniform rows, and the boundary lands exactly centred:**

| Window | innerHeight | Row height | Rows realized | Boundary y | Content centre |
|---|---|---|---|---|---|
| 390 x 844 | 757 | 106.31px | 14 | 411.5 | **411.5** |
| 1440 x 900 | 813 | 114.92px | 14 | 439.5 | **439.5** |
| 1920 x 1200 | 1113 | 161.08px | 14 | 589.5 | **589.5** |

Row spacing equals row height exactly at every viewport — no gaps, no
overlaps, one height per viewport. Consecutive month boundaries sit ~4.3 rows
apart, so one detent moves ~30 days. `scale(` appears nowhere in the output.

**Bands, bars and chips** — August is band 1, September band 0:

```
week 0: bands=1111111  today=1
   bar  work       col=0 span=7 lane=0  "Sabbatical"      cont-right
   bar  financial  col=2 span=2 lane=1  "Tax filing"
   chip col=3  9:30  "Standup"
week 1: bands=1111111
   bar  work       col=0 span=7 lane=0  ""   cont-left cont-right
week 2: bands=1000000            <- Mon 31 Aug, then Sep from Tuesday on
   bar  work       col=0 span=7 lane=0  ""   cont-left
```

The band splits mid-row precisely at Sep 1, which is the point of applying it
per column rather than per row. The 3-week bar still wraps across exactly
three rows with the title on the true start only. Week-index selftest still
passes: **9/9**. No page errors.

**DOM is much smaller than the lens build**: 14 rows at every viewport, versus
50–68 before, because uniform rows only need to cover the viewport once.

## Tuned by feel — all constants at the top of `scroll.ts`

| Constant | Value | Why |
|---|---|---|
| `VISIBLE_WEEKS` | 6.5 | A month plus its edges. Raise to see more at once and shrink the rows. |
| `MIN_ROW_H` / `MAX_ROW_H` | 74 / 190 | Keeps the proportional height sane on extreme viewports. |
| `SNAP_ALIGN` | 0.5 | Where the boundary rests, as a fraction of the content area. 0.5 centres it; lower it to sit the boundary higher and show more of the incoming month. |
| `PROJECT_MS` | 300 | How far momentum is projected before quantizing to a month. |
| `SETTLE_BASE_MS` / `SETTLE_PER_WEEK_MS` / `SETTLE_MAX_MS` | 280 / 42 / 760 | Soft landing, scaled by distance. The previous build's settle was kept — you said it lands softly. |
| `WHEEL_GAIN` | 0.6 | Trackpads over-deliver. |
| `WHEEL_IDLE_MS` | 140 | Quiet period before a wheel gesture settles. |
| `HAPTIC_ON_SNAP` | **false** | You asked to move away from the haptic feel. One flag to restore it. |

Easing is `easeOutCubic`, unchanged from the build you tried. Velocity is
smoothed 0.7/0.3. Drag is 1:1 with row height — one row per row-height of
finger travel, which uniform rows make honest.

## Decisions the spec left open

1. **`SNAP_ALIGN = 0.5` reads "month + .5" as boundary-centred.** Your words
   were "snap to the next month+.5 … so I can see the end of month and the
   beginning of the next month". So each detent is one month apart, and rest
   position puts the boundary at the middle of the content area. If you meant
   the boundary should sit higher — more of the incoming month, less of the
   outgoing — `SNAP_ALIGN` is the single number to change.

2. **Timed events are chips only.** With no compressed rows there is nothing
   for the old thin-bar-when-compressed rule to serve. Bars are now all-day
   and multi-day events exclusively.

3. **Header names the range, not one month.** At rest the view always
   straddles a boundary, so "August 2026" would be wrong half the time. It
   shows "Aug – Sep 2026" when two months are visible and "August 2026" when
   only one is, and still cross-fades on change.

4. **Bands key off month parity** (`month % 2`), so they alternate correctly
   across a year boundary — December and January differ.

5. **Row height is proportional with clamps**, so a full month fits on any
   viewport, rather than a fixed pixel height that would show two months on a
   monitor and half of one on a phone.

6. **`placeRow(node, y, height)` replaced `applyLens(node, t, …)`** — there is
   no lens value any more. Two style writes per row per frame.

7. **`prefs.lastDockedDay` is still written but not read at launch** — first
   load rests on the boundary nearest today. Unchanged, still your call.

## Human gate checklist

1. Phone. Flick three months. It should move ~30 days per flick and settle
   softly with the boundary mid-screen.
2. **Double-tap a day.** The page must not zoom. This is the fix for the bug
   you hit; it needs a real touch device to confirm.
3. Desktop, several window widths including narrow. No day number may be cut
   off at the left edge.
4. Is 6.5 weeks the right amount to see at once? `VISIBLE_WEEKS` is one number.
5. Are the month bands strong enough to read the boundary without the label —
   and not so strong they compete with the event colours? Tokens are
   `--band-a/b` and `--band-a-we/b-we` in `index.html`.
6. Scroll a year back; confirm the `.week` node count stays at 14 in devtools.
7. Today button from a year away.
