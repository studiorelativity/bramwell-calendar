// STAGE 03 — week rows, bars, lane packing, month labels, sticky header.
// Pure paint: it owns the structure of a week row and every style write, but
// never the scroll position and never a fetch. scroll.ts hands it recycled
// nodes and a position; state.ts supplies the events.
// Revised 2026-08-20: uniform rows, month bands, no lens.

import { civilFromDay, dayAt, eventsForWeek, today } from './state.ts';
import type { CalendarEvent, DayNumber, WeekIndex } from './types.ts';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Lanes a row will show. Beyond this, days get a "+N" marker. */
const MAX_LANES = 6;

const mounted = new Map<number, HTMLElement>();
const weekOfNode = new WeakMap<HTMLElement, number>();

// ---------------------------------------------------------------------------
// Lane packing — longest-first, as v2 did it
// ---------------------------------------------------------------------------

interface Placement {
  event: CalendarEvent;
  c0: number;
  cs: number;
  lane: number;
  contLeft: boolean;
  contRight: boolean;
}

interface WeekLayout {
  bars: Placement[];
  chips: Array<{ event: CalendarEvent; col: number; index: number }>;
  laneCount: number;
  more: number[];
}

function clampCol(n: number): number {
  return n < 0 ? 0 : n > 6 ? 6 : n;
}

function firstFreeLane(taken: boolean[][], c0: number, cs: number): number {
  for (let lane = 0; lane < MAX_LANES; lane += 1) {
    const row = taken[lane] ?? (taken[lane] = new Array<boolean>(7).fill(false));
    let free = true;
    for (let c = c0; c < c0 + cs; c += 1) {
      if (row[c]) {
        free = false;
        break;
      }
    }
    if (free) return lane;
  }
  return -1;
}

function layoutWeek(week: WeekIndex): WeekLayout {
  const first = dayAt(week, 0);
  const last = dayAt(week, 6);

  const allDay: CalendarEvent[] = [];
  const timed: CalendarEvent[] = [];
  for (const event of eventsForWeek(week)) {
    (event.span.kind === 'allDay' ? allDay : timed).push(event);
  }

  // Longest-first, then earliest, then id — stable across repaints.
  allDay.sort((a, b) => {
    const la = a.span.end - a.span.start;
    const lb = b.span.end - b.span.start;
    if (la !== lb) return lb - la;
    if (a.span.start !== b.span.start) return a.span.start - b.span.start;
    return a.id < b.id ? -1 : 1;
  });

  const taken: boolean[][] = [];
  const bars: Placement[] = [];
  const more = new Array<number>(7).fill(0);

  for (const event of allDay) {
    const c0 = clampCol(event.span.start - first);
    const cEnd = clampCol(event.span.end - first);
    const cs = Math.max(1, cEnd - c0 + 1);
    const lane = firstFreeLane(taken, c0, cs);
    if (lane < 0) {
      for (let c = c0; c <= cEnd; c += 1) more[c] += 1;
      continue;
    }
    const row = taken[lane];
    for (let c = c0; c < c0 + cs; c += 1) row[c] = true;
    bars.push({
      event,
      c0,
      cs,
      lane,
      contLeft: event.span.start < first,
      contRight: event.span.end > last,
    });
  }

  // Timed events are chips in their day cell, sorted by start time.
  timed.sort((a, b) => {
    if (a.span.start !== b.span.start) return a.span.start - b.span.start;
    const ma = a.span.kind === 'timed' ? a.span.startMinute : 0;
    const mb = b.span.kind === 'timed' ? b.span.startMinute : 0;
    return ma - mb;
  });
  const perCol = new Map<number, CalendarEvent[]>();
  for (const event of timed) {
    const col = clampCol(event.span.start - first);
    const list = perCol.get(col);
    if (list) list.push(event);
    else perCol.set(col, [event]);
  }
  const chips: WeekLayout['chips'] = [];
  for (const [col, list] of perCol) {
    list.forEach((event, index) => chips.push({ event, col, index }));
  }

  return { bars, chips, laneCount: taken.length, more };
}

// ---------------------------------------------------------------------------
// Node construction
// ---------------------------------------------------------------------------

/** One recycled week row. Structure built once; content swapped on reuse. */
export function createWeekNode(): HTMLElement {
  const node = document.createElement('div');
  node.className = 'week';

  const cols = document.createElement('div');
  cols.className = 'cols';
  for (let i = 0; i < 7; i += 1) {
    const col = document.createElement('div');
    col.className = 'col';
    if (i >= 5) col.dataset.we = '1';
    col.dataset.dow = String(i);
    col.append(
      Object.assign(document.createElement('span'), { className: 'dnum' }),
      Object.assign(document.createElement('span'), { className: 'more' }),
    );
    cols.append(col);
  }
  node.append(cols);

  const rule = document.createElement('div');
  rule.className = 'mrule';
  rule.hidden = true;
  rule.append(document.createElement('span'));
  node.append(rule);

  node.append(Object.assign(document.createElement('div'), { className: 'lanes' }));
  node.append(Object.assign(document.createElement('div'), { className: 'chips' }));
  return node;
}

