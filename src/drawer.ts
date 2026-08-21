// STAGE 04 — day drawer + event form. Ported from year-planner-v2.html
// (behaviour and form logic only — never its layout).

import type { CalendarEvent, DayNumber } from './types.ts';

const TODO = 'STAGE 04: not implemented';

/** Open the drawer on a day: its events, plus the add form. */
export function openDay(_day: DayNumber): void {
  throw new Error(TODO);
}

/** Open the edit form for one event; offers instance vs series. */
export function editEvent(_event: CalendarEvent): void {
  throw new Error(TODO);
}

export function closeDrawer(): void {
  throw new Error(TODO);
}

export function isOpen(): boolean {
  throw new Error(TODO);
}
