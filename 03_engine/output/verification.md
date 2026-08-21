# Stage 03 — Verification

Date: 2026-08-20 · Implements `scroll.ts`, `render.ts`, `style.css`, wires `main.ts`

## Gate (human, on a real phone + desktop) — NOT YET RUN

All four criteria are motion-and-feel judgements on real hardware. What could
be verified headlessly is below; none of it substitutes for the gate.

| Gate criterion | Status |
|---|---|
| Flick three months: 60fps, lift/settle, momentum ends docked, header updates, haptic tick | **Awaiting human.** Physics implemented; feel is untested. |
| Scroll a year into the past: months load as approached, no jank, DOM bounded | **Partly pre-verified.** DOM is bounded by construction (fixed pool, modulo recycling) and measured at three viewports. Jank and lazy-load timing need the device. |
| A 3-week all-day event wraps as a bar across three week rows | **Pre-verified in headless Chrome** — see below. Confirm visually. |
| Today button returns and docks from anywhere | **Awaiting human.** |

## Automated evidence

Headless Chrome against the dev server, cache seeded through localStorage.

**Wrapping bar, lane packing, chips** — a 3-week all-day event, a 2-day
event, and a timed event, seeded into week 0:

```
week 0:  bar   work       col=0 span=7 lane=0  "Sabbatical"   cont-right
         bar   financial  col=2 span=2 lane=1  "Tax filing"
         bar   personal   col=3 span=1 lane=2  (timed, no title)
         chip  col=3  9:30  "Standup"
week 1:  bar   work       col=0 span=7 lane=0  ""             cont-left cont-right
week 2:  bar   work       col=0 span=7 lane=0  ""             cont-left
```

Wraps across exactly three rows; continuation flags square the joined ends;
the title appears only on the true start; longest-first put the 3-week bar in
lane 0. The timed event is simultaneously a thin bar (compressed) and a chip
(lens) — see decision 4.

**Lens ratio and pool size**, three viewports:

| Window | innerHeight | Lens rows | Lens / viewport | Rows realized |
|---|---|---|---|---|
| 390 x 844 | 757 | 132.47px | **0.350** | 50 |
| 1440 x 900 | 813 | 142.27px | **0.350** | 53 |
| 1920 x 1200 | 1113 | 194.77px | **0.350** | 68 |

Rows are exactly contiguous (week 0 at y=246.03 h=132.47 → week 1 at
y=378.50), and the two docked rows fill the lens band exactly. Week-index
selftest still passes in real Chrome: **9/9**. No page errors on load.

## The one that needs a decision at the gate

**Two-week detents are anchored to week 0, so only even pairs dock** —
weeks 0+1, 2+3, 4+5. You cannot dock weeks 1+2. That follows the spec's
"snaps in two-week detents … the nearest week *pair* docks", read as a fixed
partition rather than a one-week snap, and it makes first load (this week +
next) fall out for free. But it does mean a specific fortnight you want to
compare may be split across two detents.

If it feels wrong, `DETENT_WEEKS = 1` in `scroll.ts` is the whole change —
every week then becomes dockable and the lens still shows two rows. **Try
both during the gate before deciding.**

## Tuned by feel — all constants live at the top of `scroll.ts`

| Constant | Value | Why |
|---|---|---|
| `LENS_FRACTION` | 0.35 | Spec. Proportional; verified 0.350 at three viewports. |
| `COMPRESSED_H` | 20px | Middle of the spec's 16-24px. Lower shows more months but crushes bars. |
| `DETENT_WEEKS` | 2 | See above. |
| `PROJECT_MS` | 260 | How far momentum is projected before quantizing. Higher = flicks travel further. |
| `SETTLE_BASE_MS` / `SETTLE_PER_WEEK_MS` / `SETTLE_MAX_MS` | 270 / 85 / 720 | Settle duration scales with distance, capped so long jumps stay responsive. |
| `WHEEL_GAIN` | 0.55 | Trackpads over-deliver; unscaled wheel travel felt twitchy. |
| `WHEEL_IDLE_MS` | 130 | Quiet period before a wheel gesture settles to a detent. |
| `BUFFER_ROWS` | 3 | Rows rendered past each viewport edge. |
| `TAP_SLOP_PX` | 6 | Under this on release is a tap, not a drag. |

