// STAGE 02 — Google Calendar v3 API module.
// The ONLY file making network calls. Owns every Date <-> wire conversion,
// including the all-day inclusive/exclusive end-date fix.

import type { CalendarEvent, EventDraft, MonthKey, RecurrenceScope } from './types.ts';

const TODO = 'STAGE 02: not implemented';

/** List one month, singleEvents + orderBy=startTime, paged to exhaustion. */
export function listMonth(_month: MonthKey): Promise<CalendarEvent[]> {
  throw new Error(TODO);
}

export function createEvent(_draft: EventDraft): Promise<CalendarEvent> {
  throw new Error(TODO);
}

/** PATCH changed fields only; `scope` picks instance id vs recurringEventId. */
export function updateEvent(
  _event: CalendarEvent,
  _changes: Partial<EventDraft>,
  _scope: RecurrenceScope,
): Promise<CalendarEvent> {
  throw new Error(TODO);
}

export function deleteEvent(_event: CalendarEvent, _scope: RecurrenceScope): Promise<void> {
  throw new Error(TODO);
}
