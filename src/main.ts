// STAGE 01/02 — bootstrapping and wiring. Grows as each stage lands.

import { anchorToToday, selfTest } from './state.ts';

/** Dev-only: `?selftest` runs the week-index assertions and prints them. */
function runSelfTest(): void {
  const results = selfTest();
  const failed = results.filter((r) => !r.ok);

  const list = document.createElement('pre');
  list.style.cssText = 'padding:1.5rem;font:13px/1.7 ui-monospace,monospace;white-space:pre-wrap';
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

anchorToToday();

if (new URLSearchParams(location.search).has('selftest')) {
  runSelfTest();
}

// STAGE 03: initScroll on #calendar, dock to prefs.lastDockedDay, wire sign-in.
// STAGE 04: register the service worker, wire day taps to the drawer.
