// STAGE 02 — event cache, week-index math, localStorage persistence.
// Owns the DayNumber <-> WeekIndex conversion every other module depends on
// (conventions.md). Makes no network calls of its own and touches no DOM;
// it asks gcal.ts for months it lacks.

import {
  createEvent as gcalCreate,
  deleteEvent as gcalDelete,
  listMonth,
  updateEvent as gcalUpdate,
} from './gcal.ts';
import type {
  CalendarEvent,
  DayNumber,
  EventDraft,
  RecurrenceScope,
  DayOffset,
  EventCache,
  MinuteOfDay,
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
  if (demo) return; // demo months are in-memory only, never written back
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
  if (demo) return; // no network in demo; unseeded months simply stay absent
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
// Writes — STAGE 04
// ---------------------------------------------------------------------------
// The drawer never calls gcal.ts. Every write lands locally as pending first,
// then goes to the API, then reconciles from the server's answer — or rolls
// back and rethrows so the UI can say what failed.

let tempSeq = 0;

export class OfflineError extends Error {
  constructor() {
    super('You are offline. This change was not saved.');
    this.name = 'OfflineError';
  }
}

/** Drop an event from the cache without keeping a rollback. */
function removeLocal(event: CalendarEvent): void {
  applyOptimistic({ ...event, pending: 'delete' });
}

/**
 * Pull the authoritative version of the months a write touched. Recurring
 * writes fan out unpredictably, so everything else resident is marked stale
 * and refreshes as it is approached.
 */
function reconcile(months: readonly MonthKey[], series: boolean): void {
  if (series) {
    for (const entry of Object.values(cache.months)) entry.fetchedAt = 0;
  }
  for (const key of months) void fetchMonth(key);
}

function monthsOf(event: CalendarEvent): MonthKey[] {
  return monthKeysBetween(event.span.start, event.span.end);
}

export function createEvent(draft: EventDraft): Promise<CalendarEvent> {
  ensureAnchored();
  if (demo) return Promise.reject(new DemoError());
  tempSeq += 1;
  const optimistic: CalendarEvent = {
    id: `tmp_${tempSeq}`,
    title: draft.title,
    category: draft.category,
    span: draft.span,
    pending: 'create',
  };
  if (draft.notes) optimistic.notes = draft.notes;
  if (draft.recurrence) optimistic.recurrence = draft.recurrence;
  // Without this the optimistic copy is not yet flagged, so it would paint as
  // a bar for one frame before the server's answer replaced it.
  if (draft.isDayNote) optimistic.isDayNote = true;

  const rollback = applyOptimistic(optimistic);
  return (async () => {
    try {
      if (!navigator.onLine) throw new OfflineError();
      const saved = await gcalCreate(draft);
      removeLocal(optimistic);
      applyOptimistic(saved);
      reconcile(monthsOf(saved), Boolean(draft.recurrence));
      return saved;
    } catch (err) {
      rollback();
      throw err;
    }
  })();
}

export function updateEvent(
  event: CalendarEvent,
  changes: Partial<EventDraft>,
  scope: RecurrenceScope,
): Promise<CalendarEvent> {
  ensureAnchored();
  if (demo) return Promise.reject(new DemoError());
  const optimistic: CalendarEvent = {
    ...event,
    ...(changes.title !== undefined ? { title: changes.title } : {}),
    ...(changes.notes !== undefined ? { notes: changes.notes } : {}),
    ...(changes.category !== undefined ? { category: changes.category } : {}),
    ...(changes.span !== undefined ? { span: changes.span } : {}),
    pending: 'update',
  };
  // The span may have moved, so the old months need repainting too.
  const touched = [...new Set([...monthsOf(event), ...monthsOf(optimistic)])];
  const rollbackOld = applyOptimistic({ ...event, pending: 'delete' });
  const rollbackNew = applyOptimistic(optimistic);

  return (async () => {
    try {
      if (!navigator.onLine) throw new OfflineError();
      const saved = await gcalUpdate(event, changes, scope);
      removeLocal(optimistic);
      applyOptimistic(saved);
      reconcile(touched, scope === 'series');
      return saved;
    } catch (err) {
      rollbackNew();
      rollbackOld();
      throw err;
    }
  })();
}

export function deleteEvent(event: CalendarEvent, scope: RecurrenceScope): Promise<void> {
  ensureAnchored();
  if (demo) return Promise.reject(new DemoError());
  const touched = monthsOf(event);
  const rollback = applyOptimistic({ ...event, pending: 'delete' });
  return (async () => {
    try {
      if (!navigator.onLine) throw new OfflineError();
      await gcalDelete(event, scope);
      reconcile(touched, scope === 'series');
    } catch (err) {
      rollback();
      throw err;
    }
  })();
}

/** Mark everything resident as stale, so it refreshes as it is approached. */
export function markAllStale(): void {
  for (const entry of Object.values(cache.months)) entry.fetchedAt = 0;
}

// ---------------------------------------------------------------------------
// Demo mode — STAGE 06
// ---------------------------------------------------------------------------
// A deterministic in-memory seed so anyone can feel the product without
// auth. The seed lives here because the cache is this module's property;
// nothing else may fabricate cache entries. The render pipeline cannot tell
// demo from real data — that is the point.

let demo = false;

export class DemoError extends Error {
  constructor() {
    super('Demo — connect your Google Calendar to save.');
    this.name = 'DemoError';
  }
}

export function isDemo(): boolean {
  return demo;
}

/** mulberry32: tiny seeded PRNG so every visitor sees the same calendar. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seedDemoEvents(): CalendarEvent[] {
  const rand = rng(0xb4a17);
  const t = today();
  let seq = 0;
  const out: CalendarEvent[] = [];

  const note = (day: number, text: string): void => {
    seq += 1;
    out.push({
      id: `demo-note-${seq}`,
      title: text.split('\n', 1)[0],
      notes: text,
      category: 'other',
      span: { kind: 'allDay', start: day as DayNumber, end: day as DayNumber },
      isDayNote: true,
    });
  };

  const allDay = (title: string, category: CalendarEvent['category'], start: number, days = 1): void => {
    seq += 1;
    out.push({
      id: `demo-${seq}`,
      title,
      category,
      span: { kind: 'allDay', start: start as DayNumber, end: (start + days - 1) as DayNumber },
    });
  };
  const timed = (
    title: string,
    category: CalendarEvent['category'],
    day: number,
    startMinute: number,
    endMinute: number,
    seriesId?: string,
  ): void => {
    seq += 1;
    const event: CalendarEvent = {
      id: `demo-${seq}`,
      title,
      category,
      span: {
        kind: 'timed',
        start: day as DayNumber,
        end: day as DayNumber,
        startMinute: startMinute as MinuteOfDay,
        endMinute: endMinute as MinuteOfDay,
      },
    };
    if (seriesId) event.recurringEventId = seriesId;
    out.push(event);
  };

  // A 3-week span crossing three week rows — the wrapping-bar showpiece.
  allDay('Product launch runway', 'work', t - 16, 21);

  // Recurring weekly texture across the whole range (~±8 months).
  const first = t - 245;
  const last = t + 245;
  for (let day = first; day <= last; day++) {
    const dow = ((((day + 3) % 7) + 7) % 7); // 0=Mon..6=Sun
    if (dow === 1) timed('Standup', 'work', day, 570, 585, 'demo-standup');
    if ((dow === 0 || dow === 3) && rand() < 0.7) timed('Gym', 'personal', day, 1080, 1140);
    if (dow === 4 && rand() < 0.35) timed('Dinner with friends', 'personal', day, 1140, 1260);
  }

  // Monthly financial rhythm + occasional one-offs.
  for (const key of monthKeysBetween(first as DayNumber, last as DayNumber)) {
    const [y, m] = key.split('-').map(Number) as [number, number];
    allDay('Invoices due', 'financial', dayFromCivil(y, m, 1));
    if (m % 3 === 1) allDay('Quarterly estimate', 'financial', dayFromCivil(y, m, 15));
    const oneOff = first + Math.floor(rand() * (last - first));
    if (rand() < 0.5) allDay('Server migration', 'other', oneOff);
  }

  // Weekend trips every ~6 weeks, Saturday–Sunday.
  for (let day = first; day <= last; day += 42) {
    const sat = day + ((5 - ((((day + 3) % 7) + 7) % 7) + 7) % 7);
    allDay('Cabin weekend', 'personal', sat, 2);
  }

  // One deliberately dense day near today: overflows the year cell's 3 bars
  // and gives the drawer a real list.
  timed('1:1 with Alex', 'work', t + 3, 660, 690);
  timed('Dentist', 'personal', t + 3, 840, 900);
  allDay('Flat viewing', 'other', t + 3);

  // Two day notes (STAGE 07). One on the dense day, so the demo shows the
  // Notes panel sitting above a real event list; one on a bare day, so the
  // cell marker is visible without anything else competing for the cell.
  note(t + 3, 'Ask Alex about the Q4 handover.\nBring the printed timeline.');
  note(t - 2, 'Slow morning. Walked the long way.');

  return out;
}

/**
 * Enter demo: seed the in-memory cache and mark those months ready. The
 * real localStorage cache is untouched (persist() no-ops while in demo).
 */
export function enterDemo(): void {
  ensureAnchored();
  demo = true;
  const events = seedDemoEvents();
  const byMonth: Record<string, CalendarEvent[]> = {};
  for (const event of events) {
    for (const key of monthKeysBetween(event.span.start, event.span.end)) {
      (byMonth[key] ??= []).push(event);
    }
  }
  cache = { version: CACHE_VERSION, months: {} };
  for (const k of Object.keys(loadState)) delete loadState[k];
  const keys = Object.keys(byMonth) as MonthKey[];
  for (const key of keys) {
    cache.months[key] = { key, events: byMonth[key] ?? [], fetchedAt: Date.now() };
    loadState[key] = 'ready';
  }
  notify(keys);
}

/** Exit demo: drop the seed, reload the real cache from localStorage. */
export function exitDemo(): void {
  if (!demo) return;
  demo = false;
  const dropped = Object.keys(cache.months) as MonthKey[];
  cache = { version: CACHE_VERSION, months: {} };
  for (const k of Object.keys(loadState)) delete loadState[k];
  loadCache();
  notify([...new Set([...dropped, ...(Object.keys(cache.months) as MonthKey[])])]);
}

/** Events on a single day, cache-only — what the day drawer lists. */
export function eventsOnDay(day: DayNumber): CalendarEvent[] {
  return eventsForWeek(weekOf(day))
    .filter((event) => event.span.start <= day && event.span.end >= day)
    .sort((a, b) => {
      const at = a.span.kind === 'timed' ? a.span.startMinute : -1;
      const bt = b.span.kind === 'timed' ? b.span.startMinute : -1;
      if (at !== bt) return at - bt;
      return a.title < b.title ? -1 : 1;
    });
}

// ---------------------------------------------------------------------------
// Day notes — STAGE 07
// ---------------------------------------------------------------------------
// This module owns upsert semantics; gcal.ts owns the wire format; the drawer
// owns neither and calls saveNote(). Notes ride the same optimistic write
// paths as events, so offline failure, rollback and the demo guard are
// inherited rather than reimplemented.

/**
 * The day's note, cache-only — the read twin of eventsOnDay().
 *
 * A calendar may hold more than one daynote on a day (hand-created, or a
 * write that raced). The earliest id wins and the extras are ignored: they
 * stay in Google Calendar untouched, because this app never deletes data it
 * did not just write.
 */
export function noteForDay(day: DayNumber): CalendarEvent | undefined {
  let best: CalendarEvent | undefined;
  for (const event of eventsForWeek(weekOf(day))) {
    if (!event.isDayNote) continue;
    if (event.span.start > day || event.span.end < day) continue;
    if (!best || event.id < best.id) best = event;
  }
  return best;
}

/**
 * Upsert the day's note: create when absent, patch when present, delete when
 * the text is empty. Rejects with OfflineError / DemoError exactly as an
 * event write does, and rolls back the same way.
 */
export function saveNote(day: DayNumber, text: string): Promise<void> {
  ensureAnchored();
  const trimmed = text.trim();
  const existing = noteForDay(day);

  if (!existing) {
    // Empty text with no note is not a write at all — nothing to create,
    // nothing to reject. Everything else routes through a guarded path.
    if (!trimmed) return Promise.resolve();
    return createEvent({
      title: trimmed,
      notes: trimmed,
      category: 'other',
      span: { kind: 'allDay', start: day, end: day },
      isDayNote: true,
    }).then(() => undefined);
  }

  if (!trimmed) return deleteEvent(existing, 'instance');

  // Always an instance write: a note is single-day and never recurring.
  return updateEvent(existing, { title: trimmed, notes: trimmed, isDayNote: true }, 'instance').then(
    () => undefined,
  );
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
