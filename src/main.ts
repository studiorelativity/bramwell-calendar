// STAGE 01/02/03 — bootstrapping and wiring.

import './style.css';
import { isSignedIn, signIn } from './auth.ts';
import { invalidateWeeks, mountedWeeks } from './render.ts';
import {
  initScroll,
  onDayTap,
  onDockChange,
  onWindowChange,
  renderWindow,
  scrollToWeek,
  setSnapStep,
} from './scroll.ts';
import type { SnapStep } from './scroll.ts';
import {
  anchorToToday,
  dayAt,
  ensureMonthsFor,
  onCacheChange,
  prefs,
  savePrefs,
  selfTest,
} from './state.ts';
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

  // Months arrive lazily as the window moves; state.ts adds the 8-week margin.
  onWindowChange((range) => ensureMonthsFor(range));
  ensureMonthsFor(renderWindow());

  // A month landing in the cache repaints only the rows that are realized.
  onCacheChange(() => invalidateWeeks(mountedWeeks()));

  onDockChange((week: WeekIndex) => savePrefs({ lastDockedDay: dayAt(week, 0) }));

  // STAGE 04 wires this to the day drawer.
  onDayTap((day) => console.log('day tapped', day));

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

// STAGE 04: register the service worker, wire onDayTap to the drawer.
