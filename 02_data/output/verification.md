# Stage 02 — Verification

Date: 2026-08-20 · Implements `auth.ts`, `gcal.ts`, `categories.ts`, `state.ts`

## Gate (human, in browser, real account) — NOT YET RUN

The gate is entirely human-in-browser against a real Google account. Nothing
below can be self-certified; the checklist is at the end of this file.

| Gate criterion | Status |
|---|---|
| Sign in works; token renews quietly on reload | **Awaiting human** |
| A month fetch logs real events, including a paginated month | **Awaiting human** (pagination logic proven against a stub — see below) |
| Category mapping round-trips; colors correct in the Google Calendar app | **Awaiting human** (mapping + colorId payload proven against a stub) |
| Week-index selftest passes across a year and a DST boundary | **Pass — 9/9**, run against the real module |

## Automated evidence

**Week-index selftest — 9/9.** `state.selfTest()`, exposed in the browser at
`/?selftest` and also run headlessly against the real `src/state.ts`:

```
PASS  civil round-trip                8 dates incl. leap day 2028-02-29
PASS  epoch anchoring                 1970-01-01=0, 2026-12-28=20815
PASS  weekday vs platform oracle      801 days cross-checked against Date.getUTCDay
PASS  Monday starts the week          offsets 0, 6
PASS  year boundary holds one week row 2026-12-28..2027-01-03 = one row; 01-04 = next
PASS  DST-safe day stepping           730 local days in America/Chicago
PASS  weekOf/dayAt round-trip         209 weeks x 7 days, both directions
PASS  week 0 contains today           weekOf(today)=0
PASS  month keys span the boundary    2026-12, 2027-01
```

The DST test is the load-bearing one: it walks two years of *local* calendar
days and requires every step to be exactly one DayNumber. That is what catches
millisecond arithmetic on local `Date`s, where a transition day is 23 or 25
hours long. The civil math uses `Date.UTC` on y/m/d components, so it is
immune by construction — the test proves it stays that way.

**gcal.ts — 12/12**, with `fetch` stubbed. Run against a copy of `gcal.ts`
whose only difference is the `./auth.ts` import (diffed to confirm the logic
is byte-identical). This is not part of the gate; it exists because the
all-day off-by-one would otherwise surface as corrupted data during the
human gate:

```
PASS  all-day single day is start===end
PASS  all-day 3-day span is inclusive (20th..22nd)   naive port would give the 23rd
PASS  all-day round-trip internal -> wire -> internal is identity
PASS  create sends exclusive end date                2026-08-20 / 2026-08-23
PASS  create sends the category colorId
PASS  colorId -> category
PASS  cancelled events dropped
PASS  timed event maps to day + minutes
PASS  follows nextPageToken to exhaustion
PASS  list uses singleEvents + orderBy + maxResults
PASS  instance delete targets the occurrence id
PASS  series delete targets the parent id
```

Also verified: RFC3339 with local offset on the wire
(`timeMin=2026-08-01T00:00:00-05:00`), `tsc --noEmit` clean under `strict`,
`npm run build` clean, all five modules serve over the dev server.

## Decisions the spec left open

1. **`getToken(forceRefresh = false)`.** The spec says auth exports *exactly*
   `getToken`, `signIn`, `isSignedIn`, and separately that any 401 must clear
   the token. Those conflict: `gcal.ts` sees the 401 but had no way to
   invalidate a token that is still unexpired by its own clock. An optional
   parameter resolves it without adding an export — the exported *names* are
   exactly the three specified.

2. **Quiet renewal failure does not auto-escalate to a popup.** The spec says
   "interactive on failure". A browser blocks `requestAccessToken` outside a
   user gesture, so auto-escalation would fail silently. Instead a failed
   quiet renewal leaves `isSignedIn()` false, which surfaces the header's
   sign-in button, and the user's click is the gesture. Still "never a dead
   state", by the only route the browser allows.

3. **The GIS `<script>` tag lives in `index.html`.** Stage 02 forbids DOM code
   in these modules, so `auth.ts` cannot inject it; `auth.ts` polls for the
   `window.google` global instead. This slightly softens "auth.ts is the only
   file that knows about auth" — index.html carries one script tag — but the
   no-DOM constraint is the more specific rule and no auth *logic* leaves
   `auth.ts`.

4. **Civil-date math is duplicated, two lines, in `gcal.ts` and `state.ts`.**
   The right answer is a shared `dates.ts`, which the spec's file layout does
   not permit. Splitting it by boundary instead — `gcal.ts` owns wire <->
   DayNumber (spec), `state.ts` owns DayNumber <-> WeekIndex (conventions) —
   keeps the dependency graph acyclic (`state -> gcal`, never the reverse).
   The alternative, importing helpers from `state.ts` into `gcal.ts`, creates
   a genuine import cycle. → Same upstream-fix candidate as `style.css`.

5. **`state.onCacheChange(fn)` added.** Not in the contract, but "render from
   cache instantly, background-refresh visible months" needs a repaint signal
   for stage 03's `render.invalidateWeeks`. No DOM in `state.ts`; it just
   calls listeners with the month keys that changed.

6. **Timed events carry a `start` and `end` DayNumber**, so an event crossing
   midnight is representable. Stage 03 renders it on its start day per the
   spec's "thin bar segment on their day only".

7. **Cache is keyed `bramwell.cache.v1` / `bramwell.prefs.v1`**, with
   `EventCache.version` checked on load and the cache discarded on mismatch.
   Quota failures are swallowed — the cache is an optimization, never the
   source of truth.

8. **`today()` is captured at anchor time, not read live.** Re-anchoring
   mid-session would shift every WeekIndex under the scroller. A session left
   open across midnight keeps its anchor until reload.

## Deviation to watch

`MAX_RESULTS` in `gcal.ts` is a module constant marked `// gate:` — lower it
to force pagination on an ordinary month during the gate, then restore it.
No runtime override was added; the spec says "no caps" in production.

## Human gate checklist

Requires `npm run dev` and a real Google account.

1. `/?selftest` → expect 9/9 PASS. **Do this first**; everything downstream
   depends on the week math.
2. `/` → click sign in → consent → `isSignedIn()` true. Reload → token renews
   quietly, no second consent prompt.
3. In the console: `(await import('/src/state.ts')).ensureMonthsFor({first:0,last:0})`,
   then `monthState('2026-08')` → `'ready'`, and `eventsForWeek(0)` → your real
   events for this week.
4. Pagination: lower `MAX_RESULTS` to 5 in `gcal.ts`, re-run the fetch on a
   month with more than 5 events, confirm all of them come back. Restore it.
5. Create one event per category; confirm all four colors in the Google
   Calendar app.
6. Create a 3-week all-day commitment; confirm in Google Calendar that it ends
   on the day you chose and **not** a day later — the exclusive-end conversion.
7. Edit one occurrence of a weekly event; delete the series with confirmation.

Steps 5-7 have no UI until stage 04; drive them from the console against
`gcal.ts` directly, or defer them to the stage 04 gate. Flag which you chose
in this file before starting stage 03.
