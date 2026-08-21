// STAGE 02 — Google Calendar v3 API module.
// The ONLY file making network calls. Owns every wire <-> internal
// conversion, including the all-day exclusive/inclusive end-date fix.

import { getToken } from './auth.ts';
import { categoryFromColorId, colorIdFor } from './categories.ts';
import type {
  CalendarEvent,
  DayNumber,
  EventDraft,
  EventSpan,
  MinuteOfDay,
  MonthKey,
  RecurrenceScope,
} from './types.ts';

const BASE = 'https://www.googleapis.com/calendar/v3';
const CALENDAR = 'primary';
/** gate: lower this temporarily to force pagination on an ordinary month. */
const MAX_RESULTS = 250;
const RETRY_DELAY_MS = 800;
const MS_PER_DAY = 86_400_000;

// -- wire shapes -------------------------------------------------------------

interface WireDate {
  date?: string;
  dateTime?: string;
  timeZone?: string;
}

interface WireEvent {
  id: string;
  recurringEventId?: string;
  summary?: string;
  description?: string;
  colorId?: string;
  recurrence?: string[];
  status?: string;
  start?: WireDate;
  end?: WireDate;
}

interface WireList {
  items?: WireEvent[];
  nextPageToken?: string;
}

// -- civil-date math at the wire boundary ------------------------------------
// Date.UTC is used purely as civil-date arithmetic: no zone, no DST. The
// matching layout-side math lives in state.ts (conventions.md).

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function dayFromCivil(year: number, month: number, day: number): DayNumber {
  return (Date.UTC(year, month - 1, day) / MS_PER_DAY) as DayNumber;
}

function civilFromDay(day: DayNumber): { year: number; month: number; day: number } {
  const dt = new Date(day * MS_PER_DAY);
  return { year: dt.getUTCFullYear(), month: dt.getUTCMonth() + 1, day: dt.getUTCDate() };
}

function dayFromIsoDate(iso: string): DayNumber {
  const [year, month, day] = iso.split('-').map(Number);
  return dayFromCivil(year, month, day);
}

function isoDateFromDay(day: DayNumber): string {
  const c = civilFromDay(day);
  return `${c.year}-${pad2(c.month)}-${pad2(c.day)}`;
}

