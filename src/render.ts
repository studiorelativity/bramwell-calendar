// STAGE 03 — week rows, bars, lane packing, month labels, sticky header.
// Pure paint: it owns the structure of a week row and every style write, but
// never the scroll position and never a fetch. scroll.ts hands it recycled
// nodes and a lens value; state.ts supplies the events.

import { civilFromDay, dayAt, eventsForWeek, today } from './state.ts';
import type { CalendarEvent, DayNumber, DayOffset, WeekIndex } from './types.ts';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

/** Total lanes a row will show. Beyond this, days get a "+N" marker. */
const MAX_LANES = 6;

/** Week rows currently realized, so a month arriving can repaint them. */
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
  timed: boolean;
}

interface WeekLayout {
  bars: Placement[];
  chips: Array<{ event: CalendarEvent; col: number; index: number }>;
  /** Lanes used by all-day bars; chips start below them. */
  allDayLanes: number;
  /** Overflow count per column. */
  more: number[];
}

function clampCol(n: number): number {
  return n < 0 ? 0 : n > 6 ? 6 : n;
}

/** First lane at or after `from` where [c0, c0+cs-1] is free. */
function firstFreeLane(taken: boolean[][], from: number, c0: number, cs: number): number {
  for (let lane = from; lane < MAX_LANES; lane += 1) {
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

function occupy(taken: boolean[][], lane: number, c0: number, cs: number): void {
  const row = taken[lane] ?? (taken[lane] = new Array<boolean>(7).fill(false));
  for (let c = c0; c < c0 + cs; c += 1) row[c] = true;
}

function layoutWeek(week: WeekIndex): WeekLayout {
  const first = dayAt(week, 0);
  const last = dayAt(week, 6);
  const events = eventsForWeek(week);

  const allDay: CalendarEvent[] = [];
  const timed: CalendarEvent[] = [];
  for (const event of events) (event.span.kind === 'allDay' ? allDay : timed).push(event);

  const taken: boolean[][] = [];
  const bars: Placement[] = [];
  const more = new Array<number>(7).fill(0);

  const place = (event: CalendarEvent, from: number, isTimed: boolean): number => {
    const c0 = clampCol(event.span.start - first);
    const cEnd = clampCol(event.span.end - first);
    const cs = Math.max(1, cEnd - c0 + 1);
    const lane = firstFreeLane(taken, from, c0, cs);
    if (lane < 0) {
      for (let c = c0; c <= cEnd; c += 1) more[c] += 1;
      return -1;
    }
    occupy(taken, lane, c0, cs);
    bars.push({
      event,
      c0,
      cs,
      lane,
      contLeft: event.span.start < first,
      contRight: event.span.end > last,
      timed: isTimed,
    });
    return lane;
  };

  // Longest-first, then earliest, then id — stable across repaints.
  allDay.sort((a, b) => {
    const la = a.span.end - a.span.start;
    const lb = b.span.end - b.span.start;
    if (la !== lb) return lb - la;
    if (a.span.start !== b.span.start) return a.span.start - b.span.start;
    return a.id < b.id ? -1 : 1;
  });
  for (const event of allDay) place(event, 0, false);

  const allDayLanes = taken.length;

  // Timed events sit in lanes below the all-day block: they fade out as the
  // row lifts, and the chips that replace them start below the all-day lanes.
  timed.sort((a, b) => {
    if (a.span.start !== b.span.start) return a.span.start - b.span.start;
    const ma = a.span.kind === 'timed' ? a.span.startMinute : 0;
    const mb = b.span.kind === 'timed' ? b.span.startMinute : 0;
    return ma - mb;
  });
  for (const event of timed) place(event, allDayLanes, true);

  // Chips: per day cell, sorted by start time.
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

  return { bars, chips, allDayLanes, more };
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
    const num = document.createElement('span');
    num.className = 'dnum';
    col.append(num);
    const more = document.createElement('span');
    more.className = 'more';
    col.append(more);
    cols.append(col);
  }
  node.append(cols);

  const rule = document.createElement('div');
  rule.className = 'mrule';
  rule.hidden = true;
  rule.append(document.createElement('span'));
  node.append(rule);

  const lanes = document.createElement('div');
  lanes.className = 'lanes';
  node.append(lanes);

  const chips = document.createElement('div');
  chips.className = 'chips';
  node.append(chips);

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

  // Day cells.
  const cols = node.firstElementChild as HTMLElement;
  for (let i = 0; i < 7; i += 1) {
    const col = cols.children[i] as HTMLElement;
    const day = (first + i) as DayNumber;
    const civil = civilFromDay(day);
    col.dataset.today = day === todayDay ? '1' : '0';
    (col.firstElementChild as HTMLElement).textContent = String(civil.day);
    const more = col.children[1] as HTMLElement;
    more.textContent = layout.more[i] ? `+${layout.more[i]}` : '';
  }

  // Month boundary: rule spans from the 1st to the end of the row.
  const rule = node.children[1] as HTMLElement;
  let boundaryCol = -1;
  for (let i = 0; i < 7; i += 1) {
    if (civilFromDay((first + i) as DayNumber).day === 1) {
      boundaryCol = i;
      break;
    }
  }
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
  const lanes = node.children[2] as HTMLElement;
  const bars: HTMLElement[] = [];
  for (const p of layout.bars) {
    const bar = document.createElement('div');
    bar.className = p.timed ? 'bar timed' : 'bar';
    bar.dataset.cat = p.event.category;
    if (p.contLeft) bar.dataset.l = '1';
    if (p.contRight) bar.dataset.r = '1';
    if (p.event.pending) bar.dataset.pending = '1';
    bar.style.setProperty('--c0', String(p.c0));
    bar.style.setProperty('--cs', String(p.cs));
    bar.style.setProperty('--lane', String(p.lane));
    if (!p.timed) {
      const title = document.createElement('span');
      title.className = 'btitle';
      // Only the true start carries the title; continuations stay clean.
      title.textContent = p.contLeft ? '' : p.event.title;
      bar.append(title);
    }
    bars.push(bar);
  }
  lanes.replaceChildren(...bars);

  // Chips.
  const chipHost = node.children[3] as HTMLElement;
  const chips: HTMLElement[] = [];
  for (const c of layout.chips) {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.dataset.cat = c.event.category;
    chip.style.setProperty('--c0', String(c.col));
    chip.style.setProperty('--i', String(c.index));
    const when = document.createElement('b');
    when.textContent =
      c.event.span.kind === 'timed' ? timeLabel(c.event.span.startMinute) : '';
    chip.append(when, document.createTextNode(c.event.title));
    chips.push(chip);
  }
  chipHost.replaceChildren(...chips);
  node.style.setProperty(
    '--chips-top',
    `calc(var(--head-h) + ${layout.allDayLanes} * var(--lane-h) + 2px)`,
  );
}

/** Apply lens interpolation to a row: height, position, elevation, detail. */
export function applyLens(node: HTMLElement, t: number, height: number, y: number): void {
  const style = node.style;
  style.setProperty('--t', t.toFixed(4));
  style.height = `${height.toFixed(2)}px`;
  style.transform = `translate3d(0,${y.toFixed(2)}px,0) scale(${(1 + 0.01 * t).toFixed(4)})`;
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
// Sticky month header
// ---------------------------------------------------------------------------

let labelHost: HTMLElement | null = null;
let currentLabel = '';

/**
 * A week that straddles a month belongs to the month containing its Thursday
 * — the ISO convention, and the one that matches what the row looks like.
 */
function monthLabelFor(week: WeekIndex): string {
  const civil = civilFromDay(dayAt(week, 3 as DayOffset));
  return `${MONTHS[civil.month - 1]} ${civil.year}`;
}

/** Cross-fade the sticky month + year strip to the docked week's month. */
export function renderMonthHeader(week: WeekIndex): void {
  labelHost ??= document.querySelector<HTMLElement>('.mlabel');
  if (!labelHost) return;

  const text = monthLabelFor(week);
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
