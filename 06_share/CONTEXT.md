# Stage 06 — Share: Demo Mode + Open Source

**Status: APPROVED 2026-08-23.** Lane decision by the human: demo mode +
open source now; Google OAuth verification deferred until traction. Spec
gained the "Demo mode" section and its Definition-of-done item before this
stage ran (fix-upstream rule).

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — sections **"Demo mode"** (new),
  **"First-run and connection state"**, **"MANUAL SETUP"**, **"DEPLOY"**
  (the last two feed the README's deploy-your-own guide)
- L3: `../_references/conventions.md`
- L4: everything built in 01–05

## Process
1. **Demo in `state.ts`** — this stage authorizes modifying it (04
   precedent): `enterDemo()` seeds a deterministic ~17 months of events
   (seeded PRNG, anchored to today) in memory and marks them ready;
   `exitDemo()` drops them and reloads the real cache from localStorage;
   `isDemo()`. Guards: `ensureMonthsFor` and `persist` no-op in demo;
   `createEvent`/`updateEvent`/`deleteEvent` reject with a `DemoError`
   BEFORE the optimistic apply. Seed content must exercise every render
   path: a 3-week wrapping bar, recurring timed chips, all four
   categories, weekend spans, a couple of dense days.
2. **Demo in `chrome.ts`**: "Try the demo" secondary action on the
   first-run screen; a "Demo · Connect" pill in place of the avatar while
   demo is active (click → exit demo + `signIn()`).
3. **Wiring in `main.ts`**: `?demo` enters demo at boot; the auth poll
   passes demo state to the chrome; signing in mid-demo exits demo before
   the real fetch.
4. **README.md** at repo root: what it is, the demo link, the rig
   architecture story (stage folders as the build record), dev
   quickstart, deploy-your-own (own OAuth client per MANUAL SETUP; own
   Pages project per DEPLOY), license note.
5. **LICENSE**: MIT unless the human says otherwise.
6. **Repo hygiene**: confirm nothing tracked is secret (`.env.local`
   ignored; the OAuth client ID is public by design — the origin
   allowlist is the boundary, per DEPLOY).

## Constraints
- Module boundaries hold. `gcal.ts` untouched; no demo code below the
  state boundary. The demo seed lives in `state.ts` because the cache is
  its property; nothing else may fabricate cache entries.
- Demo must be indistinguishable from real usage in the render pipeline —
  render/scroll/year/drawer code must not know demo exists.
- Zero network in demo: no googleapis.com, no gsi/client dependency for
  the demo path (the GIS script may still load; it must not be required).
- Deterministic seed: two visitors on the same day see the same calendar.

## Outputs
- Demo mode across `state.ts` / `chrome.ts` / `main.ts`
- `README.md`, `LICENSE`
- `output/verification.md`

## Gate (human)
- `?demo` on the deployed site: populated calendar, no sign-in, devtools
  Network shows zero googleapis.com requests.
- The 3-week bar wraps; year view and hover panel populated; drawer lists
  a dense day correctly.
- Save attempt in demo: form error + toast with the demo message; list
  unchanged afterward.
- "Demo · Connect" exits to real sign-in; after connecting, real events
  replace the seed with no reload.
- Reload after demo: back to first-run (nothing persisted).
- README's deploy-your-own followed cold (fresh Google Cloud project) by
  the human once, to prove the instructions stand alone.
- GitHub repo public with README rendering correctly.