/** Local civil day of an instant — the day the user sees it on. */
function dayFromLocal(dt: Date): DayNumber {
  return dayFromCivil(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

function minuteFromLocal(dt: Date): MinuteOfDay {
  return (dt.getHours() * 60 + dt.getMinutes()) as MinuteOfDay;
}

/** RFC3339 with the browser's local offset, as the spec requires. */
function rfc3339Local(day: DayNumber, minute: number): string {
  const c = civilFromDay(day);
  const local = new Date(c.year, c.month - 1, c.day, Math.floor(minute / 60), minute % 60, 0, 0);
  const offset = -local.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return (
    `${c.year}-${pad2(c.month)}-${pad2(c.day)}` +
    `T${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}:00` +
    `${sign}${pad2(Math.floor(abs / 60))}:${pad2(abs % 60)}`
  );
}

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// -- transport ---------------------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function send(path: string, init: RequestInit, forceRefresh: boolean): Promise<Response> {
  const token = await getToken(forceRefresh);
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  return fetch(`${BASE}${path}`, { ...init, headers });
}

/**
 * 401 → the token is dead: clear it and retry once.
 * 403 / 5xx → one retry with backoff, then surface the error.
 */
async function call(path: string, init: RequestInit = {}): Promise<Response> {
  let res = await send(path, init, false);
  if (res.status === 401) {
    res = await send(path, init, true);
  }
  if (res.status === 403 || res.status >= 500) {
    await delay(RETRY_DELAY_MS);
    res = await send(path, init, false);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Calendar API ${res.status}: ${body.slice(0, 200)}`);
  }
  return res;
}

// -- normalization -----------------------------------------------------------

function normalize(w: WireEvent): CalendarEvent | null {
  if (!w.start || !w.end) return null;

  let span: EventSpan;
  if (w.start.date && w.end.date) {
    const start = dayFromIsoDate(w.start.date);
    // API end date is EXCLUSIVE; internally it is inclusive.
    const end = Math.max(start, dayFromIsoDate(w.end.date) - 1) as DayNumber;
    span = { kind: 'allDay', start, end };
  } else if (w.start.dateTime && w.end.dateTime) {
    const s = new Date(w.start.dateTime);
    const e = new Date(w.end.dateTime);
    span = {
      kind: 'timed',
      start: dayFromLocal(s),
      end: dayFromLocal(e),
      startMinute: minuteFromLocal(s),
      endMinute: minuteFromLocal(e),
    };
  } else {
    return null;
  }

  const event: CalendarEvent = {
    id: w.id,
    title: w.summary?.trim() || '(no title)',
    category: categoryFromColorId(w.colorId),
    span,
  };
  if (w.recurringEventId) event.recurringEventId = w.recurringEventId;
  if (w.description) event.notes = w.description;
  if (w.recurrence?.length) event.recurrence = w.recurrence;
  return event;
}

function payload(draft: Partial<EventDraft>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (draft.title !== undefined) body.summary = draft.title;
  if (draft.notes !== undefined) body.description = draft.notes;
  if (draft.category !== undefined) body.colorId = colorIdFor(draft.category);
  if (draft.recurrence !== undefined) body.recurrence = draft.recurrence;
  if (draft.span) {
    const span = draft.span;
    if (span.kind === 'allDay') {
      body.start = { date: isoDateFromDay(span.start) };
      // Inclusive internally, exclusive on the wire.
      body.end = { date: isoDateFromDay((span.end + 1) as DayNumber) };
    } else {
      const timeZone = localTimeZone();
      body.start = { dateTime: rfc3339Local(span.start, span.startMinute), timeZone };
      body.end = { dateTime: rfc3339Local(span.end, span.endMinute), timeZone };
    }
  }
  return body;
}

/** Instance id targets this occurrence; the parent id targets the series. */
function targetId(event: CalendarEvent, scope: RecurrenceScope): string {
  return scope === 'series' ? (event.recurringEventId ?? event.id) : event.id;
}

// -- public interface --------------------------------------------------------

/** List one month, singleEvents + orderBy=startTime, paged to exhaustion. */
export async function listMonth(month: MonthKey): Promise<CalendarEvent[]> {
  const [year, m] = String(month).split('-').map(Number);
  const first = dayFromCivil(year, m, 1);
  const nextFirst = dayFromCivil(m === 12 ? year + 1 : year, m === 12 ? 1 : m + 1, 1);

  const out: CalendarEvent[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      timeMin: rfc3339Local(first, 0),
      timeMax: rfc3339Local(nextFirst, 0),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: String(MAX_RESULTS),
    });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await call(`/calendars/${CALENDAR}/events?${params}`);
    const data = (await res.json()) as WireList;
    for (const w of data.items ?? []) {
      if (w.status === 'cancelled') continue;
      const event = normalize(w);
      if (event) out.push(event);
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

export async function createEvent(draft: EventDraft): Promise<CalendarEvent> {
  const res = await call(`/calendars/${CALENDAR}/events`, {
    method: 'POST',
    body: JSON.stringify(payload(draft)),
  });
  const event = normalize((await res.json()) as WireEvent);
  if (!event) throw new Error('Calendar API returned an event that could not be read');
  return event;
}

/** PATCH changed fields only; `scope` picks instance id vs recurringEventId. */
export async function updateEvent(
  event: CalendarEvent,
  changes: Partial<EventDraft>,
  scope: RecurrenceScope,
): Promise<CalendarEvent> {
  const id = encodeURIComponent(targetId(event, scope));
  const res = await call(`/calendars/${CALENDAR}/events/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload(changes)),
  });
  const updated = normalize((await res.json()) as WireEvent);
  if (!updated) throw new Error('Calendar API returned an event that could not be read');
  return updated;
}

export async function deleteEvent(event: CalendarEvent, scope: RecurrenceScope): Promise<void> {
  const id = encodeURIComponent(targetId(event, scope));
  await call(`/calendars/${CALENDAR}/events/${id}`, { method: 'DELETE' });
}
