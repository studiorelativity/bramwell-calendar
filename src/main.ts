// STAGE 01/02/03 — bootstrapping and wiring. Stage 05 added the chrome:
// first-run screen, settings sheet, FAB, avatar/connection state.

import './style.css';
import { isSignedIn } from './auth.ts';
import { initChrome, setAuthState } from './chrome.ts';
import {
  closeDrawer,
  isOpen as drawerOpen,
  openAdd,
  openDay,
  refresh as refreshDrawer,
} from './drawer.ts';
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
  monthOf,
  monthState,
  onCacheChange,
  prefs,
  savePrefs,
  selfTest,
  today,
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

  // --- chrome (stage 05) ----------------------------------------------------
  // Snap granularity lives in Settings now; persistence happens in chrome.ts.
  setSnapStep(prefs().snapStepDays ?? 30);

  // The FAB's date: the day nearest the viewport centre in the calendar
  // (the docked anchor's mid-week day), today in the year view.
  const addOnCenteredDay = (): void => {
    const day = view === 'year' ? today() : dayAt(dockedWeek(), 3);
    openAdd(day);
  };

  initChrome({
    onSnapChange: (days: SnapStep) => setSnapStep(days),
    onViewChange: (next) => setView(next),
    onAdd: addOnCenteredDay,
  });

  // Desktop shortcut. Ignore it while typing or while the drawer is open —
  // 'n' in an event title must stay a letter.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target as HTMLElement | null;
    if (target && ('value' in target || target.isContentEditable)) return;
    if (drawerOpen()) return;
    addOnCenteredDay();
  });

  // Launch on the persisted default view (first load still rests on the
  // boundary nearest today — setView('calendar') is a no-op on the scroller).
  const startView = prefs().defaultView ?? 'calendar';
  if (startView !== 'calendar') setView(startView);

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

  // --- auth-driven shell (stage 05) -----------------------------------------
  // auth.ts exports no change event by design, so poll it (a second's lag is
  // invisible). Warm cache = any month in the render window is resident;
  // that decides first-run screen vs read-only calendar + reconnect pill.
  const warmCache = (): boolean => {
    const range = renderWindow();
    for (let week = range.first; week <= range.last; week++) {
      if (monthState(monthOf(dayAt(week as WeekIndex, 0))) === 'ready') return true;
      if (monthState(monthOf(dayAt(week as WeekIndex, 6))) === 'ready') return true;
    }
    return false;
  };

  // Grace period before judging a stale token: the first getToken() call
  // (fired by ensureMonthsFor above) quiet-renews for a returning user, and
  // flashing the reconnect pill during that beat would cry wolf.
  const bootedAt = Date.now();
  const AUTH_GRACE_MS = 2_500;

  let wasSignedIn = isSignedIn();
  const paintAuth = (): void => {
    const now = isSignedIn();
    const warm = warmCache();
    // Cold start (no cache) shows first-run immediately; only the stale-auth
    // pill over a warm cache waits out the quiet-renewal grace.
    const settled = now || !warm || Date.now() - bootedAt > AUTH_GRACE_MS;
    if (settled) setAuthState(now, warm);
    if (now && !wasSignedIn) ensureMonthsFor(renderWindow());
    wasSignedIn = now;
  };
  setInterval(paintAuth, 1000);
  paintAuth();
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
