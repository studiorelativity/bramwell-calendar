// STAGE 01 — implemented in full. Shared vocabulary for stages 02-04.
//
// Date model (see conventions.md):
//   Storage  -> DayNumber, an absolute epoch-anchored civil-date integer.
//               Stable across midnight, sessions, and cache reloads.
//   Layout   -> WeekIndex + DayOffset, derived relative to today. NEVER
//               persisted. Conversion lives in state.ts only.
// Date objects appear only at the API boundary (gcal.ts) and the display
// boundary (render.ts / drawer.ts). Nothing else constructs one.

// ---------------------------------------------------------------------------
// Scalars
// ---------------------------------------------------------------------------

declare const brand: unique symbol;
type Brand<T, B> = T & { readonly [brand]: B };

/** Whole days since 1970-01-01, civil (no time zone, no DST). */
export type DayNumber = Brand<number, 'DayNumber'>;

/** Week row index. 0 = week containing today at session anchor; past is negative. */
export type WeekIndex = Brand<number, 'WeekIndex'>;

/** Column within a week row. 0 = Monday .. 5 = Saturday, 6 = Sunday. */
export type DayOffset = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Minutes from local midnight, 0..1439. */
export type MinuteOfDay = Brand<number, 'MinuteOfDay'>;

/** Calendar month cache key, `YYYY-MM`. */
export type MonthKey = Brand<string, 'MonthKey'>;

/** Civil date, `YYYY-MM-DD` — the all-day wire format. */
export type IsoDate = Brand<string, 'IsoDate'>;

/** RFC3339 instant with offset — the timed-event wire format. */
export type IsoDateTime = Brand<string, 'IsoDateTime'>;

/** A single cell in the grid. */
export interface WeekPosition {
  week: WeekIndex;
  day: DayOffset;
}

/** Inclusive-inclusive run of week rows. */
export interface WeekRange {
  first: WeekIndex;
  last: WeekIndex;
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

/** The four categories. Unknown/absent colorId on read resolves to 'other'. */
export type CategoryName = 'work' | 'personal' | 'financial' | 'other';

/** Google Calendar event colorId, as a string ("9", "10", "5", "8"). */
export type ColorId = Brand<string, 'ColorId'>;

export interface Category {
  name: CategoryName;
  /** Google Calendar colorId this category round-trips through. */
  colorId: ColorId;
  /** Swatch used by the UI; mirrors the CSS custom property. */
  hex: string;
  label: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

/**
 * When an event sits on the grid.
 * All-day `end` is INCLUSIVE here; gcal.ts converts to/from the API's
 * exclusive end date at the wire boundary.
 */
export type EventSpan =
  | { kind: 'allDay'; start: DayNumber; end: DayNumber }
  | {
      kind: 'timed';
      start: DayNumber;
      end: DayNumber;
      startMinute: MinuteOfDay;
      endMinute: MinuteOfDay;
    };

/** Which side of a recurring event a write targets. */
export type RecurrenceScope = 'instance' | 'series';

/** In-flight optimistic write; cleared on reconcile, rolled back on failure. */
export type PendingWrite = 'create' | 'update' | 'delete';

/** An event as the rest of the app sees it. Normalized; no wire fields. */
export interface CalendarEvent {
  /** Instance id — targets this occurrence. */
  id: string;
  /** Present on recurring instances; targets the whole series. */
  recurringEventId?: string;
  title: string;
  notes?: string;
  category: CategoryName;
  span: EventSpan;
  /** RRULE strings, series-defining events only. */
  recurrence?: string[];
  /** Set while an optimistic write is outstanding. */
  pending?: PendingWrite;
}

/** What the day-drawer form produces; what gcal.ts turns into a wire payload. */
export interface EventDraft {
  title: string;
  notes?: string;
  category: CategoryName;
  span: EventSpan;
  recurrence?: string[];
}

// ---------------------------------------------------------------------------
// Cache + prefs (localStorage)
// ---------------------------------------------------------------------------

/** One month of events, as fetched. Months are the unit of fetch and cache. */
export interface MonthCacheEntry {
  key: MonthKey;
  events: CalendarEvent[];
  /** Epoch ms of the fetch that produced `events`; drives background refresh. */
  fetchedAt: number;
}

/** Bump `version` to invalidate every cached month after a shape change. */
export interface EventCache {
  version: number;
  months: Record<MonthKey, MonthCacheEntry>;
}

/** Whether a month is absent, being fetched, or resident. */
export type MonthLoadState = 'absent' | 'loading' | 'ready' | 'error';

export interface Prefs {
  /**
   * Where to dock on launch. Stored as an absolute day, not a WeekIndex:
   * WeekIndex is anchored to the session's today and would drift overnight.
   */
  lastDockedDay: DayNumber;
  soundEnabled: boolean;
}
