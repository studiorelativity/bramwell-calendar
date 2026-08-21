// STAGE 03 — virtualizer, detent/snap physics, lens interpolation.
// Owns the scroll position and the render window; render.ts does the painting.
// Transform-based positioning only: every measurement is cached at resize, so
// the frame loop performs no layout reads.

import { applyLens, createWeekNode, renderMonthHeader, renderWeekRow } from './render.ts';
import { dayAt } from './state.ts';
import type { DayNumber, DayOffset, WeekIndex, WeekRange } from './types.ts';

// -- tuning ------------------------------------------------------------------
// Everything here was set by feel; see 03_engine/output/verification.md.

/** Lens height as a fraction of viewport. Proportional, never fixed px. */
const LENS_FRACTION = 0.35;
/** Compressed row height. Spec allows ~16-24px. */
const COMPRESSED_H = 20;
/** Detent granularity: the lens holds a two-week pair, so docks are 2 apart. */
const DETENT_WEEKS = 2;
/** How far momentum is projected before quantizing to a detent. */
const PROJECT_MS = 260;
/** Settle duration = base + per-week, clamped. */
const SETTLE_BASE_MS = 270;
const SETTLE_PER_WEEK_MS = 85;
const SETTLE_MAX_MS = 720;
/** Wheel travel is coarser than touch; scale it down. */
const WHEEL_GAIN = 0.55;
/** Quiet period after the last wheel event before settling. */
const WHEEL_IDLE_MS = 130;
/** Rows rendered beyond each viewport edge. */
const BUFFER_ROWS = 3;
/** Movement under this many px on release is a tap, not a drag. */
const TAP_SLOP_PX = 6;
const VIBRATE_MS = 8;

type Mode = 'idle' | 'drag' | 'settle';

// -- module state ------------------------------------------------------------

let host: HTMLElement | null = null;
let rows: HTMLElement | null = null;
let pool: HTMLElement[] = [];
let poolWeek: number[] = [];

let viewportH = 0;
let lensH = 0;
let lensRowH = 0;
let lensTop = 0;
let upCount = 0;
let downCount = 0;

/** Continuous week position: the week sitting at the top of the lens. */
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
let lastDocked = Number.NaN;
let lastWindowKey = '';

const dockListeners: Array<(week: WeekIndex) => void> = [];
const windowListeners: Array<(range: WeekRange) => void> = [];
const dayTapListeners: Array<(day: DayNumber) => void> = [];
/** Latest lens value per realized week, for tap routing. */
const lensOf = new Map<number, number>();

// -- lens geometry -----------------------------------------------------------

function smoothstep(x: number): number {
  const c = x < 0 ? 0 : x > 1 ? 1 : x;
  return c * c * (3 - 2 * c);
}

/**
 * How far week `w` is lifted into the lens, as a continuous function of its
 * distance from the lens top. 1 across the two docked rows, easing to 0 one
 * week beyond either edge.
 */
function lift(distance: number): number {
  if (distance >= 0 && distance <= 1) return 1;
  if (distance < 0) return smoothstep(1 + distance);
  return smoothstep(2 - distance);
}

function heightOf(week: number): number {
  return COMPRESSED_H + (lensRowH - COMPRESSED_H) * lift(week - s);
}

function quantize(x: number): number {
  return Math.round(x / DETENT_WEEKS) * DETENT_WEEKS;
}

function measure(): void {
  viewportH = window.innerHeight;
  lensH = viewportH * LENS_FRACTION;
  lensRowH = lensH / 2;
  lensTop = (viewportH - lensH) / 2;
  upCount = Math.ceil(lensTop / COMPRESSED_H) + BUFFER_ROWS + 2;
  downCount = Math.ceil((viewportH - lensTop) / COMPRESSED_H) + BUFFER_ROWS + 2;
}

/**
 * Pool size follows the viewport rather than the spec's flat "~40": at
 * 20px compressed rows a 1200px-tall window needs ~66 rows to fill, and 40
 * would leave the bottom of a desktop screen empty.
 */
function ensurePool(): void {
  const capacity = upCount + downCount + 1;
  if (!rows) return;
  if (pool.length === capacity) return;
  for (const node of pool) node.remove();
  pool = [];
  poolWeek = [];
  for (let i = 0; i < capacity; i += 1) {
    const node = createWeekNode();
    pool.push(node);
    poolWeek.push(Number.NaN);
  }
  rows.replaceChildren(...pool);
}

function slotFor(week: number): number {
  const n = pool.length;
  return ((week % n) + n) % n;
}

// -- the frame ---------------------------------------------------------------

