// STAGE 01/02/03 — bootstrapping and wiring.

import './style.css';
import { isSignedIn, signIn } from './auth.ts';
import { closeDrawer, isOpen as drawerOpen, openDay, refresh as refreshDrawer } from './drawer.ts';
import { invalidateWeeks, mountedWeeks, setHeaderLabel } from './render.ts';
import {
  initScroll,
  onDayTap,
  onDockChange,
  onWindowChange,
  renderWindow,
  scrollToWeek,
  setSnapStep,
  dockedWeek,
  invalidateHeader,
} from './scroll.ts';
import type { SnapStep } from './scroll.ts';
import {
  anchorToToday,
  civilFromDay,
  dayAt,
  dayFromCivil,
  ensureMonthsFor,
  markAllStale,
  onCacheChange,
  prefs,
  savePrefs,
  selfTest,
  weekOf,
} from './state.ts';
import { currentYear, initYear, onYearDayClick, renderYear } from './year.ts';
import type { WeekIndex } from './types.ts';

/** Dev-only: `?selftest` runs the week-index assertions and prints them. */
function runSelfTest(): void {
  const results = selfTest();
  const failed = results.filter((r) => !r.ok);

  const list = document.createElement('pre');
  list.className = 'selftest';
  list.textContent = results
    .map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`)
    .join('\n');
  list.textContent += `\n\n${results.length - failed.length}/${results.length} passed`;
  document.body.replaceChildren(list);

  for (const r of results) {
    if (r.ok) console.log(`PASS  ${r.name}  ${r.detail}`);
    else console.error(`FAIL  ${r.name}  ${r.detail}`);
  }
}

function boot(): void {
  const calendar = document.getElementById('calendar');
  if (!calendar) throw new Error('#calendar is missing from index.html');

  initScroll(calendar);

  const yearHost = document.getElementById('year');
  if (!yearHost) throw new Error('#year is missing from index.html');
  initYear(yearHost);

  // Months arrive lazily as the window moves; state.ts adds the 8-week margin.
  onWindowChange((range) => ensureMonthsFor(range));
  ensureMonthsFor(renderWindow());

  // --- view switching -------------------------------------------------------

  let view: 'calendar' | 'year' = 'calendar';
  const dowStrip = document.querySelector<HTMLElement>('.dow');
  const stepsGroup = document.querySelector<HTMLElement>('.steps');
  const yearNav = document.querySelector<HTMLElement>('.yearnav');
  const viewButtons = [...document.querySelectorAll<HTMLButtonElement>('.view')];

  /** Load the months a year needs, then paint it. */
  const showYear = (year: number): void => {
    ensureMonthsFor({
      first: weekOf(dayFromCivil(year, 1, 1)),
      last: weekOf(dayFromCivil(year, 12, 31)),
    });
    renderYear(year);
    setHeaderLabel(String(year));
  };

  const setView = (next: 'calendar' | 'year'): void => {
    view = next;
    const isYear = next === 'year';
    calendar.hidden = isYear;
    yearHost.hidden = !isYear;
    if (dowStrip) dowStrip.hidden = isYear;
    if (stepsGroup) stepsGroup.hidden = isYear;
    if (yearNav) yearNav.hidden = !isYear;
    for (const button of viewButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.view === next));
    }
    if (isYear) showYear(currentYear() || civilFromDay(dayAt(dockedWeek(), 3)).year);
    else invalidateHeader();
  };

  for (const button of viewButtons) {
    button.addEventListener('click', () => setView(button.dataset.view === 'year' ? 'year' : 'calendar'));
  }
  document.getElementById('year-prev')?.addEventListener('click', () => showYear(currentYear() - 1));
  document.getElementById('year-next')?.addEventListener('click', () => showYear(currentYear() + 1));

  // The year view is an overview: clicking a day returns to it in the calendar.
  onYearDayClick((day) => {
    setView('calendar');
    scrollToWeek(weekOf(day), false);
  });

  // Column count depends on width, so a resize needs a repaint.
  window.addEventListener('resize', () => {
    if (view === 'year') renderYear(currentYear());
  });

  // A month landing in the cache repaints whichever view is showing. Opening
  // the year view requests ~14 months, so filter to the ones that can change
  // what is on screen rather than rebuilding 392 cells per arrival.
  onCacheChange((months) => {
    // No-op while the drawer's form is showing — a month arriving must never
    // wipe what is being typed.
    refreshDrawer();
    if (view !== 'year') {
      invalidateWeeks(mountedWeeks());
      return;
    }
    const year = currentYear();
    const touches = months.some((key) => {
      const y = Number(key.slice(0, 4));
      return y >= year - 1 && y <= year + 1;
    });
    if (touches) renderYear(year);
  });

  onDockChange((week: WeekIndex) => savePrefs({ lastDockedDay: dayAt(week, 0) }));

  onDayTap((day) => openDay(day));

  // 15/30/45 snap granularity, persisted.
  const stepButtons = [...document.querySelectorAll<HTMLButtonElement>('.step')];
  const applyStep = (days: SnapStep, persist: boolean): void => {
    setSnapStep(days);
    for (const button of stepButtons) {
      button.setAttribute('aria-pressed', String(Number(button.dataset.step) === days));
    }
    if (persist) savePrefs({ snapStepDays: days });
  };
  for (const button of stepButtons) {
    button.addEventListener('click', () => applyStep(Number(button.dataset.step) as SnapStep, true));
  }
  applyStep(prefs().snapStepDays ?? 30, false);

  // --- offline -------------------------------------------------------------

  const offlinePill = document.getElementById('offline-pill');
  const paintOnline = (): void => {
    if (offlinePill) offlinePill.hidden = navigator.onLine;
  };
  window.addEventListener('offline', paintOnline);
  window.addEventListener('online', () => {
    paintOnline();
    // Everything resident is now suspect; refresh what is on screen and let
    // the rest refresh as it is approached.
    markAllStale();
    ensureMonthsFor(renderWindow());
  });
  paintOnline();

  // Escape closes the form first, then the drawer — ported from v2.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawerOpen()) closeDrawer();
  });

  const todayBtn = document.getElementById('today-btn');
  todayBtn?.addEventListener('click', () => scrollToWeek(0 as WeekIndex, true));

  const signInBtn = document.getElementById('signin-btn');
  signInBtn?.addEventListener('click', () => signIn());

  // auth.ts exports no change event by design, so poll it: the button is the
  // only thing that depends on sign-in state, and a second's lag is invisible.
  let wasSignedIn = isSignedIn();
  setInterval(() => {
    const now = isSignedIn();
    if (signInBtn) signInBtn.hidden = now;
    if (now && !wasSignedIn) ensureMonthsFor(renderWindow());
    wasSignedIn = now;
  }, 1000);
  if (signInBtn) signInBtn.hidden = wasSignedIn;
}

/**
 * iOS Safari ignores `user-scalable=no` in the viewport meta, so the meta tag
 * alone does not stop double-tap zoom. `touch-action` plus these handlers do.
 * Without them a double-tap zooms in and the scroller swallows the gesture
 * that would zoom back out, stranding the page.
 */
function suppressBrowserZoom(): void {
  document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
  for (const name of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(name, (e) => e.preventDefault(), { passive: false });
  }
}

anchorToToday();
suppressBrowserZoom();

if (new URLSearchParams(location.search).has('selftest')) {
  runSelfTest();
} else {
  boot();
}

/**
 * The service worker is registered in production only. In dev, Vite serves
 * modules unbundled and a shell cache would serve stale code on every reload.
 */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js');
  });
}
