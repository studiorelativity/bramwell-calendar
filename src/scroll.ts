// STAGE 03 — virtualizer and month-snap physics.
// Owns the scroll position and the render window; render.ts does the painting.
// Transform-based positioning only: every measurement is cached at resize, so
// the frame loop performs no layout reads.
// Revised 2026-08-20: uniform rows, month detents, no lens.

import { createWeekNode, placeRow, renderMonthHeader, renderWeekRow } from './render.ts';
import { civilFromDay, dayAt, dayFromCivil, positionOf } from './state.ts';
import type { DayNumber, DayOffset, WeekIndex, WeekRange } from './types.ts';

// -- tuning ------------------------------------------------------------------
// Everything here was set by feel; see 03_engine/output/verification.md.

/** Week rows that should fill the viewport: a month plus its edges. */
const VISIBLE_WEEKS = 6.5;
/** Row height bounds, so the proportional size stays sane at any viewport. */
const MIN_ROW_H = 74;
const MAX_ROW_H = 190;
/**
 * Where a snap puts the anchor, as a fraction of the viewport.
 * 0.5 centres it: a 30-day anchor straddles a month boundary, a 15-day one
 * frames a whole month.
 */
const SNAP_ALIGN = 0.5;
/** Snap granularity in days, as offered by the header selector. */
export type SnapStep = 15 | 30 | 45;
/** Half-month anchors to skip per detent: 15 -> every one, 30 -> every other. */
const STEP_MODULUS: Record<SnapStep, number> = { 15: 1, 30: 2, 45: 3 };
const DEFAULT_STEP: SnapStep = 30;
/** How far momentum is projected before quantizing to a month. */
const PROJECT_MS = 300;
/** Settle duration = base + per-week, clamped. */
const SETTLE_BASE_MS = 280;
const SETTLE_PER_WEEK_MS = 42;
const SETTLE_MAX_MS = 760;
/** Trackpads over-deliver; scale wheel travel down. */
const WHEEL_GAIN = 0.6;
/** Quiet period after the last wheel event before settling. */
const WHEEL_IDLE_MS = 140;
/** Rows rendered beyond each viewport edge. */
const BUFFER_ROWS = 3;
/** Movement under this many px on release is a tap, not a drag. */
const TAP_SLOP_PX = 6;
/** The detent is visual, not tactile. Flip to re-enable the haptic tick. */
const HAPTIC_ON_SNAP = false;
const VIBRATE_MS = 8;

type Mode = 'idle' | 'drag' | 'settle';

// -- module state ------------------------------------------------------------

let host: HTMLElement | null = null;
let rows: HTMLElement | null = null;
let pool: HTMLElement[] = [];
let poolWeek: number[] = [];

let viewportH = 0;
let headerH = 0;
let usableH = 0;
let rowH = 0;
let visibleWeeks = 0;

/** Continuous week position: the week index at the top of the content area. */
let s = 0;
let mode: Mode = 'idle';
let velocity = 0; // weeks per ms

let dragPointer = -1;
let dragLastY = 0;
let dragLastT = 0;
let dragStartY = 0;
let dragMoved = 0;

let settleFrom = 0;
let settleTo = 0;
let settleStart = 0;
let settleMs = 0;

let rafId = 0;
let wheelTimer = 0;
let lastLabelKey = '';
let snapStepDays: SnapStep = DEFAULT_STEP;
let lastWindowKey = '';

const snapListeners: Array<(week: WeekIndex) => void> = [];
const windowListeners: Array<(range: WeekRange) => void> = [];
const dayTapListeners: Array<(day: DayNumber) => void> = [];

// -- measurement -------------------------------------------------------------

function measure(): void {
  viewportH = window.innerHeight;
  // Layout read, but only here — never from the frame loop.
  headerH = document.getElementById('app-header')?.offsetHeight ?? 64;
  usableH = Math.max(120, viewportH - headerH);
  rowH = Math.min(MAX_ROW_H, Math.max(MIN_ROW_H, usableH / VISIBLE_WEEKS));
  visibleWeeks = usableH / rowH;
}

function capacity(): number {
  return Math.ceil(visibleWeeks) + BUFFER_ROWS * 2 + 1;
}

function ensurePool(): void {
  if (!rows) return;
  const want = capacity();
  if (pool.length === want) return;
  for (const node of pool) node.remove();
  pool = [];
  poolWeek = [];
  for (let i = 0; i < want; i += 1) {
    pool.push(createWeekNode());
    poolWeek.push(Number.NaN);
  }
  rows.replaceChildren(...pool);
}

function slotFor(week: number): number {
  const n = pool.length;
  return ((week % n) + n) % n;
}

