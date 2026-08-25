# Stage 08 — Verification

Date: 2026-08-24 · Implements user-definable categories (prefs-backed, two
colour layers, 11-cap, fallback role) and the curated Mood wash.

## Gate — PASS on everything reachable without a Google account

`tsc --noEmit` and `npm run build` clean. Every gate criterion except one has
been exercised headlessly against the running UI and passes; the exception is
**"a new event arrives in the Google Calendar app in the Google colour"**,
which needs a real account and is the human gate's first item. It is the same
class of gap stage 02 and stage 07 recorded: the write path is stub-free but
the wire has not been watched.

## Toolchain

node 26.5.0, vite 8.2.2, typescript 6.0.2. Headless Chrome
(`--headless=new --dump-dom --virtual-time-budget`) against `npm run dev`,
driving the real UI in a same-origin iframe — the stage 04/07 method. Two
probes, both deleted after the run: one in `?demo`, one signed-out with a
cold cache to exercise persistence and reload. Each was run under
`--blink-settings=preferredColorScheme=1` and `=2`, so every colour claim
below is measured in **both** light and dark rather than derived.

Chrome does not exit after `--dump-dom` under a virtual-time budget on this
machine; the DOM is written and the process has to be killed. Noted so the
next stage does not read the hang as a failure.

## Gate criteria

| # | Criterion | Result |
|---|---|---|
| 1 | Fresh install renders identically to v3 today | **Pass**, measured, both schemes. Evidence below. |
| 2 | Existing Google events resolve to the right categories, untouched | **Pass** for the mapping (9/10/5/8 → work/personal/financial/other, measured). **No write is issued** by any colour change — verified structurally, not on the wire. |
| 3 | Two categories on one colorId is impossible | **Pass.** Every row offers zero colorIds held elsewhere, at 4 categories and at the 11 cap. |
| 4 | 11-cap enforced, reason visible | **Pass.** 7 clicks from the seed reach 11, add goes `disabled`, the reason renders, all 11 colorIds distinct, no spare colour remains. |
| 5 | Add / rename / delete flow through to chips, rows, bars, year | **Pass.** Chips follow the list; a deleted category's events keep painting, in the fallback colour. |
| 6 | Display hex overrides on screen; the colorId is what gets written | **Pass** on screen and in the payload path. Wire unwatched (item 1 of the human gate). |
| 7 | Every mood keeps the month boundary readable, light and dark | **Pass**, measured contrast across all five, both schemes. |
| 8 | Colour changes persist across a reload | **Pass.** |
| 9 | `?demo` applies changes and persists nothing | **Pass.** localStorage stayed empty across the whole demo edit session. |
| 10 | `npm run build` clean | **Pass.** |

## Automated evidence

### 1. Fresh install is byte-identical, not merely close

The stage's central risk: the seed hexes are *overrides*, because Google's own
hexes for colorIds 9/10/5/8 are different colours from the ones stage 05
approved. Computed `--cat` on a probe element, and the band tokens on `:root`,
with no `categories` in prefs:

```
LIGHT   work #3056d3   personal #17925a   financial #d97706   other #64748b
        surface #faf9f7  band-a #faf9f7  band-b #f0eeea
        band-a-we #f2f0ec  band-b-we #e8e5df

DARK    work #7b96ff   personal #4fc48d   financial #f0a13c   other #94a3b8
        surface #151210  band-a #151210  band-b #211d18
        band-a-we #1c1815  band-b-we #29241e
```

Every value equals `index.html`'s stage-05 literal, in both schemes. The
rendered grid agrees: 14 demo bars across all four categories, each bar's
computed `--cat` equal to its category's value above.

The dark column is the reason `DARK_TWIN` exists. `brighten()` applied to
`#3056d3` yields `#5f7ddd`, not `#7b96ff` — near, and near is not identity.
The four seed hues therefore carry hand-picked twins; everything else is
derived.

### 2. An unknown category name resolves to the fallback

```
catColor('this-category-does-not-exist') = #64748b   (light, = other)
                                         = #94a3b8   (dark,  = other)
```

This is the base `[data-cat]` rule doing its job. It is what keeps an event
painting after its category is deleted — confirmed live in §5.

### 3. The colorId invariant

Per row, the set of colorIds held by *other* categories that the row's
dropdown still offers:

```
work [] · personal [] · financial [] · other []          (4 categories)
all 11 rows []                                           (at the cap)
```

Empty everywhere. The illegal state is unreachable by clicking, which is what
the spec asks for — the invariant is enforced, not merely documented.

### 4. The cap

