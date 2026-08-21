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
  keep the import graph acyclic.
