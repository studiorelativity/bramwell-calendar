# Conventions

Last updated: 2026-08-20 (dates rule reworded after stage 01)

## TypeScript
- Strict mode on. No `any` without a `// why:` comment.
- Modules export their spec-defined public interface and nothing else.
- Dates: storage uses DayNumber (absolute, epoch-anchored). WeekIndex/DayOffset
  are layout-time derivations relative to today; never persisted. Conversion
  lives in state.ts only.
- Convert to/from Date objects only at API and display boundaries.

## Style
- Follow the spec's "Visual direction" section. When in doubt: less chrome.
- CSS custom properties for the four category colors, defined once.

## Recurring-edit log
When you fix the same kind of thing twice in stage output, the rule for it
goes here (edit-source principle).

- **The spec's file layout has no slot for a file a stage needs.** Hit twice:
  `style.css` (01) and a shared `dates.ts` (02). Do NOT quietly add the file,
  and do NOT contort the code to avoid it. Work within the layout, record the
  cost in `verification.md`, and when a later stage makes the file genuinely
  unavoidable, add it to the spec's file layout FIRST, then create it.
  Consequences so far: style tokens live in an `index.html` <style> block; two
  lines of civil-date math are duplicated across `gcal.ts` and `state.ts` to
  keep the import graph acyclic; stage 08's Google colour table and mood
  palette went into `categories.ts` (spec layout updated first) rather than a
  new `theme.ts`.

- **A leaf module needs data that lives in `state.ts`.** Hit twice: civil-date
  math (02) and the category set (08). The graph is `state -> gcal ->
  categories`, so a leaf that imports `state.ts` closes a cycle. Do NOT import
  it and do NOT duplicate the storage. Give the leaf a `configure(...)` entry
  point and let `main.ts` — whose whole job is wiring — read prefs and push
  the data in. Corollary: leaf modules stay DOM-free too. `categories.ts`
  returns `themeCss()` as a string; `main.ts` owns the `<style>` element.

- **A new CSS class name collided with an existing one.** Stage 08 added
  `.catpick` for the settings sheet's colour input; `drawer.ts` had used
  `catpick` for the event form's category-chip container since stage 04. The
  new rule stretched an invisible absolute box over the whole drawer panel and
  the event form became unclickable while still *looking* correct. Two rules,
  both from that one bug:

  1. **Before adding a class, grep the whole `src/` tree for the bare token,
     not just for a CSS rule with that name.** A class with no rule of its own
     is invisible to a `grep '\.name'` of `style.css` and is exactly the
     dangerous case — nothing warns you, and the new rule simply lands on it.
     `cat*` in this codebase means *category* and is heavily used; prefix new
     families distinctly.
  2. **UI verification must hit-test, not just dispatch.** Every stage so far
     drove the UI with `element.click()`, which bypasses hit-testing entirely
     and reports success on a control no user could reach. Any claim that a
     control "works" must be backed by `document.elementFromPoint()` at the
     control's centre resolving to the control itself. This bug passed every
     automated check in stage 08's gate and was caught only by a hit test.