function paint(): void {
  if (!rows) return;
  const i0 = Math.floor(s);
  const f = s - i0;
  const firstWeek = i0 - upCount;
  const lastWeek = i0 + downCount;

  // Anchor: the continuous point `s` sits exactly at the top of the lens.
  const heights: number[] = [];
  for (let w = firstWeek; w <= lastWeek; w += 1) heights[w - firstWeek] = heightOf(w);

  let y = lensTop - f * heights[i0 - firstWeek];
  const tops: number[] = [];
  tops[i0 - firstWeek] = y;
  for (let w = i0 + 1; w <= lastWeek; w += 1) {
    y += heights[w - 1 - firstWeek];
    tops[w - firstWeek] = y;
  }
  y = tops[i0 - firstWeek];
  for (let w = i0 - 1; w >= firstWeek; w -= 1) {
    y -= heights[w - firstWeek];
    tops[w - firstWeek] = y;
  }

  lensOf.clear();
  for (let w = firstWeek; w <= lastWeek; w += 1) {
    const idx = w - firstWeek;
    const slot = slotFor(w);
    const node = pool[slot];
    if (poolWeek[slot] !== w) {
      poolWeek[slot] = w;
      renderWeekRow(w as WeekIndex, node);
    }
    const t = lift(w - s);
    lensOf.set(w, t);
    applyLens(node, t, heights[idx], tops[idx]);
  }

  const key = `${firstWeek}:${lastWeek}`;
  if (key !== lastWindowKey) {
    lastWindowKey = key;
    const range: WeekRange = { first: firstWeek as WeekIndex, last: lastWeek as WeekIndex };
    for (const fn of windowListeners) fn(range);
  }

  const docked = Math.round(s);
  if (docked !== lastDocked) {
    lastDocked = docked;
    renderMonthHeader(docked as WeekIndex);
    for (const fn of dockListeners) fn(docked as WeekIndex);
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
      dock();
    }
  }
  paint();
  if (mode !== 'idle') schedule();
}

function schedule(): void {
  if (!rafId) rafId = requestAnimationFrame(frame);
}

function dock(): void {
  if (typeof navigator.vibrate === 'function') navigator.vibrate(VIBRATE_MS);
}

function settleTo_(target: number, distanceOverride?: number): void {
  settleFrom = s;
  settleTo = target;
  settleStart = performance.now();
  const distance = distanceOverride ?? Math.abs(target - s);
  settleMs = Math.min(SETTLE_MAX_MS, SETTLE_BASE_MS + distance * SETTLE_PER_WEEK_MS);
  mode = 'settle';
  schedule();
}

function releaseToDetent(): void {
  const projected = s + velocity * PROJECT_MS;
  settleTo_(quantize(projected));
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

  const ds = -dy / lensRowH;
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
  releaseToDetent();
}

function handleTap(e: PointerEvent): void {
  const target = e.target as Element | null;
  const row = target?.closest<HTMLElement>('.week');
  if (!row) return;
  const week = Number(row.dataset.week);
  if (Number.isNaN(week)) return;

  // A compressed week scrolls into the lens instead of opening anything.
  if ((lensOf.get(week) ?? 0) < 0.5) {
    scrollToWeek(week as WeekIndex, true);
    return;
  }
  const col = target?.closest<HTMLElement>('.col');
  if (!col) return;
  const offset = Number(col.dataset.dow) as DayOffset;
  const day = dayAt(week as WeekIndex, offset);
  for (const fn of dayTapListeners) fn(day);
}

function onWheel(e: WheelEvent): void {
  e.preventDefault();
  const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  s += (px / lensRowH) * WHEEL_GAIN;
  mode = 'idle';
  velocity = 0;
  schedule();
  paint();
  clearTimeout(wheelTimer);
  wheelTimer = window.setTimeout(() => settleTo_(quantize(s)), WHEEL_IDLE_MS);
}

function onResize(): void {
  measure();
  ensurePool();
  poolWeek = poolWeek.map(() => Number.NaN);
  paint();
}

// -- public interface --------------------------------------------------------

/** Mount the scroller. Docks the current week + next, per the spec. */
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

  s = 0;
  paint();
}

/** The week rows currently realized in the DOM. */
export function renderWindow(): WeekRange {
  const i0 = Math.floor(s);
  return { first: (i0 - upCount) as WeekIndex, last: (i0 + downCount) as WeekIndex };
}

/** The week pair currently docked in the lens. */
export function dockedWeek(): WeekIndex {
  return Math.round(s) as WeekIndex;
}

/** Animate to a week and re-dock. Used by the Today button and week taps. */
export function scrollToWeek(week: WeekIndex, animate: boolean): void {
  const target = quantize(week);
  if (!animate) {
    s = target;
    mode = 'idle';
    paint();
    dock();
    return;
  }
  // Long jumps must not take forever: cap the perceived distance.
  settleTo_(target, Math.min(Math.abs(target - s), 6));
}

/** Fires whenever the docked week changes, for the month header cross-fade. */
export function onDockChange(fn: (week: WeekIndex) => void): void {
  dockListeners.push(fn);
}

/** Fires when the realized week window shifts, so months can be prefetched. */
export function onWindowChange(fn: (range: WeekRange) => void): void {
  windowListeners.push(fn);
}

/** A day tapped inside the lens. Stage 04 wires this to the drawer. */
export function onDayTap(fn: (day: DayNumber) => void): void {
  dayTapListeners.push(fn);
}