// -- half-month detents -----------------------------------------------------
// Anchors are the 1st and the 16th of each month, indexed consecutively. The
// selected step skips every other or every third anchor, which keeps stops
// pinned to real dates instead of drifting the way a rolling day count would.

/** The fractional week position at which a given day begins. */
function weekFloatOf(day: DayNumber): number {
  const pos = positionOf(day);
  return pos.week + pos.day / 7;
}

/** Consecutive index over half-month anchors: ...(1st, 16th, 1st, 16th)... */
function anchorIndexOf(day: DayNumber): number {
  const c = civilFromDay(day);
  return (c.year * 12 + (c.month - 1)) * 2 + (c.day >= 16 ? 1 : 0);
}

function anchorDay(index: number): DayNumber {
  const monthIndex = Math.floor(index / 2);
  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;
  return dayFromCivil(year, month, index % 2 === 0 ? 1 : 16);
}

/** Scroll position that puts this anchor at SNAP_ALIGN. */
function targetFor(index: number): number {
  return weekFloatOf(anchorDay(index)) - visibleWeeks * SNAP_ALIGN;
}

/** The day sitting at the alignment line for a given scroll position. */
function dayAtAlignment(position: number): DayNumber {
  const weekFloat = position + visibleWeeks * SNAP_ALIGN;
  const week = Math.floor(weekFloat);
  const offset = Math.min(6, Math.max(0, Math.floor((weekFloat - week) * 7)));
  return dayAt(week as WeekIndex, offset as DayOffset);
}

/** Nearest valid anchor to a scroll position, at the selected granularity. */
function nearestDetent(position: number): number {
  const modulus = STEP_MODULUS[snapStepDays];
  const here = anchorIndexOf(dayAtAlignment(position));
  const base = Math.floor(here / modulus) * modulus;
  let best = targetFor(base);
  for (let k = -2; k <= 2; k += 1) {
    if (k === 0) continue;
    const candidate = targetFor(base + k * modulus);
    if (Math.abs(candidate - position) < Math.abs(best - position)) best = candidate;
  }
  return best;
}

// -- the frame ---------------------------------------------------------------

function visibleRange(): WeekRange {
  return {
    first: Math.floor(s) as WeekIndex,
    last: Math.floor(s + visibleWeeks) as WeekIndex,
  };
}

function paint(): void {
  if (!rows) return;
  const firstWeek = Math.floor(s) - BUFFER_ROWS;
  const lastWeek = firstWeek + capacity() - 1;

  for (let w = firstWeek; w <= lastWeek; w += 1) {
    const slot = slotFor(w);
    const node = pool[slot];
    if (poolWeek[slot] !== w) {
      poolWeek[slot] = w;
      renderWeekRow(w as WeekIndex, node);
    }
    placeRow(node, headerH + (w - s) * rowH, rowH);
  }

  const windowKey = `${firstWeek}:${lastWeek}`;
  if (windowKey !== lastWindowKey) {
    lastWindowKey = windowKey;
    const range: WeekRange = { first: firstWeek as WeekIndex, last: lastWeek as WeekIndex };
    for (const fn of windowListeners) fn(range);
  }

  const visible = visibleRange();
  const labelKey = `${visible.first}:${visible.last}`;
  if (labelKey !== lastLabelKey) {
    lastLabelKey = labelKey;
    renderMonthHeader(visible.first, visible.last);
  }
}

function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

function frame(now: number): void {
  rafId = 0;
  if (mode === 'settle') {
    const p = settleMs <= 0 ? 1 : Math.min(1, (now - settleStart) / settleMs);
    s = settleFrom + (settleTo - settleFrom) * easeOutCubic(p);
    if (p >= 1) {
      s = settleTo;
      mode = 'idle';
      velocity = 0;
      announceSnap();
    }
  }
  paint();
  if (mode !== 'idle') schedule();
}

function schedule(): void {
  if (!rafId) rafId = requestAnimationFrame(frame);
}

function announceSnap(): void {
  if (HAPTIC_ON_SNAP && typeof navigator.vibrate === 'function') navigator.vibrate(VIBRATE_MS);
  const week = visibleRange().first;
  for (const fn of snapListeners) fn(week);
}

function settleToward(target: number, distanceOverride?: number): void {
  settleFrom = s;
  settleTo = target;
  settleStart = performance.now();
  const distance = distanceOverride ?? Math.abs(target - s);
  settleMs = Math.min(SETTLE_MAX_MS, SETTLE_BASE_MS + distance * SETTLE_PER_WEEK_MS);
  mode = 'settle';
  schedule();
}

// -- input -------------------------------------------------------------------

