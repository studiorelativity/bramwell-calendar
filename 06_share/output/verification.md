# Stage 06 — Verification

Date: 2026-08-23 · Implements demo mode (`state.ts`, `chrome.ts`,
`main.ts`, styles), `README.md`, `LICENSE` (MIT).

## Gate — OPEN, awaiting human

Checklist at the end. The GitHub publish itself is a human step (repo
creation + push); everything the repo needs is in place.

## What was built

1. **Demo in `state.ts`** (authorized by the contract, 04 precedent):
   `enterDemo()` seeds ~490 days of deterministic events (mulberry32,
   fixed seed, anchored to today) into the in-memory cache and marks
   those months ready; `exitDemo()` drops them and reloads the real
   cache from localStorage; `isDemo()`. Guards: `persist()` and
   `ensureMonthsFor()` no-op in demo; `createEvent`/`updateEvent`/
   `deleteEvent` reject with `DemoError` ("Demo — connect your Google
   Calendar to save.") BEFORE the optimistic apply — nothing to roll
   back, list provably unchanged.
2. **Seed content** exercises every render path: a 21-day all-day span
   crossing three week rows; weekly recurring timed chips (Standup, with
   `recurringEventId`, so the drawer shows the scope picker); Gym/Dinner
   texture; monthly + quarterly financial all-days; Sat–Sun weekend
   spans; one dense day (today+3) that overflows the year cell's 3 bars.
   All four categories present.
3. **Entry/exit**: "Try the demo" on the first-run screen; `?demo` URL
   for direct sharing; "Demo · Connect" pill in the avatar's slot exits
   demo and starts real sign-in; signing in mid-demo (any path) exits
   demo in the auth poll before the real fetch. Demo never persists —
   reload lands on first-run.
4. **README** with the demo link, product summary, run/deploy-your-own
   (own OAuth client, Testing mode, origin allowlist), and the rig
   story — the stage folders are pitched as the build record, which is
   the honest differentiator for the open-source audience.
5. **LICENSE**: MIT, Studio Relativity. Swap the name if you want your
   legal name on it.

## Automated evidence

- `tsc --noEmit` clean under `strict`; `vite build` clean (16 modules).
- Module boundaries held: `gcal.ts` untouched; demo knowledge exists
  only in `state.ts` (owner of the cache), `chrome.ts` (entry/exit UI),
  `main.ts` (wiring). `render.ts`/`scroll.ts`/`year.ts`/`drawer.ts`
  unchanged this stage — the render pipeline cannot tell demo from real.
- Repo hygiene: `git ls-files` shows no secrets; `.env.local` ignored;
  the client ID appears in no tracked file.
- No headless browser in this environment — demo rendering, the
  no-network claim, and exit flow are the human gate's to confirm.

## Decisions the spec left open

1. **Unseeded months in demo stay empty** rather than erroring:
   `ensureMonthsFor` returns early, so scrolling past the ±8-month seed
   shows blank weeks. Honest and cheap; extend the seed range if it
   bites.
2. **`DemoError` rejects before the optimistic apply**, unlike
   `OfflineError` which fires after it. Offline proves rollback works;
   demo just needs a clear refusal — no flash of a phantom event.
3. **The demo pill sits in the avatar's slot** (avatar hidden in demo):
   there is no account, so account UI would lie; the pill is both the
   state label and the exit.
4. **Demo does not seed prefs** — snap/default-view changes in demo
   would persist to real prefs. Judged fine: they are harmless,
   user-intentional, and the settings sheet is unreachable in demo
   anyway (no avatar).
5. **README links the workers.dev demo URL** for now; swap to
   cal.no.fail (or whatever domain wins) when deployed there.

## Human gate checklist

1. Deploy, open `/?demo` in a private window: populated calendar,
   devtools Network filtered to `googleapis` shows **zero** requests.
2. The launch-runway bar wraps three rows; year view + hover panel
   populated; today+3 shows the drawer list and the year cell's +N
   overflow behavior (3 bars shown).
3. FAB → fill a title → Save: form error + toast with the demo message;
   the day's list unchanged.
4. Edit the Standup chip: scope picker appears (instance/series);
   saving rejects the same way.
5. "Demo · Connect" → consent → your real events appear without a
   reload.
6. Reload after demo: first-run screen (nothing persisted).
7. README: follow deploy-your-own once cold in a fresh Google Cloud
   project; fix anything that doesn't stand alone.
8. Create the GitHub repo, push, confirm README renders and the demo
   link works from the README.
