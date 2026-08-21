// STAGE 03 — week rows, bars, lane packing, month labels, sticky header.
// Pure paint: recycles the DOM nodes scroll.ts hands it, reads events from
// state.ts, never fetches and never owns scroll position.

import type { WeekIndex } from './types.ts';

const TODO = 'STAGE 03: not implemented';

/** Build (or recycle) the element for one week row. */
export function renderWeekRow(_week: WeekIndex, _node: HTMLElement): void {
  throw new Error(TODO);
}

/** Apply lens interpolation to a row: height, elevation, title visibility. */
export function applyLens(_node: HTMLElement, _t: number): void {
  throw new Error(TODO);
}

/** Cross-fade the sticky month + year strip to the docked week's month. */
export function renderMonthHeader(_week: WeekIndex): void {
  throw new Error(TODO);
}

/** Repaint rows whose month just arrived from the cache. */
export function invalidateWeeks(_weeks: readonly WeekIndex[]): void {
  throw new Error(TODO);
}
