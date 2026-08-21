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
goes here (edit-source principle). Empty until it isn't.
