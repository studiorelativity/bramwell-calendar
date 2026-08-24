// STAGE 03 — year view: one calendar year as a week-aligned grid.
// Four weeks (28 day columns) per row, so every column is the same weekday
// the whole way down; the first row is indented by the weekday of 1 January.
// Reads the cache through state.ts, paints, and reports day clicks. It owns
// no scroll position and makes no network calls.

import { timeLabel } from './render.ts';
import { civilFromDay, dayFromCivil, eventsForWeek, today, weekOf } from './state.ts';
import type { CalendarEvent, DayNumber, WeekIndex } from './types.ts';

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTHS_SHORT = [
  'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN',
  'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC',
];

/** Column counts to try, widest first. All multiples of 7, so weeks align. */
const COLUMN_OPTIONS = [28, 14, 7];
const MIN_COL_W = 44;
/** Event bars drawn per day cell before the rest are dropped. */
const MAX_BARS = 3;

let host: HTMLElement | null = null;
let shownYear = 0;
/** Events per day for the year on screen, reused by the hover panel. */
let dayEvents = new Map<number, CalendarEvent[]>();
/**
 * STAGE 07 — days carrying a note. Notes are excluded from dayEvents entirely
 * (no cell bar, no panel row); the panel marks them on the date line instead,
 * which keeps the note discoverable without spending one of the 3 bar slots.
 */
let noteDays = new Set<number>();
let popover: HTMLElement | null = null;
let popoverDay = Number.NaN;
const clickListeners: Array<(day: DayNumber) => void> = [];

export function initYear(container: HTMLElement): void {
  host = container;
  // A touch device has no hover, so the panel is tap-driven there instead:
  // first tap on a day reveals it, second tap on the same day opens the
  // calendar. On a pointer device a tap goes straight through.
  const canHover = window.matchMedia('(hover: hover)').matches;

  host.addEventListener('click', (e) => {
    const cell = (e.target as Element | null)?.closest<HTMLElement>('.ycell');
    if (!cell?.dataset.day) {
      hidePanel();
      return;
    }
    const day = Number(cell.dataset.day);
    if (!canHover && day !== popoverDay) {
      popoverDay = day;
      showPanel(cell, day as DayNumber);
      return;
    }
    hidePanel();
    for (const fn of clickListeners) fn(day as DayNumber);
  });

  if (canHover) {
    host.addEventListener('mouseover', (e) => {
      const cell = (e.target as Element | null)?.closest<HTMLElement>('.ycell');
      if (!cell?.dataset.day) {
        hidePanel();
        return;
      }
      const day = Number(cell.dataset.day);
      if (day === popoverDay) return; // same cell: nothing to rebuild
      popoverDay = day;
      showPanel(cell, day as DayNumber);
    });
    host.addEventListener('mouseleave', hidePanel);
  }
  host.addEventListener('scroll', hidePanel, { passive: true });
}

// ---------------------------------------------------------------------------
// Hover panel — the hovered day plus its neighbours, events in full
// ---------------------------------------------------------------------------

function hidePanel(): void {
  popoverDay = Number.NaN;
  if (popover) popover.hidden = true;
}

function dayCard(day: DayNumber, hovered: boolean): HTMLElement {
  const card = document.createElement('div');
  card.className = hovered ? 'ypday is-hovered' : 'ypday';

  const civil = civilFromDay(day);
  const dow = ((((day + 3) % 7) + 7) % 7);
  const date = document.createElement('div');
  date.className = 'ypdate';
  date.textContent = `${WEEKDAYS[dow]} ${civil.day} ${MONTHS_SHORT[civil.month - 1]}`;
  if (noteDays.has(day)) {
    const dot = document.createElement('span');
    dot.className = 'ypnote';
    dot.title = 'Has a note';
    date.append(dot);
  }
  card.append(date);

  const events = dayEvents.get(day) ?? [];
  if (events.length === 0) {
    const none = document.createElement('div');
    none.className = 'ypnone';
    // A day holding only a note is not "Nothing" — the dot above says so.
    none.textContent = noteDays.has(day) ? 'Note only' : 'Nothing';
    card.append(none);
    return card;
  }
  for (const event of events) {
    const row = document.createElement('div');
    row.className = 'ypev';
    row.dataset.cat = event.category;
    if (event.span.kind === 'timed') {
      const when = document.createElement('b');
      when.textContent = timeLabel(event.span.startMinute, true);
      row.append(when);
    }
    // A span, not a bare text node: only flex items get the row's gap.
    const title = document.createElement('span');
    title.className = 'yptitle';
    title.textContent = event.title;
    row.append(title);
    card.append(row);
  }
  return card;
}

function showPanel(cell: HTMLElement, day: DayNumber): void {
  if (!popover) {
    popover = document.createElement('div');
    popover.className = 'ypop';
    popover.hidden = true;
    document.body.append(popover);
  }
  popover.replaceChildren(
    dayCard((day - 1) as DayNumber, false),
    dayCard(day, true),
    dayCard((day + 1) as DayNumber, false),
  );
  popover.hidden = false;

  // Layout read, but only on entering a new cell — not in any frame loop.
  const rect = cell.getBoundingClientRect();
  const width = popover.offsetWidth;
  const height = popover.offsetHeight;
  let left = rect.left;
  let top = rect.bottom + 6;
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8;
  if (left < 8) left = 8;
  // Not enough room below: flip above the cell.
  if (top + height > window.innerHeight - 8) top = rect.top - height - 6;
  if (top < 8) top = 8;
  popover.style.left = `${left}px`;
  popover.style.top = `${top}px`;
}