Easing: `easeOutCubic` for the settle — decelerates to zero, so momentum
never hard-stops. The lift curve is `smoothstep`, flat at 1 across the two
docked rows and easing to 0 exactly one week beyond either lens edge, so
lift/height/opacity are all continuous functions of scroll position.
Velocity is smoothed 0.7/0.3 so one jittery pointer sample cannot dominate a
fling. Drag conversion is one week per lens-row height — the user is
manipulating what is in the lens, not the compressed field.

## Decisions the spec left open

1. **Pool size follows the viewport; the spec's flat "~40 rows" does not
   work.** At 20px compressed rows a 1200px-tall window needs ~66 rows just
   to fill, so 40 would leave a desktop screen visibly empty — and the
   spec's own Definition of done names a 27" monitor. The count is derived
   from viewport height (50/53/68 measured above) and recomputed on resize.
   DOM stays bounded: the pool is fixed per viewport and recycled by
   `week mod capacity`, so exactly one node is rebuilt per row scrolled.

2. **`style.css` was added to the spec's file layout first, then created** —
   the procedure the recurring-edit log in conventions.md prescribes. Colour
   tokens stay in `index.html` (defined once); `style.css` is structure and
   motion only.

3. **`applyLens(node, t, height, y)`** — the stage 01 stub took `(node, t)`.
   Height and position are lens-derived too, and routing them through the
   same call keeps every DOM write in `render.ts` while `scroll.ts` owns the
   arithmetic. One call per row per frame.

4. **Timed events render twice, cross-faded.** The spec wants chips in the
   lens and "a thin bar segment on their day only" when compressed. Rather
   than toggling, the timed bar fades out and the chip fades in over the same
   interval. Timed bars are packed into lanes *below* the all-day block so
   chips have room and the all-day lanes never shift.

5. **`MAX_LANES` = 6**, with a `+N` marker in the day cell for overflow.
   The spec does not say what happens when a week is over-full.

6. **A straddling week takes the month of its Thursday** (ISO convention)
   for the sticky header — it matches what the row actually looks like.

7. **`prefs.lastDockedDay` is written but not read at launch.** The stage 03
   contract says first load docks the current week + next, so that wins.
   The pref is maintained and ready if you would rather restore the last
   position — a launch-behaviour question, flagged for the gate.

8. **Sign-in state is polled once a second in `main.ts`.** `auth.ts` exports
   no change event by design and stage 03 must not modify 02's modules. The
   button is the only dependent; a second of lag is invisible. The poll also
   retries the month fetch when sign-in flips true, so the calendar fills in
   after consent without a reload.

9. **A weekday-initial strip (M T W T F S S) was added to the header**,
   aligned to the same 7 columns. Not in the spec; without it the columns are
   ambiguous on first look. Remove it if it reads as chrome.

10. **New exports** (additive; 02's modules untouched): `render.createWeekNode`,
    `render.mountedWeeks`, `scroll.onWindowChange`, `scroll.onDayTap`.
    `onDayTap` is how stage 04 attaches the drawer without editing `scroll.ts`.

## Not done, deliberately

- No audio. The contract says the sound toggle is a pref stub only; `Prefs.soundEnabled`
  exists and nothing reads it.
- `onDayTap` currently logs to the console. Stage 04 replaces that.
- Safe-area/notch behaviour is wired (`--safe-top`, `viewport-fit=cover`) but
  only a real notched device proves it.

## Human gate checklist

1. Phone. Flick three months ahead. Watch for: 60fps, rows lifting into the
   lens and settling out, momentum ending docked, month header cross-fading,
   haptic tick on each dock.
2. **Try `DETENT_WEEKS = 1` as well as `2`** and record which you want.
3. Scroll a year into the past. Months should fill in as you approach. In
   devtools, confirm the `.week` node count stays flat while scrolling.
4. Confirm the seeded-looking 3-week bar behaviour with a real 3-week event.
5. Today button from a year away: it should return and dock, not teleport.
6. Desktop: trackpad and mouse wheel both settle to a detent.
7. Notched phone: lens still 35%, header clear of the notch.