function onPointerDown(e: PointerEvent): void {
  if (dragPointer !== -1) return;
  dragPointer = e.pointerId;
  dragLastY = e.clientY;
  dragStartY = e.clientY;
  dragLastT = e.timeStamp;
  dragMoved = 0;
  velocity = 0;
  mode = 'drag';
  (e.target as Element).setPointerCapture?.(e.pointerId);
}

function onPointerMove(e: PointerEvent): void {
  if (e.pointerId !== dragPointer) return;
  const dy = e.clientY - dragLastY;
  const dt = Math.max(1, e.timeStamp - dragLastT);
  dragLastY = e.clientY;
  dragLastT = e.timeStamp;
  dragMoved = Math.abs(e.clientY - dragStartY);

  const ds = -dy / rowH;
  s += ds;
  // Smoothed so a single jittery sample cannot dominate the fling.
  velocity = velocity * 0.7 + (ds / dt) * 0.3;
  schedule();
}

function onPointerUp(e: PointerEvent): void {
  if (e.pointerId !== dragPointer) return;
  dragPointer = -1;
  if (dragMoved <= TAP_SLOP_PX) {
    mode = 'idle';
    handleTap(e);
    return;
  }
  settleToward(nearestDetent(s + velocity * PROJECT_MS));
}

function handleTap(e: PointerEvent): void {
  const target = e.target as Element | null;
  const row = target?.closest<HTMLElement>('.week');
  const col = target?.closest<HTMLElement>('.col');
  if (!row || !col) return;
  const week = Number(row.dataset.week);
  if (Number.isNaN(week)) return;
  const day = dayAt(week as WeekIndex, Number(col.dataset.dow) as DayOffset);
  for (const fn of dayTapListeners) fn(day);
}

function onWheel(e: WheelEvent): void {
  e.preventDefault();
  const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  s += (px / rowH) * WHEEL_GAIN;
  mode = 'idle';
  velocity = 0;
  paint();
  clearTimeout(wheelTimer);
  wheelTimer = window.setTimeout(() => settleToward(nearestDetent(s)), WHEEL_IDLE_MS);
}

function onResize(): void {
  measure();
  ensurePool();
  poolWeek = poolWeek.map(() => Number.NaN);
  paint();
}

// -- public interface --------------------------------------------------------

/** Mount the scroller. Rests on the month boundary nearest today. */
export function initScroll(container: HTMLElement): void {
  host = container;
  rows = document.createElement('div');
  rows.className = 'rows';
  host.replaceChildren(rows);

  measure();
  ensurePool();

  host.addEventListener('pointerdown', onPointerDown);
  host.addEventListener('pointermove', onPointerMove);
  host.addEventListener('pointerup', onPointerUp);
  host.addEventListener('pointercancel', onPointerUp);
  host.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', onResize);

  scrollToWeek(0 as WeekIndex, false);
}

/** Force the header to repaint — used when returning from the year view. */
export function invalidateHeader(): void {
  lastLabelKey = '';
  paint();
}

/** The week rows currently realized in the DOM. */
export function renderWindow(): WeekRange {
  const first = Math.floor(s) - BUFFER_ROWS;
  return { first: first as WeekIndex, last: (first + capacity() - 1) as WeekIndex };
}

/** The first week currently in view. */
export function dockedWeek(): WeekIndex {
  return visibleRange().first;
}

/** Animate the given week into view and settle on the nearest month detent. */
export function scrollToWeek(week: WeekIndex, animate: boolean): void {
  const centred = week + 0.5 - visibleWeeks / 2;
  const target = nearestDetent(centred);
  if (!animate) {
    s = target;
    mode = 'idle';
    paint();
    announceSnap();
    return;
  }
  // Long jumps must not take forever: cap the perceived distance.
  settleToward(target, Math.min(Math.abs(target - s), 9));
}

/** Fires whenever the view settles on a month detent. */
export function onDockChange(fn: (week: WeekIndex) => void): void {
  snapListeners.push(fn);
}

/** Fires when the realized week window shifts, so months can be prefetched. */
export function onWindowChange(fn: (range: WeekRange) => void): void {
  windowListeners.push(fn);
}

/** Snap granularity in days. Re-snaps to the nearest anchor under the new step. */
export function setSnapStep(days: SnapStep): void {
  if (days === snapStepDays) return;
  snapStepDays = days;
  settleToward(nearestDetent(s));
}

export function snapStep(): SnapStep {
  return snapStepDays;
}

/** A day tapped in the calendar. Stage 04 wires this to the drawer. */
export function onDayTap(fn: (day: DayNumber) => void): void {
  dayTapListeners.push(fn);
}
