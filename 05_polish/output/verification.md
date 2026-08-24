# Stage 05 — Verification

Date: 2026-08-23 · Implements the visual pass (index.html tokens,
style.css), `chrome.ts` (first-run, settings, FAB), `signOut` in `auth.ts`,
`openAdd` in `drawer.ts`, `defaultView` in `types.ts`, rewired `main.ts`,
SW cache bump.

## Gate — OPEN, awaiting human

The gate is the four stage-05 Definition-of-done items plus the two wire
items inherited since stage 02, on a real phone and desktop, light and
dark. Nothing below is self-certified; the checklist is at the end.

## What was built

1. **Tokens** (`index.html`): light palette warmed (`#faf9f7` surface);
   dark palette lifted from near-black to warm graphite (`#151210` /
   `#211d18` bands) — the old `#0c0a09`/`#1b1714` failed the
   bands-at-arm's-length test on the reported screenshot. New tokens:
   `--ink-faint`, `--rule-strong`, `--hover`, and brightened dark-mode
   category variants (light hues fail contrast on tinted dark fills).
2. **Calendar pass** (`style.css`): tinted bars (16% fill, full-color text,
   3px spine; continuations drop the spine), chips with category dots,
   hairlines between rows/columns, desktop hover wash via `::after`
   (band tokens untouched), tabular day numbers, today ring, 21px/700
   header title.
3. **Year view pass**: neutral hover wash (was category-blue outline),
   month leading edge on `--rule-strong`, 4px bars, hover panel restyled
   as a card (`--band-a` ground, `--rule-strong` border, dots, larger
   type). Structure untouched — no markup or virtualization changes.
4. **`chrome.ts`** (new, in the spec's file layout first): first-run
   screen, settings sheet (account/connect/sign-out, snap 15/30/45,
   default view, sound stub), FAB. Talks only to `auth.ts` and `state.ts`
   public exports; receives scroll/view callbacks from `main.ts`.
5. **Header rework**: 15/30/45 selector removed (now in Settings); avatar
   with connection dot; reconnect pill replaces the sign-in button.
6. **`auth.signOut`** (spec amended 2026-08-23): revokes the grant via
   `google.accounts.oauth2.revoke`, not just locally — a local-only clear
   would quiet-renew straight back in on the next `getToken()`.
7. **`drawer.openAdd(day)`**: FAB path straight to the blank form.
8. **SW cache `bramwell-shell-v3`**: index.html changed and the shell is
   served cache-first, so only a byte-change in sw.js makes an existing
   install re-prime. Found while closing: this must be bumped on EVERY
   shell change; comment now says so at the constant.

## Automated evidence

- `tsc --noEmit` clean under `strict` after every change.
- `vite build` clean; 16 modules (15 + chrome.ts); `sw.js` emitted at the
  site root with `bramwell-shell-v3`; chrome styles present in the emitted
  CSS. (Built in a fresh Linux sandbox via `npm ci` — the repo's
  node_modules are macOS; nothing was touched there.)
- No headless browser was available in this environment, so no DOM-level
  self-verification this stage. The human gate carries it.

## Decisions the spec left open

1. **No profile scope for the avatar.** `calendar.events` carries no name
   or email, so the settings account row names the connection ("Google
   Calendar · Connected"), not the person, and the avatar is a generic
   glyph with the connection dot. Widening scope to userinfo for an
   initial was judged not worth the extra consent.
2. **First-run may flash for a returning user with a cleared cache**: it
   shows immediately on cold start (no cache, no token), and quiet renewal
   may sign them in a beat later. The alternative — a blank grid during a
   grace period — was worse. The reconnect pill (warm cache case) DOES
   wait out a 2.5s grace so quiet renewal doesn't cry wolf.
3. **`warmCache` is computed from `monthState` over the render window**,
   not a new state.ts export — "is anything visible resident" is the
   question the shell actually asks, and it kept 02's module untouched
   except where the contract already required (`signOut` is auth's).
4. **FAB date**: calendar view → mid-week day of the docked anchor week
   (the viewport-centre week); year view → today. `n` ignores keystrokes
   in inputs and while the drawer is open.
5. **`defaultView` joins Prefs as optional**, same precedent as
   `snapStepDays` (03).
6. **Sound row stays a stub** and now says so in its subtitle. It writes
   `soundEnabled` but nothing reads it; honest labelling over hiding it.

## Human gate checklist

Phone + desktop, light + dark:

1. Cold start signed out (clear site data): first-run screen, nothing
   else. Connect → consent → lands on today, avatar dot green.
2. Sign in, reload with network on: no first-run flash worse than a beat;
   calendar appears with avatar.
3. Revoke access at myaccount.google.com → reload: calendar renders
   read-only from cache with the amber Reconnect pill — the first-run
   screen must NOT cover the warm cache. Reconnect works.
4. Settings: snap 15/30/45 each lands on valid anchors as before; default
   view Year persists across reload; sign-out → first-run screen.
5. FAB on phone: does not cover the last row's Sunday events; opens the
   form on the centred date. `n` on desktop, from a year away, same.
6. Dark mode at arm's length: month boundary readable from bands alone,
   calendar AND year view.
7. Settings sheet stays open and intact while months background-refresh
   (open it right after a reload while the spinner months land).
8. **Inherited from 02, real wire, still open**: one event per category
   through the form → all four colors correct in the Google Calendar app;
   a 3-week all-day event ends on the chosen day, not a day later.
9. Existing PWA install: after deploy, one online open then offline open —
   the new shell (new header, new colors) shows, not the old cached one.