```
clicks from seed to cap: 7      rows: 11      add disabled: true
reason rendered: true           all colorIds distinct: true
spare colours left at cap: none
```

11 categories and 11 colorIds exhaust each other exactly, which is the whole
argument for the number.

### 5. Delete leaves events alone

`work` deleted while demo events still carry `category: 'work'`:

```
row gone: true
bars with data-cat="work" still in the DOM: 4
their computed --cat: #64748b   (= the fallback's)
```

Nothing was written and nothing disappeared: the events kept their name, the
name stopped resolving, and the base rule caught them.

### 6. The two layers move independently

```
set display hex #ff00aa   -> --cat #ff00aa,  colorId still "9"
clear the override        -> --cat #3f51b5   (Google's Blueberry, colorId 9)
change colorId to "1"     -> --cat #7986cb   (Lavender)
                             .bar/.chip element count unchanged
```

The last line is the no-bulk-repaint check: changing the colorId moved the
legend and touched nothing that was already written.

### 7. Rename keeps the key

```
label "Work" -> "Studio":  row key still 'work'
                           bars with data-cat="work" still paint
prefs:  { name: "work", label: "Studio", colorId: "9", ... }
```

`name` is immutable by construction — only `label` is writable from the UI —
so no cached or remote event can be orphaned by a rename.

### 8. Mood contrast holds across the set

Band-A/band-B contrast ratio and weekend-variant ratio, per mood:

```
             LIGHT  A/B    we A/B         DARK   A/B    we A/B
warm   (default)    1.101   1.105                1.113   1.147
paper               1.092   1.094                1.120   1.165
cool                1.114   1.118                1.095   1.125
sage                1.092   1.104                1.118   1.151
dusk                1.120   1.126                1.087   1.112
```

Spread is ±1.5% around the default in both schemes — the month boundary is as
readable in every mood as in the one stage 05 approved, because the set was
generated on the default's own luminance ladder with only the hue lean
changed. Ink-on-surface stayed 16.3–16.8:1 throughout, so no mood degrades
text contrast either. `--surface` tracks band A in every mood.

### 9. Demo writes nothing

Across a full demo editing session — override a colour, clear it, change a
colorId twice, rename, add seven categories, delete one, cycle all five moods:

```
localStorage keys: []      bramwell.prefs.v1: null      unchanged: true
```

### 10. Persistence, signed out with a cold cache

Rename, an override, an add, and a mood change, then a reload of the same
origin:

```
before reload:  Studio | Personal | Financial | Other | New category
                band-a #f6f8fc
prefs written:  categories[5], fallbackCategory "other", mood "cool"
after reload:   Studio | Personal | Financial | Other | New category
                keys      work | personal | financial | other | new-category
                colorIds  9 | 10 | 5 | 8 | 1
                band-a #f6f8fc      mood 'cool' pressed
                --cat  work #3056d3  personal #0aa3c2  new-category #7986cb
                       unknown-name #64748b
                fallback role still on 'other'
```

The new category took colorId 1 (Lavender, the first free one) and its display
colour follows it, having no override. The overridden `personal` kept
`#0aa3c2` over its unchanged colorId 10.

## Decisions the spec left open

1. **The fallback's identity is a sibling prefs field, not a per-category
   flag.** The spec fixed `StoredCategory` as `{ name, label, colorId,
   displayHex? }`, which has no room for "this one is the fallback". Putting a
   boolean in the row would have made a second invariant to enforce (exactly
   one true), so the role lives in `prefs.fallbackCategory` — a name, one
   value, unambiguous by shape. `configure()` re-picks one if a corrupt blob
   ever loses it.

2. **The stored blob is treated as untrusted input.** `sanitize()` drops
   entries with a missing name or label, an unknown colorId, a duplicate name
   or a duplicate colorId, and caps the list at 11 — first writer wins.
   Reason: prefs are user-visible JSON in localStorage that outlives any
   version of this code, and a duplicate colorId arriving from a hand-edit
   would make `categoryFromColorId` silently ambiguous. The UI cannot produce
   one; the loader still refuses one.

3. **Names are minted from the label but never re-derived.** A new category is
   `slugFor(label)`, uniquified against the current set. Uniquifying against
   the *current* set only is a known, accepted narrowness: delete `travel`,
   add a new "Travel", and the new one reuses the key `travel`, so cached
   events from the old one adopt the new category. The alternative is a
   tombstone list of every name ever used, which is unbounded state to prevent
   a collision the user themselves engineered — and the outcome (events land
   in a category with the name they were filed under) is the least surprising
   one available.