function timeLabel(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hour12}` : `${hour12}:${m < 10 ? `0${m}` : m}`;
}

/** Build (or recycle) the element for one week row. */
export function renderWeekRow(week: WeekIndex, node: HTMLElement): void {
  const previous = weekOfNode.get(node);
  if (previous !== undefined && mounted.get(previous) === node) mounted.delete(previous);
  weekOfNode.set(node, week);
  mounted.set(week, node);
  node.dataset.week = String(week);

  const first = dayAt(week, 0);
  const todayDay = today();
  const layout = layoutWeek(week);

  // Day cells: number, today marker, and the alternating month band.
  const cols = node.firstElementChild as HTMLElement;
  let boundaryCol = -1;
  for (let i = 0; i < 7; i += 1) {
    const col = cols.children[i] as HTMLElement;
    const day = (first + i) as DayNumber;
    const civil = civilFromDay(day);
    col.dataset.band = civil.month % 2 === 0 ? '1' : '0';
    col.dataset.today = day === todayDay ? '1' : '0';
    (col.firstElementChild as HTMLElement).textContent = String(civil.day);
    (col.children[1] as HTMLElement).textContent = layout.more[i] ? `+${layout.more[i]}` : '';
    if (civil.day === 1) boundaryCol = i;
  }

  // Month boundary: rule from the 1st to the end of the row.
  const rule = node.children[1] as HTMLElement;
  if (boundaryCol >= 0) {
    const civil = civilFromDay((first + boundaryCol) as DayNumber);
    rule.hidden = false;
    rule.style.left = `${(boundaryCol / 7) * 100}%`;
    (rule.firstElementChild as HTMLElement).textContent =
      civil.month === 1 ? `${MONTHS_SHORT[0]} ${civil.year}` : MONTHS_SHORT[civil.month - 1];
  } else {
    rule.hidden = true;
  }

  // Bars.
  const bars: HTMLElement[] = [];
  for (const p of layout.bars) {
    const bar = document.createElement('div');
    bar.className = 'bar';
    bar.dataset.cat = p.event.category;
    if (p.contLeft) bar.dataset.l = '1';
    if (p.contRight) bar.dataset.r = '1';
    if (p.event.pending) bar.dataset.pending = '1';
    bar.style.setProperty('--c0', String(p.c0));
    bar.style.setProperty('--cs', String(p.cs));
    bar.style.setProperty('--lane', String(p.lane));
    const title = document.createElement('span');
    title.className = 'btitle';
    // Only the true start carries the title, so it appears once per event.
    title.textContent = p.contLeft ? '' : p.event.title;
    bar.append(title);
    bars.push(bar);
  }
  (node.children[2] as HTMLElement).replaceChildren(...bars);

  // Chips.
  const chips: HTMLElement[] = [];
  for (const c of layout.chips) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.cat = c.event.category;
    chip.style.setProperty('--c0', String(c.col));
    chip.style.setProperty('--i', String(c.index));
    const when = document.createElement('b');
    when.textContent = c.event.span.kind === 'timed' ? timeLabel(c.event.span.startMinute) : '';
    chip.append(when, document.createTextNode(c.event.title));
    chips.push(chip);
  }
  (node.children[3] as HTMLElement).replaceChildren(...chips);
  node.style.setProperty(
    '--chips-top',
    `calc(var(--head-h) + ${layout.laneCount} * var(--lane-h) + 2px)`,
  );
}

/** Position and size a row. The only per-frame DOM write. */
export function placeRow(node: HTMLElement, y: number, height: number): void {
  node.style.height = `${height.toFixed(2)}px`;
  node.style.transform = `translate3d(0,${y.toFixed(2)}px,0)`;
}

/** Repaint rows whose month just arrived from the cache. */
export function invalidateWeeks(weeks: readonly WeekIndex[]): void {
  for (const week of weeks) {
    const node = mounted.get(week);
    if (node) renderWeekRow(week, node);
  }
}

/** Every week row currently realized — used to repaint on a cache change. */
export function mountedWeeks(): WeekIndex[] {
  return [...mounted.keys()] as WeekIndex[];
}

// ---------------------------------------------------------------------------
// Sticky header
// ---------------------------------------------------------------------------

let labelHost: HTMLElement | null = null;
let currentLabel = '';

/** The month(s) actually on screen. At rest the view straddles a boundary. */
function rangeLabel(first: WeekIndex, last: WeekIndex): string {
  const a = civilFromDay(dayAt(first, 0));
  const b = civilFromDay(dayAt(last, 6));
  if (a.year === b.year && a.month === b.month) return `${MONTHS[a.month - 1]} ${a.year}`;
  if (a.year === b.year) {
    return `${MONTHS_SHORT[a.month - 1]} – ${MONTHS_SHORT[b.month - 1]} ${a.year}`;
  }
  return `${MONTHS_SHORT[a.month - 1]} ${a.year} – ${MONTHS_SHORT[b.month - 1]} ${b.year}`;
}

/** Cross-fade the sticky header to the months currently in view. */
export function renderMonthHeader(first: WeekIndex, last: WeekIndex): void {
  labelHost ??= document.querySelector<HTMLElement>('.mlabel');
  if (!labelHost) return;

  const text = rangeLabel(first, last);
  if (text === currentLabel) return;
  currentLabel = text;

  for (const old of labelHost.querySelectorAll('span')) {
    old.classList.add('out');
    setTimeout(() => old.remove(), 400);
  }
  const span = document.createElement('span');
  span.className = 'out';
  span.textContent = text;
  labelHost.append(span);
  // Next frame, so the transition has a from-state to run from.
  requestAnimationFrame(() => span.classList.remove('out'));
}
