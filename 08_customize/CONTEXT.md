# Stage 08 — Customization (categories, colours, mood)

**Status: APPROVED 2026-08-24.** The spec gained its "Customization
(stage 08)" section, a revised "Categories (src/categories.ts)" section, a
Settings extension, a file-layout note and seven Definition-of-done items
before this stage opened (fix-upstream rule). This stage is designed to run
in Claude Code from this contract alone.

## What this stage is

The four categories stop being constants in the source and become the
user's own list, stored in prefs. Each category carries **two colour
layers** — the Google colorId it round-trips through, and an optional
display hex Bramwell renders it in — and the calendar gains a curated
**Mood** that tints the surface and the month bands.

The whole stage is a data move plus a settings section. It adds no file, no
storage class, no network call and no new dependency, and it must leave a
fresh install pixel-identical to v3 before it.

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — sections **"Customization
  (stage 08)"** (new), **"Settings"**, **"Categories (src/categories.ts)"**,
  **"Visual direction"**, **"Demo mode"**
- L3: `../_references/conventions.md`
- L4: `src/categories.ts`, `src/types.ts`, `src/chrome.ts`, `src/main.ts`,
  `src/gcal.ts`, `src/drawer.ts`, `index.html`, `src/style.css` as built
  through 07 — consume real interfaces

## Process

1. **`types.ts`** — `CategoryName` widens from the four-name union to
   `string`; it is a key now, not an enum. `Category` gains `displayHex?`
   and its `hex` becomes the *resolved* display colour. Add
   `StoredCategory` (`{ name, label, colorId, displayHex? }`) — the exact
   prefs shape — and add `categories?`, `fallbackCategory?`, `mood?` to
   `Prefs`, all optional so pre-stage installs still type-check and so
   absence means "the seed".

2. **`categories.ts`** — becomes prefs-*backed*, not prefs-*importing*.
   It must not import `state.ts`: the graph is `state -> gcal ->
   categories`, and closing that loop would make it a cycle. The stored
   list is pushed in at boot. It owns, and is the only file that names:
   - `SEED` — the four categories with colorIds 9/10/5/8 and stage 05's
     display hexes, exactly.
   - `GOOGLE_COLORS` — all 11 event colorIds: id, Google's own name,
     Google's hex, and a brightened dark-mode twin.
   - `MOODS` — five curated surface/band token sets, light and dark.
   - `themeCss(): string` — a **pure string**, no DOM. One `[data-cat=…]`
     rule per category plus the mood tokens, light and dark, and a base
     `[data-cat]` rule carrying the fallback colour so an event whose
     category was deleted still paints.
   - Resolution: `categoryOf` falls back rather than returning undefined;
     `categoryFromColorId` resolves unknown/absent to the fallback;
     `fallbackColorId()` replaces `colorIdFor('other')` at the wire.
   - `MAX_CATEGORIES = 11`, and a `slugFor(label, taken)` name minter.

3. **`main.ts`** (wiring, per the file layout) — reads the stored list from
   prefs at boot, pushes it into `categories.ts`, and owns the single
   `<style>` element that `themeCss()` fills. Re-emits and repaints on the
   new `onColorsChange` callback from chrome.

4. **`chrome.ts`** — a **Colors** section in the existing sheet: one row per
   category (label input, colorId `<select>`, display swatch + clear,
   delete on every row but the fallback's), an add row disabled at 11, and
   the Mood selector. Persists through `savePrefs` — **except in demo**,
   where it applies in memory and writes nothing. The sheet is built once
   and lives outside every repaint path; only the Colors section rebuilds,
   and only from its own edits.

5. **`gcal.ts`** — day notes write `fallbackColorId()` instead of
   `colorIdFor('other')`. Nothing else changes; it stays the only network
   file and gains no knowledge of prefs.

6. **`drawer.ts`** — the form's category chips render the dynamic list (they
   already loop `allCategories()`, so this follows for free); the default
   chosen category is the list's first entry, not the literal `'work'`; the
   event row's meta line shows the category's **label**, not its raw name.

7. **`index.html`** — the `:root` category properties stay, relabelled as
   seed values only: what the page paints before the first script runs.

8. **`style.css`** — the four hard-coded `[data-cat='…']` rules are deleted;
   they are generated now. Add the Colors section's row styles.

## Constraints
- **Module boundaries absolute.** `gcal.ts` stays the only file making
  network calls and never learns about prefs. `categories.ts` owns the
  mapping and the colour tables, stays DOM-free, and imports nothing but
  types. `chrome.ts` owns the sheet. `main.ts` owns the wiring and the
  runtime `<style>` element.
- **No new files.** Everything lands in files the spec's layout already
  names (conventions.md, file-layout rule).
- **Pixel-identity.** A fresh install — no `categories` in prefs — must
  render identically to the pre-stage build. The seed's display hexes are
  what makes this true and they are not "close enough": use the exact
  values from `index.html`, light and dark.
- **The colorId invariant is enforced in the UI**, not merely documented: a
  colorId held by another category is `disabled` in every other row's
  dropdown, so the illegal state is unreachable by clicking.
- **The fallback cannot be deleted** and its row shows no delete control.
- **Names are immutable.** Renaming writes `label`. Nothing may rewrite a
  category `name` after creation — cached and remote events key on it.
- **No bulk repaint.** Changing a colorId must not PATCH a single existing
  event.
- **Demo writes nothing**: no localStorage, in customization as everywhere
  else.
- The transient-UI rule holds: a background refresh must not close or reset
  the sheet, or discard a half-typed label.

## Outputs
- Updated `types.ts`, `categories.ts`, `main.ts`, `chrome.ts`, `gcal.ts`,
  `drawer.ts`, `index.html`, `style.css`
- `output/verification.md` — gate criteria checked, results, and decisions
  the spec left open

## Gate
- **Fresh install renders identically to v3 today** — same four categories,
  same labels, same colours, same bands. Evidence, not assertion: compare
  computed colours before and after.
- **Existing Google events resolve to the right categories, untouched.**
  colorIds 9/10/5/8 still map to work/personal/financial/other; no write is
  issued by any colour change.
- **Two categories on one colorId is impossible** through the UI.
- **The 11-cap is enforced**: add is disabled at 11 and the reason is
  visible.
- Add / rename / delete a category: the form chips, drawer rows, bars,
  chips and year bars all follow the list; a deleted category's events
  render in the fallback colour and are not touched in Google.
- A display hex overrides on screen while the Google colorId is what gets
  written; both swatches are visible in the row.
- Every mood keeps the month-band boundary readable, light and dark.
- Colour changes persist across a reload; in `?demo` they apply and persist
  nothing.
- `npm run build` clean.