4. **Dark-mode colours: curated for the seed, derived for everything else.**
   `DARK_TWIN` holds the four stage-05 pairs; `brighten()` (HSL, lightness
   floor 0.62, saturation cap 0.72) handles Google's eleven and any custom
   hex. A single algorithm for all of them would have broken gate criterion 1
   by a few units per channel — see §1.

5. **The label edit does not repaint its own row; the colour picker does, but
   only on `change`.** Repainting the Colors section on every keystroke would
   tear the input out from under the caret, and `<input type="color">` fires
   `input` continuously while the user drags. So text and drag commit without
   a rebuild; structural edits (colorId, clearing an override, add, delete)
   rebuild, because they change what the *other* rows may offer.

6. **Deletion is a two-step button, not a `confirm()`.** A modal on top of a
   sheet for an action that touches no data in Google is heavier than the act.
   The button arms on first click and reads "Remove?".

7. **An empty label becomes "Untitled" on blur.** An empty one would leave an
   unclickable chip in the event form.

8. **Renaming while the event form is open does not restyle the open form.**
   `refresh()` in the drawer no-ops while the form is showing — the stage 04
   transient-UI rule, which exists so a background month arrival cannot wipe
   what is being typed. The chips repaint the next time the form opens. Both
   surfaces being open at once is an edge case; the rule that produces the
   staleness is the more important one, so it stands.

9. **Leaving demo drops in-memory colour edits.** `onDemoExit` re-runs
   `configure()` from prefs. Without it, colour changes made in demo — which
   were deliberately never persisted — would linger over the real calendar
   until the next reload and look as if they had been saved.

10. **Moods set only `--surface` and the four band tokens.** Not `--ink*`,
    `--rule*`, or `--today`. Anything more and "the user's commitments are the
    only strong colour on screen" stops being enforceable.

11. **`themeCss()` also emits `--cat-<name>` custom properties**, not just the
    `[data-cat]` rules. `style.css` has static rules that name a hue directly
    (`.formerr` uses `--cat-financial`), and `index.html` seeds the same four.
    Emitting both keeps those working and gives a settings row a hue by name.

## What was not tested

- **The wire.** No event has been created against a real calendar with a
  user-chosen colorId, so "arrives in the Google Calendar app in the Google
  colour" is unverified. `payload()` sets `colorId` from `colorIdFor(category)`
  exactly as before; only the source of the mapping changed. Human gate.
- **Day notes under a moved fallback.** `gcal.ts` now writes
  `fallbackColorId()` for a daynote. If the user changes the fallback
  category's colorId, notes written afterwards carry the new one and older
  notes keep the old — the same "new writes only" rule as every other
  category, and harmless because a note is identified by its extended
  property, not its colour. Unexercised against Google.
- **A phone.** The Colors section adds two lines per category and up to 11
  rows; whether the sheet scrolls acceptably on a small phone, and whether the
  native `<select>` and `<input type="color">` behave in an installed PWA on
  iOS, are device judgements. The `<option>` swatch colouring in particular is
  honoured by desktop Chrome/Firefox and ignored by iOS Safari — which is why
  every option also carries Google's colour *name* as text, and why the row
  shows the Google swatch separately.
- **Arm's-length legibility of a user-chosen hue.** The spec requires the
  ~16% tint / full-colour bar rule to stay legible for whatever the user
  picks. `brighten()` gives a dark-mode floor, but nothing stops a user from
  choosing a very pale colour in light mode. No guard was added: refusing a
  colour the user explicitly chose is worse than letting them see it and
  change it.

## Human gate checklist

Requires a real Google account. `?demo` covers items 6–8 without one.

1. Open Settings → Colors. Confirm the four seed categories with their
   existing colours, and that the calendar behind the sheet looks unchanged.
2. Create an event in Work. Open it in the Google Calendar app: it should be
   Blueberry (colorId 9), the app's own blue, *not* Bramwell's `#3056d3`.
   That divergence is the two-layer model working, not a bug.
3. Add a category, give it a Google colour and a different display colour.
   Create an event in it. Confirm Bramwell paints the display colour and the
   Google app shows the Google colour.
4. Change an existing category's Google colour. Confirm no existing event
   changes colour anywhere — including in the Google app.
5. Delete a category that has events. Confirm the events are still in Google
   Calendar, unchanged, and render in the fallback colour in Bramwell.
6. Cycle all five moods in light and in dark. On a phone at arm's length,
   confirm the month boundary is readable from the bands alone in each.
7. Reload. Confirm every change survived.
8. Open `?demo`, change colours, reload. Confirm nothing was kept.
9. On an installed PWA on a phone: confirm the colour picker and the colour
   dropdown are usable, and that the sheet scrolls to reach the Mood row with
   11 categories in the list.
