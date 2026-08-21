// STAGE 02 — event cache, week-index math, localStorage persistence.
// Owns the DayNumber <-> WeekIndex conversion every other module depends on
// (conventions.md). Makes no network calls of its own and touches no DOM;
// it asks gcal.ts for months it lacks.

import { listMonth } from './gcal.ts';
import type {
  CalendarEvent,
  DayNumber,
  DayOffset,
  EventCache,
  MonthCacheEntry,
  MonthKey,
  MonthLoadState,
  Prefs,
  WeekIndex,
  WeekPosition,
  WeekRange,
} from './types.ts';

const MS_PER_DAY = 86_400_000;
const CACHE_KEY = 'bramwell.cache.v1';
const PREFS_KEY = 'bramwell.prefs.v1';
const CACHE_VERSION = 1;
/** A resident month older than this is background-refreshed on next approach. */
const STALE_MS = 5 * 60_000;
/** Spec: fetch a month when any of its weeks is within ~8 weeks of the viewport. */
const PREFETCH_WEEKS = 8;

// ---------------------------------------------------------------------------
// Civil-date math
// ---------------------------------------------------------------------------
// Date.UTC is used purely as civil arithmetic: no zone, no DST, so a day is
// always exactly one step regardless of local clock changes. gcal.ts carries
// the matching pair at the wire boundary.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function dayFromCivil(year: number, month: number, day: number): DayNumber {
  return (Date.UTC(year, month - 1, day) / MS_PER_DAY) as DayNumber;
}

export function civilFromDay(day: DayNumber): { year: number; month: number; day: number } {
  const dt = new Date(day * MS_PER_DAY);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

/** 0 = Monday .. 6 = Sunday. 1970-01-01 was a Thursday, hence the +3. */
function mondayOffset(day: DayNumber): DayOffset {
  return ((((day + 3) % 7) + 7) % 7) as DayOffset;
}

function weekStartOf(day: DayNumber): DayNumber {
  return (day - mondayOffset(day)) as DayNumber;
}

// ---------------------------------------------------------------------------
// Module state
// ---------------------------------------------------------------------------

let anchored = false;
/** DayNumber of the Monday of week 0. */
let anchorWeekStart = 0 as DayNumber;
let anchorToday = 0 as DayNumber;

let cache: EventCache = { version: CACHE_VERSION, months: {} };
const loadState: Record<string, MonthLoadState> = {};
const listeners: Array<(months: readonly MonthKey[]) => void> = [];
let cachedPrefs: Prefs | null = null;

function ensureAnchored(): void {
  if (!anchored) anchorToToday();
}

function notify(months: readonly MonthKey[]): void {
  for (const fn of listeners) fn(months);
}

/** Repaint hook for render.ts: fires when cached months change. */
export function onCacheChange(fn: (months: readonly MonthKey[]) => void): void {
  listeners.push(fn);
}

// ---------------------------------------------------------------------------
// Week-index math
// ---------------------------------------------------------------------------

/**
 * Fix week 0 to the week containing today, and load cache + prefs. Called once
 * at launch. Today is captured here rather than read live: re-anchoring
 * mid-session would shift every WeekIndex under the scroller.
 */
export function anchorToToday(): void {
  const now = new Date();
  anchorToday = dayFromCivil(now.getFullYear(), now.getMonth() + 1, now.getDate());
  anchorWeekStart = weekStartOf(anchorToday);
  anchored = true;
  loadCache();
}

export function today(): DayNumber {
  ensureAnchored();
  return anchorToday;
}

export function weekOf(day: DayNumber): WeekIndex {
  ensureAnchored();
  return ((weekStartOf(day) - anchorWeekStart) / 7) as WeekIndex;
}

export function positionOf(day: DayNumber): WeekPosition {
  return { week: weekOf(day), day: mondayOffset(day) };
}

export function dayAt(week: WeekIndex, offset: DayOffset): DayNumber {
  ensureAnchored();
  return (anchorWeekStart + week * 7 + offset) as DayNumber;
}

export function monthOf(day: DayNumber): MonthKey {
  const c = civilFromDay(day);
  return `${c.year}-${pad2(c.month)}` as MonthKey;
}

function monthKeysBetween(first: DayNumber, last: DayNumber): MonthKey[] {
  const a = civilFromDay(first);
  const b = civilFromDay(last);
  const keys: MonthKey[] = [];
  let year = a.year;
  let month = a.month;
  while (year < b.year || (year === b.year && month <= b.month)) {
    keys.push(`${year}-${pad2(month)}` as MonthKey);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

function loadCache(): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as EventCache;
    if (parsed.version === CACHE_VERSION && parsed.months) {
      cache = parsed;
      for (const key of Object.keys(cache.months)) loadState[key] = 'ready';
    }
  } catch {
    cache = { version: CACHE_VERSION, months: {} };
  }
}

function persist(): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // Quota or private mode: the cache is an optimization, never the source of
    // truth. Keep running from memory.
  }
}

