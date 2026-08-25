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

/**
 * A category's stable key. STAGE 08 widened this from the four-name union to
 * a plain string: the set is user-defined now, so this is a key, not an enum.
 * The seed's four keys ('work' | 'personal' | 'financial' | 'other') never
 * change — cached and remote events are addressed by them.
 */
export type CategoryName = string;

/** Google Calendar event colorId, as a string — "1".."11". */
export type ColorId = Brand<string, 'ColorId'>;

/**
 * STAGE 08 — one category exactly as it is stored in prefs. This shape IS the
 * persisted format; do not add fields to it without a spec change.
 */
export interface StoredCategory {
  /** Immutable key. Renaming edits `label`, never this. */
  name: CategoryName;
  label: string;
  /** Layer 1: what Google stores and the Google apps show. Unique across the set. */
  colorId: ColorId;
  /** Layer 2, optional: what Bramwell paints. Unset -> the colorId's own hex. */
  displayHex?: string;
}

/** A resolved category — stored fields plus the colour the UI should use. */
export interface Category extends StoredCategory {
  /** Resolved display colour: `displayHex` if set, else the colorId's hex. */
  hex: string;
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
  /**
   * STAGE 07 — this event is a day note, not a calendar event. Set by gcal.ts
   * from the extended property at the wire boundary; nothing else sets it on
   * read. A note never becomes a bar, a chip, or a lane.
   */
  isDayNote?: true;
}

/** What the day-drawer form produces; what gcal.ts turns into a wire payload. */
export interface EventDraft {
  title: string;
  notes?: string;
  category: CategoryName;
  span: EventSpan;
  recurrence?: string[];
  /**
   * STAGE 07 — write this as a day note. gcal.ts is the only reader: it emits
   * the extended property and derives `summary` from the text. Without this,
   * the write path has no way to say "note" and the extended-property string
   * would have to leak out of gcal.ts. See 07_notes/output/verification.md.
   */
  isDayNote?: true;
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
  /**
   * Snap granularity in days: every half-month anchor (15), every other one
   * (30 — the 1st of each month), or every third (45). Optional so that code
   * written before the selector existed still type-checks.
   */
  snapStepDays?: 15 | 30 | 45;
  /**
   * Which view opens on launch. Optional for the same reason as
   * snapStepDays: code written before Settings existed still type-checks.
   * (Stage 05.)
   */
  defaultView?: 'calendar' | 'year';
  /**
   * STAGE 08 — the user's category set. Absent means "the seed", which is
   * what makes a pre-stage install and a fresh one render identically.
   */
  categories?: StoredCategory[];
  /**
   * STAGE 08 — name of the category unknown/absent colorIds resolve to. It
   * cannot be deleted. Absent means 'other', the seed's fallback.
   */
  fallbackCategory?: CategoryName;
  /** STAGE 08 — surface/band tint id from the curated set. Absent means 'warm'. */
  mood?: string;
}