/** Clicking a day in the year view. main.ts returns to the calendar there. */
export function onYearDayClick(fn: (day: DayNumber) => void): void {
  clickListeners.push(fn);
}

export function currentYear(): number {
  return shownYear;
}

function columnsFor(width: number): number {
  for (const cols of COLUMN_OPTIONS) {
    if (width / cols >= MIN_COL_W) return cols;
  }
  return 7;
}

/**
 * Events touching each day of the year, longest-first so a multi-day event
 * keeps the same lane in every cell it covers and reads as a continuous run.
 */
function eventsByDay(first: DayNumber, last: DayNumber): Map<number, CalendarEvent[]> {
  const byDay = new Map<number, CalendarEvent[]>();
  const seen = new Set<string>();
  noteDays = new Set<number>();
  const firstWeek: number = weekOf(first);
  const lastWeek: number = weekOf(last);

  for (let w = firstWeek; w <= lastWeek; w += 1) {
    for (const event of eventsForWeek(w as WeekIndex)) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      const from = Math.max(event.span.start, first);
      const to = Math.min(event.span.end, last);
      if (event.isDayNote) {
        for (let d = from; d <= to; d += 1) noteDays.add(d);
        continue;
      }
      for (let d = from; d <= to; d += 1) {
        const list = byDay.get(d);
        if (list) list.push(event);
        else byDay.set(d, [event]);
      }
    }
  }

  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const la = a.span.end - a.span.start;
      const lb = b.span.end - b.span.start;
      if (la !== lb) return lb - la;
      if (a.span.start !== b.span.start) return a.span.start - b.span.start;
      return a.id < b.id ? -1 : 1;
    });
  }
  return byDay;
}

/** Paint one calendar year. Cheap enough to rebuild wholesale: 365 cells. */
export function renderYear(year: number): void {
  if (!host) return;
  // A month landing in the cache repaints the year. If the pointer is still
  // resting on a day, the panel must survive that: it is rebuilt against the
  // new cells below rather than torn down mid-read.
  const keepDay = year === shownYear ? popoverDay : Number.NaN;
  shownYear = year;

  const first = dayFromCivil(year, 1, 1);
  const last = dayFromCivil(year, 12, 31);
  const todayDay = today();
  // One day past each end, so the hover panel's neighbours resolve on Jan 1
  // and Dec 31.
  dayEvents = eventsByDay((first - 1) as DayNumber, (last + 1) as DayNumber);
  const byDay = dayEvents;

  // Indent the first row by the weekday of 1 January, so column N is the same
  // weekday for the whole year.
  const lead = ((((first + 3) % 7) + 7) % 7);
  const cols = columnsFor(host.clientWidth || window.innerWidth);

  // Layout read, but only on an explicit repaint — never in a frame loop.
  host.style.paddingTop = `${document.getElementById('app-header')?.offsetHeight ?? 68}px`;

  const grid = document.createElement('div');
  grid.className = 'ygrid';
  grid.style.setProperty('--ycols', String(cols));

  for (let i = 0; i < lead; i += 1) {
    grid.append(Object.assign(document.createElement('div'), { className: 'ycell blank' }));
  }

  for (let day = first; day <= last; day = (day + 1) as DayNumber) {
    const civil = civilFromDay(day);
    const dow = ((((day + 3) % 7) + 7) % 7);

    const cell = document.createElement('div');
    cell.className = 'ycell';
    cell.dataset.day = String(day);
    cell.dataset.band = civil.month % 2 === 0 ? '1' : '0';
    if (dow >= 5) cell.dataset.we = '1';
    if (day === todayDay) cell.dataset.today = '1';
    // Neighbours of today carry their signed offset, so the glow can fade off
    // today's solid cell: a short lead-in before, a longer tail after.
    if (civil.day === 1) cell.dataset.first = '1';

    const dowEl = document.createElement('span');
    dowEl.className = 'ydow';
    dowEl.textContent = WEEKDAYS[dow];

    const num = document.createElement('span');
    num.className = 'ynum';
    num.textContent = String(civil.day);

    if (civil.day === 1) {
      const badge = document.createElement('span');
      badge.className = 'ymonth';
      badge.textContent = MONTHS_SHORT[civil.month - 1];
      cell.append(badge);
    }
    cell.append(dowEl, num);

    const events = byDay.get(day);
    if (events?.length) {
      const bars = document.createElement('span');
      bars.className = 'ybars';
      for (const event of events.slice(0, MAX_BARS)) {
        const bar = document.createElement('i');
        bar.dataset.cat = event.category;
        bars.append(bar);
      }
      cell.append(bars);
    }
    grid.append(cell);
  }

  // Fill the last row so the grid ends square.
  const trailing = (cols - ((lead + (last - first + 1)) % cols)) % cols;
  for (let i = 0; i < trailing; i += 1) {
    grid.append(Object.assign(document.createElement('div'), { className: 'ycell blank' }));
  }

  host.replaceChildren(grid);

  if (Number.isNaN(keepDay)) {
    hidePanel();
    return;
  }
  const cell = host.querySelector<HTMLElement>(`.ycell[data-day="${keepDay}"]`);
  if (!cell) {
    hidePanel();
    return;
  }
  showPanel(cell, keepDay as DayNumber);
  popoverDay = keepDay;
}
