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
} from './scroll.ts';
import { anchorToToday, dayAt, ensureMonthsFor, onCacheChange, savePrefs, selfTest } from './state.ts';
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

anchorToToday();

if (new URLSearchParams(location.search).has('selftest')) {
  runSelfTest();
} else {
  boot();
}

// STAGE 04: register the service worker, wire onDayTap to the drawer.
