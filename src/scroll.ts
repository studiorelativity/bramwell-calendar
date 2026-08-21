// STAGE 03 — virtualizer, detent/snap physics, lens interpolation.
// Owns the scroll position and the render window; asks render.ts to paint.
// Transform-based positioning only: no layout reads in the scroll handler.

import type { WeekIndex, WeekRange } from './types.ts';

const TODO = 'STAGE 03: not implemented';

/** Mount the scroller and start the rAF loop. */
export function initScroll(_host: HTMLElement): void {
  throw new Error(TODO);
}

/** The ~40 week rows currently realized in the DOM. */
export function renderWindow(): WeekRange {
  throw new Error(TODO);
}

/** The week pair currently docked in the lens. */
export function dockedWeek(): WeekIndex {
  throw new Error(TODO);
}

/** Animate to a week and re-dock. Used by the Today button and week taps. */
export function scrollToWeek(_week: WeekIndex, _animate: boolean): void {
  throw new Error(TODO);
}

/** Fires whenever the docked week changes, for the month header cross-fade. */
export function onDockChange(_fn: (week: WeekIndex) => void): void {
  throw new Error(TODO);
}
