# Stage 02 — Data Layer

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — sections **"Auth (src/auth.ts)"**,
  **"Calendar API (src/gcal.ts)"**, **"Categories (src/categories.ts)"**,
  and the localStorage-cache portion of **"Perpetual scroll mechanics"**
  (lazy month loading, cache-then-refresh)
- L3: `../_references/year-planner-v2.html` — the API-call logic, optimistic
  write/rollback pattern, and category mapping only. Ignore all layout and
  DOM code.
- L4: `src/types.ts` (from 01)

## Process
1. `src/auth.ts` — GIS token client per spec. Exports exactly `getToken`,
   `signIn`, `isSignedIn`. Quiet renewal, interactive on failure, 401 → clear
   token and surface sign-in. No dead states.
2. `src/gcal.ts` — list-month (pagination to exhaustion), create (all-day
   end-date exclusive/inclusive conversion), patch (instance vs. series),
   delete (instance vs. series), retry-once-with-backoff on 403/5xx.
   The only file making network calls.
3. `src/categories.ts` — the four colorId mappings from the spec, unknown → other.
4. `src/state.ts` — per `year-month` localStorage cache, week-index math
   (week 0 = week containing today, negative = past), fetch-when-within-8-weeks
   trigger logic, optimistic pending/reconcile/rollback state.

## Constraints
- No DOM code in any of these modules. Rendering consumes state; state never
  touches rendering.
- Week-index math gets unit-style assertions runnable in dev (a `?selftest`
  query param is fine) — off-by-one here corrupts everything downstream.

## Outputs
- Implemented `auth.ts`, `gcal.ts`, `categories.ts`, `state.ts`
- `output/verification.md`

## Gate (human, in browser, real account)
- Sign in works; token renews quietly on reload
- A month fetch logs real events including a paginated month (>250 events
  can be simulated by lowering maxResults temporarily)
- Category mapping round-trips: create with each category, colors correct
  in the Google Calendar app
- Week-index selftest passes across a year boundary and a DST boundary
