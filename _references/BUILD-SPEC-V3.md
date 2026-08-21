# BUILD SPEC v3 — Perpetual Calendar (vertical weeks, lens zoom, PWA)

Give this file to Claude Code in the repo along with `year-planner-v2.html`
(reference for the day drawer, event form, category chips, and API-adjacent
logic — NOT for layout; v3's layout is completely different and specified here).

This replaces the v2 year-grid spec. Auth and the Calendar API layer are
unchanged from v2's spec and restated in full below so this file stands alone.

---

## What this is

A single-user PWA (desktop + mobile, one codebase): a perpetual calendar that
scrolls vertically through time. Rows are weeks — seven columns, Monday–Sunday —
stacking downward forever in both directions. There is no year boundary and no
month container: months are labels, not walls. February flows into March.

Backed by the user's real Google Calendar. Full create/edit/delete. Categories
(Work / Personal / Financial / Other) map to Google colorIds.

## The core interaction: the lens

There is no zoom slider. Zoom is a *place* on screen.

- A horizontal band ("the lens") is fixed in the viewport, vertically centered,
  height = **~35% of viewport height** (proportional, never a fixed px height).
- The lens holds **two week rows** at full detail: tall rows, event titles,
  times, readable day numbers.
- Weeks outside the lens are **compressed**: thin rows (~16–24px) showing only
  colored commitment bars — the shape of your time, months of it visible above
  and below the lens at once.
- As the user scrolls, weeks approaching the lens **lift and expand** into it;
  weeks leaving it settle back down into compression. The transition is
  continuous with scroll position (scroll-linked interpolation of row height,
  font opacity, detail reveal), not a toggle.
- Scrolling **snaps in two-week detents**: when momentum ends, the nearest
  week pair docks into the lens. Snapping must feel mechanical — momentum
  settles into the detent, it does not hard-stop.
- Each dock fires a subtle **haptic tick** on devices that support it
  (`navigator.vibrate(8)` where available). Sound is OFF by default; a settings
  toggle may enable a click. Do not spend effort on audio. **Motion is the
  priority** — easing, lift, settle. It should feel like a mechanism, not an
  animated list.

On first load the lens contains the current week + next week, with today
visibly marked.

## Layout details

- 7 equal columns. Weekend columns (Sat/Sun) get a subtle background shade.
- Sticky header strip above the lens shows the month + year of the week
  currently docked in the lens (e.g. "March 2027"). It cross-fades as the
  docked week's month changes.
- A thin rule + small month label marks each month boundary inline in the
  scroll, so boundaries are visible in the compressed regions too.
- **Multi-day/multi-week events render as horizontal bars spanning their days
  within each week row, wrapping across consecutive week rows** (like text
  wraps). Same lane-packing as v2: longest-first placement. In compressed rows
  bars are all you see; in the lens, bars carry titles.
- Timed (non-all-day) events: in the lens, render as compact chips within
  their day cell, sorted by start time, with start time shown. In compressed
  rows they contribute a thin bar segment on their day only.
- Today: strong marker (filled day number), always findable via a "Today"
  button in the header that animates the scroll back and re-docks.
- Tap/click a day in the lens → day drawer (port from v2) with that day's
  events and the add/edit form. Tapping a compressed week scrolls it into the
  lens instead of opening anything.

## Perpetual scroll mechanics

- Virtualized: render only ~40 week rows around the viewport; recycle DOM
  nodes as the user scrolls. Week index is the source of truth
  (week 0 = week containing today; negative = past).
- Load events lazily by month as weeks approach the render window
  (fetch a month when any of its weeks is within ~8 weeks of the viewport),
  both directions. Cache per `year-month` in localStorage; render from cache
  instantly, background-refresh visible months.
- Scrolling must stay 60fps on a mid-range phone: transform-based positioning,
  no layout thrash in the scroll handler, interpolation math only.

## Visual direction

Modern, clean, inviting. Light surface, generous whitespace, restrained
neutral type (system font stack is fine); the user's commitments are the only
strong color on screen. No gradients-for-decoration, no card chrome. Depth is
communicated by the lens: docked weeks get a barely-there elevation
(shadow/scale ~1.01), compressed weeks sit flat. Dark mode: honor
`prefers-color-scheme` with the same restraint.

## PWA requirements

- `manifest.webmanifest`: name, icons (generate simple ones), display
  `standalone`, theme color.
- Service worker: precache the app shell; runtime cache-first for static
  assets. Do NOT cache Calendar API responses in the SW (localStorage cache
  already handles data; avoids stale-auth confusion).
- Offline: app opens, renders from localStorage cache read-only, writes fail
  with a visible message and roll back. On reconnect, background refresh.
- Installable on iOS/Android/desktop; verify viewport meta and safe-area
  insets so the lens ratio holds on phones with notches.

## Stack

- Vite + vanilla TypeScript. No framework. Hand-rolled DOM + transforms
  (the lens interpolation is easier without a VDOM in the way).
- localStorage for event cache + prefs (last docked week, sound toggle).

## File layout

```
/index.html
/manifest.webmanifest
/src/main.ts        — bootstrapping, wiring
/src/auth.ts        — GIS token client; the ONLY file that knows about auth
/src/gcal.ts        — Calendar API module; the ONLY file making network calls
/src/state.ts       — event cache, week-index math, localStorage persistence
/src/scroll.ts      — virtualizer, detent/snap physics, lens interpolation
/src/render.ts      — week rows, bars, lane packing, month labels, header
/src/drawer.ts      — day drawer + event form (port from v2)
/src/categories.ts  — category <-> colorId mapping
/src/sw.ts          — service worker
/src/types.ts
/.env.local         — VITE_GOOGLE_CLIENT_ID=... (gitignored)
```

## Auth (src/auth.ts) — unchanged from v2 spec

Google Identity Services token model (`google.accounts.oauth2.initTokenClient`).

- Script: `https://accounts.google.com/gsi/client`
- Scope: `https://www.googleapis.com/auth/calendar.events` only
- Cached in-memory token if valid; otherwise "Sign in with Google" button in
  the header. `requestAccessToken({prompt: ''})` for quiet renewal, interactive
  on failure. Any 401 → clear token, surface sign-in, never a dead state.
- Exports exactly: `getToken(): Promise<string>`, `signIn()`, `isSignedIn()`.
  Nothing outside this file touches auth.

## Calendar API (src/gcal.ts) — unchanged from v2 spec

Base `https://www.googleapis.com/calendar/v3`, `Authorization: Bearer <token>`,
calendar `primary`.

- **List month:** `GET /calendars/primary/events` with `timeMin`/`timeMax`
  (RFC3339, local offset), `singleEvents=true`, `orderBy=startTime`,
  `maxResults=250`, follow `nextPageToken` to exhaustion. No caps.
- **Create:** `POST /calendars/primary/events`. Timed: `start.dateTime` /
  `end.dateTime` + timezone. All-day: `start.date`/`end.date` — API end date
  is EXCLUSIVE, the form's end field is inclusive; convert. `colorId` from
  category, `description` from notes, `recurrence: ["RRULE:..."]` from repeat.
- **Update:** `PATCH /calendars/primary/events/{id}`, changed fields only.
  Instance id = this occurrence; `recurringEventId` parent = whole series.
  Edit form offers both; default "this occurrence".
- **Delete:** `DELETE .../events/{id}`; same instance-vs-series choice;
  confirm before series deletion.
- Optimistic writes: apply locally as pending → API call → reconcile, or
  roll back + toast on failure.
- 403 rate-limit / 5xx: one retry with backoff, then surface the error.

## Categories (src/categories.ts) — unchanged, existing events depend on it

- work → "9" (#3056D3) · personal → "10" (#17925A) ·
  financial → "5" (#D97706) · other → "8" (#64748B)
- Unknown/absent colorId on read → "other".

## Definition of done

- `npm run dev` → sign in → lens shows this week + next, today marked, current
  month in the header, compressed weeks visible above and below
- Flick-scroll three months ahead: smooth 60fps, weeks lift into the lens and
  settle out, momentum ends docked on a week pair, month header updates,
  haptic tick fires on a phone
- Scroll a year into the past: months load in as approached, no jank, no
  unbounded DOM growth
- Create a 3-week all-day commitment → renders as a wrapping bar across three
  week rows, correct color in the Google Calendar app
- Edit one occurrence of a weekly event; delete the series with confirmation
- Install as PWA on a phone; kill the network; app opens read-only from cache;
  a write fails visibly and rolls back
- Lens is ~35% of viewport on a phone with a notch and on a 27" monitor alike

---

## MANUAL SETUP (one-time, Google Cloud Console — Claude Code cannot do this)

If you completed this for v2, it carries over — same client ID. Just add the
deployed origin when you deploy.

1. console.cloud.google.com → New project
2. Enable **Google Calendar API**
3. OAuth consent screen → External → add scope `.../auth/calendar.events`,
   add yourself as test user, leave in **Testing**
4. Credentials → OAuth client ID → Web application → authorized JavaScript
   origins: `http://localhost:5173` (+ deploy origin later). No redirect URIs.
5. Client ID → `.env.local` as `VITE_GOOGLE_CLIENT_ID=`

Testing-status consent expires periodically; re-clicking sign-in fixes it.
Not a bug.