async function fetchMonth(key: MonthKey): Promise<void> {
  loadState[key] = 'loading';
  notify([key]);
  try {
    const events = await listMonth(key);
    const entry: MonthCacheEntry = { key, events, fetchedAt: Date.now() };
    cache.months[key] = entry;
    loadState[key] = 'ready';
    persist();
  } catch {
    loadState[key] = cache.months[key] ? 'ready' : 'error';
  }
  notify([key]);
}

/** Events overlapping a week row, cache-only. Never fetches; never blocks. */
export function eventsForWeek(week: WeekIndex): CalendarEvent[] {
  const first = dayAt(week, 0);
  const last = dayAt(week, 6);
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const key of monthKeysBetween(first, last)) {
    for (const event of cache.months[key]?.events ?? []) {
      if (event.span.end < first || event.span.start > last) continue;
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      out.push(event);
    }
  }
  return out;
}

/** Fetch any month in range that is absent; background-refresh stale ones. */
export function ensureMonthsFor(range: WeekRange): void {
  ensureAnchored();
  const first = dayAt((range.first - PREFETCH_WEEKS) as WeekIndex, 0);
  const last = dayAt((range.last + PREFETCH_WEEKS) as WeekIndex, 6);
  for (const key of monthKeysBetween(first, last)) {
    if (loadState[key] === 'loading') continue;
    const entry = cache.months[key];
    if (!entry || Date.now() - entry.fetchedAt > STALE_MS) void fetchMonth(key);
  }
}

export function monthState(month: MonthKey): MonthLoadState {
  return loadState[month] ?? (cache.months[month] ? 'ready' : 'absent');
}

/**
 * Apply a write locally as pending; returns a rollback for failure.
 * A pending 'delete' removes the event; anything else inserts or replaces it.
 */
export function applyOptimistic(event: CalendarEvent): () => void {
  ensureAnchored();
  const keys = monthKeysBetween(event.span.start, event.span.end);
  const snapshot = keys.map((key) => ({
    key,
    events: cache.months[key]?.events.slice() ?? null,
  }));

  for (const key of keys) {
    const entry = cache.months[key];
    if (!entry) continue;
    const rest = entry.events.filter((e) => e.id !== event.id);
    if (event.pending !== 'delete') rest.push(event);
    entry.events = rest;
  }
  persist();
  notify(keys);

  return () => {
    for (const snap of snapshot) {
      const entry = cache.months[snap.key];
      if (entry && snap.events) entry.events = snap.events;
    }
    persist();
    notify(keys);
  };
}

// ---------------------------------------------------------------------------
// Prefs
// ---------------------------------------------------------------------------

export function prefs(): Prefs {
  if (cachedPrefs) return cachedPrefs;
  const fallback: Prefs = { lastDockedDay: today(), soundEnabled: true };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    cachedPrefs = raw ? { ...fallback, ...(JSON.parse(raw) as Partial<Prefs>) } : fallback;
  } catch {
    cachedPrefs = fallback;
  }
  return cachedPrefs;
}

export function savePrefs(next: Partial<Prefs>): void {
  cachedPrefs = { ...prefs(), ...next };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(cachedPrefs));
  } catch {
    // Non-fatal; prefs are a convenience.
  }
}

// ---------------------------------------------------------------------------
// Selftest — week-index math. Run via ?selftest (wired in main.ts).
// Off-by-one here corrupts everything downstream, so this is assertion-heavy.
// ---------------------------------------------------------------------------

export interface SelfTestResult {
  name: string;
  ok: boolean;
  detail: string;
}

