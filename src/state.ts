// STAGE 02 — event cache, week-index math, localStorage persistence.
// Owns the DayNumber <-> WeekIndex conversion every other module depends on.
// Makes no network calls; asks gcal.ts for months it lacks.

import type {
  CalendarEvent,
  DayNumber,
  DayOffset,
  MonthKey,
  MonthLoadState,
  Prefs,
  WeekIndex,
  WeekPosition,
  WeekRange,
} from './types.ts';

const TODO = 'STAGE 02: not implemented';

// -- week-index math ---------------------------------------------------------

/** Fix week 0 to the week containing today. Called once, at launch. */
export function anchorToToday(): void {
  throw new Error(TODO);
}

export function today(): DayNumber {
  throw new Error(TODO);
}

export function weekOf(_day: DayNumber): WeekIndex {
  throw new Error(TODO);
}

export function positionOf(_day: DayNumber): WeekPosition {
  throw new Error(TODO);
}

export function dayAt(_week: WeekIndex, _offset: DayOffset): DayNumber {
  throw new Error(TODO);
}

export function monthOf(_day: DayNumber): MonthKey {
  throw new Error(TODO);
}

// -- cache -------------------------------------------------------------------

/** Events overlapping a week row, cache-only. Never fetches; never blocks. */
export function eventsForWeek(_week: WeekIndex): CalendarEvent[] {
  throw new Error(TODO);
}

/** Fetch any month in range that is absent; background-refresh stale ones. */
export function ensureMonthsFor(_range: WeekRange): void {
  throw new Error(TODO);
}

export function monthState(_month: MonthKey): MonthLoadState {
  throw new Error(TODO);
}

/** Apply a write locally as pending; returns a rollback for failure. */
export function applyOptimistic(_event: CalendarEvent): () => void {
  throw new Error(TODO);
}

// -- prefs -------------------------------------------------------------------

export function prefs(): Prefs {
  throw new Error(TODO);
}

export function savePrefs(_next: Partial<Prefs>): void {
  throw new Error(TODO);
}
