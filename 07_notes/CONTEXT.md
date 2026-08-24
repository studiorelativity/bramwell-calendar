# Stage 07 — Day Notes

**Status: APPROVED 2026-08-23.** Spec gained the "Day notes" section and
its Definition-of-done item before this stage (fix-upstream rule). This
stage is designed to run in Claude Code from this contract alone.

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — sections **"Day notes"** (new),
  **"Calendar API (src/gcal.ts)"**, the drawer portion of **"Layout
  details"**, **"Demo mode"** (seed requirement only)
- L3: `../_references/conventions.md`
- L4: `src/types.ts`, `src/gcal.ts`, `src/state.ts`, `src/drawer.ts`,
  `src/render.ts` as built through 06 — consume real interfaces

## Process
1. `types.ts`: `CalendarEvent` gains optional `isDayNote?: true`, and
   `EventDraft` gains the same optional flag. No new top-level type — a
   note IS an event. On READ the flag is set at the wire boundary only;
   on WRITE the draft flag is how state.ts tells gcal.ts "note", which is
   what keeps the extended-property string inside gcal.ts.
   *(Corrected 2026-08-24 during stage 07: the original step named only
   `CalendarEvent`, which left the write path unable to express a note.
   See output/verification.md, decision 1.)*
2. `gcal.ts` (the only file that knows the wire format): on read, map
   `extendedProperties.private.bramwell === 'daynote'` to `isDayNote`;
   on create/patch of a daynote, emit the extended property, derive
   `summary` from the text's first line (≤60 chars), put full text in
   `description`, colorId from the `other` mapping.
3. `state.ts`: `noteForDay(day): CalendarEvent | undefined` (cache-only,
   like `eventsOnDay`); `saveNote(day, text): Promise<void>` implementing
   the upsert — create when absent, patch when present, delete when text
   is empty — through the existing optimistic write paths. Demo guard is
   inherited automatically (writes already reject in demo). Demo seed
   gains two day notes near today.
4. `render.ts`: exclude `isDayNote` events from bars, chips, lane
   packing, and the "+N" count. Add the cell marker (bottom-right,
   neutral, small) when `noteForDay` hits.
5. `year.ts`: exclude daynotes from the per-cell bars and the hover
   panel's event list (the panel may show a small note indicator on the
   date line instead — implementer's call, record it).
6. `drawer.ts`: Notes panel above the events list — rendered note text,
   tap to edit (textarea + Save/Cancel), delete via saving empty. Wire
   through `state.saveNote` only.

## Constraints
- Module boundaries absolute: only `gcal.ts` knows the extended-property
  string; only `state.ts` knows upsert semantics; the drawer knows
  neither — it calls `saveNote`.
- The transient-UI rule: `refresh()` in the drawer already no-ops while
  the form is showing; the notes editor needs the same protection. A
  month landing while note text is being typed must not wipe it.
- Do not renumber lanes or change event sorting for non-note events —
  headless output for a seeded week must be identical to pre-stage
  except for the marker.
- No new files; no scope changes; `auth.ts` untouched.
- Existing calendars may contain a stray second daynote on a day (e.g.
  created by hand). Read path: prefer the earliest by id, ignore extras;
  never delete data the app did not just write.

## Outputs
- Updated `types.ts`, `gcal.ts`, `state.ts`, `render.ts`, `year.ts`,
  `drawer.ts`, and `style.css` — the cell marker and the Notes panel are
  new UI and cannot exist without it. *(Added 2026-08-24: the original
  list omitted `style.css`. No new files, per the constraint below.)*
- `output/verification.md` — gate criteria checked, decisions recorded,
  including headless before/after evidence for the no-regression
  constraint if a headless browser is available

## Gate (human, real account + demo)
- Save a note on a day: marker appears; reload: still there; the event
  in the Google Calendar app shows the first line as title, full text as
  description, `other` color.
- Edit the note to empty: event deleted in Google Calendar; marker gone.
- A day with events AND a note: bars/chips unchanged, "+N" count
  excludes the note, drawer shows Notes panel above the list.
- Type a note, wait for a background refresh (or force one), text
  survives.
- Offline: note save fails visibly and rolls back.
- `?demo`: two seeded notes visible; editing rejects with the demo
  message.