export function selfTest(): SelfTestResult[] {
  const results: SelfTestResult[] = [];
  const check = (name: string, ok: boolean, detail = ''): void => {
    results.push({ name, ok, detail });
  };

  ensureAnchored();

  // 1. Civil round-trip, including a leap day.
  const samples: Array<[number, number, number]> = [
    [1970, 1, 1], [2026, 8, 20], [2026, 12, 31], [2027, 1, 1],
    [2028, 2, 29], [2027, 3, 14], [2027, 11, 7], [1999, 12, 31],
  ];
  let roundTripBad = '';
  for (const [y, m, d] of samples) {
    const c = civilFromDay(dayFromCivil(y, m, d));
    if (c.year !== y || c.month !== m || c.day !== d) {
      roundTripBad = `${y}-${m}-${d} -> ${c.year}-${c.month}-${c.day}`;
      break;
    }
  }
  check('civil round-trip', roundTripBad === '', roundTripBad || `${samples.length} dates`);

  // 2. Epoch anchoring against known values.
  check(
    'epoch anchoring',
    dayFromCivil(1970, 1, 1) === 0 && dayFromCivil(2026, 12, 28) === 20815,
    `1970-01-01=${dayFromCivil(1970, 1, 1)}, 2026-12-28=${dayFromCivil(2026, 12, 28)} (expect 0, 20815)`,
  );

  // 3. Weekday, cross-checked against the platform's own calendar.
  let weekdayBad = '';
  for (let d = -400; d <= 400; d += 1) {
    const day = (dayFromCivil(2027, 1, 1) + d) as DayNumber;
    const oracle = ((new Date(day * MS_PER_DAY).getUTCDay() + 6) % 7) as DayOffset;
    if (mondayOffset(day) !== oracle) {
      weekdayBad = `day ${day}: ${mondayOffset(day)} != ${oracle}`;
      break;
    }
  }
  check('weekday vs platform oracle', weekdayBad === '', weekdayBad || '801 days');

  // 4. Monday-start: 2026-12-28 is a Monday, 2027-01-03 the Sunday that ends it.
  const mon = dayFromCivil(2026, 12, 28);
  const sun = dayFromCivil(2027, 1, 3);
  check(
    'Monday starts the week',
    mondayOffset(mon) === 0 && mondayOffset(sun) === 6,
    `offsets ${mondayOffset(mon)}, ${mondayOffset(sun)} (expect 0, 6)`,
  );

  // 5. Year boundary: that week is one row; the next Monday starts the next.
  const wMon = weekOf(mon);
  const sameWeek = weekOf(dayFromCivil(2026, 12, 31)) === wMon && weekOf(sun) === wMon;
  const nextWeek = weekOf(dayFromCivil(2027, 1, 4)) === wMon + 1;
  check(
    'year boundary holds one week row',
    sameWeek && nextWeek,
    `2026-12-28..2027-01-03 = ${wMon}, 2027-01-04 = ${weekOf(dayFromCivil(2027, 1, 4))}`,
  );

  // 6. DST: walk two years of LOCAL calendar days and require every step to be
  //    exactly one DayNumber. This is the test that catches millisecond math on
  //    local Dates, where a transition day is 23 or 25 hours long.
  let dstBad = '';
  let steps = 0;
  const walker = new Date(2027, 0, 1);
  let previous = dayFromCivil(walker.getFullYear(), walker.getMonth() + 1, walker.getDate());
  for (let i = 0; i < 730; i += 1) {
    walker.setDate(walker.getDate() + 1);
    const current = dayFromCivil(walker.getFullYear(), walker.getMonth() + 1, walker.getDate());
    steps += 1;
    if (current - previous !== 1) {
      dstBad = `${walker.toDateString()}: step of ${current - previous}`;
      break;
    }
    previous = current;
  }
  check(
    'DST-safe day stepping',
    dstBad === '',
    dstBad || `${steps} local days in ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
  );

  // 7. weekOf / dayAt round-trip across four years, both directions.
  let tripBad = '';
  for (let w = -104; w <= 104; w += 1) {
    for (let o = 0; o <= 6; o += 1) {
      const day = dayAt(w as WeekIndex, o as DayOffset);
      const pos = positionOf(day);
      if (pos.week !== w || pos.day !== o) {
        tripBad = `week ${w} offset ${o} -> ${pos.week}/${pos.day}`;
        break;
      }
    }
    if (tripBad) break;
  }
  check('weekOf/dayAt round-trip', tripBad === '', tripBad || '209 weeks x 7 days');

  // 8. Week 0 contains today, and its Monday is on or before it.
  const w0 = weekOf(today());
  const w0Monday = dayAt(0 as WeekIndex, 0);
  check(
    'week 0 contains today',
    w0 === 0 && w0Monday <= today() && today() - w0Monday <= 6,
    `weekOf(today)=${w0}, today-monday=${today() - w0Monday}`,
  );

  // 9. Month keys: a week spanning a boundary asks for both months.
  const spanKeys = monthKeysBetween(dayFromCivil(2026, 12, 28), dayFromCivil(2027, 1, 3));
  check(
    'month keys span the boundary',
    spanKeys.length === 2 && spanKeys[0] === '2026-12' && spanKeys[1] === '2027-01',
    spanKeys.join(', '),
  );

  return results;
}
