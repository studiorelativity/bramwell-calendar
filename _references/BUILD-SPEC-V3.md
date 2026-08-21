# BUILD SPEC v3 — Perpetual Calendar (vertical weeks, rolling month, PWA)

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

## The core interaction: the rolling month

*(Revised 2026-08-20. This replaces the "lens" mechanic — scroll-linked zoom
with two-week detents — which was built, tried, and rejected: compressed rows
made the shape of a month hard to read, which was the whole point of them.)*

There is no zoom and no lens. **Every week row is the same height, always at
full detail.** The shape of a month is legible at a glance because all of it
is legible all the time.

- Week rows are uniform, sized so that roughly **six and a half weeks fill the
  viewport** — a full month plus its edges, visible at once, on a phone and a
  27" monitor alike. Proportional to viewport height, within sane bounds.
- Scrolling **snaps to half-month anchors** — the 1st and the 16th of each
  month. A **15 / 30 / 45 selector in the header** sets how coarse the stops
  are: every anchor (~15 days), every other one (~30 days, i.e. the 1st of
  each month), or every third (~45 days). The anchor comes to rest at the
  **vertical centre of the viewport**, so a 30-day stop straddles a month
  boundary while a 15-day stop frames a whole month — which is the point of
  offering the choice. The selection persists.
- Momentum settles into the detent; it does not hard-stop. Landing should feel
  soft, not mechanical.
- Months are distinguished by an **alternating neutral background band**,
  applied per day column so a week straddling a boundary shows both months.
- Sound is OFF by default and no effort goes into audio. Haptics are off by
  default too — the detent is visual, not tactile.

On first load the view rests on the boundary nearest today, with today marked.

## Year view

A second view, toggled from the header, showing one calendar year at once —
all 365 days, no scrolling on a desktop window.

- A continuous **week-aligned grid, four weeks (28 day columns) per row**, so
  columns cycle Mon-Sun four times and every row is exactly four weeks. The
  first row is **indented by the weekday of 1 January**, so week alignment
  holds down the whole year and every column is the same weekday throughout.
- Narrow viewports fall back to 14 or 7 columns — both multiples of 7, so the
  alignment survives on a phone.
- Each cell carries: weekday abbreviation, day number, a **month badge on the
  1st**, the same alternating month band and weekend shade as the main view,
  and thin category-coloured bars for that day's events. Longest event first,
  so a multi-day event occupies the same lane in every cell it covers and
  reads as a continuous run across the row.
- Today is marked as strongly as in the main view.
- **Hovering a day raises a panel** showing three days — the previous day, the
  hovered day, and the next day — each with its events listed in full (title,
  and start time for timed events). The year view is bars and lines at a
  glance; the panel is how you read what is in them without leaving it.
- **Touch devices have no hover, so there the panel is tap-driven**: the first
  tap on a day raises the panel, a second tap on the same day opens that day
  in the calendar view, and a tap anywhere else dismisses it.
- `<` `>` in the header step the year. Clicking a day returns to the calendar
  view positioned on that day — the year view is an overview and a navigator.

## Layout details

- 7 equal columns. Weekend columns (Sat/Sun) get a subtle background shade,
  layered over the month band so both remain readable.
- Each month gets an alternating neutral background band, applied per day
  column. A week straddling a boundary shows both bands side by side.
- The sticky header carries, left to right: the month(s) or year in view, the
  year steppers (year view only), the Cal/Year view toggle, the 15/30/45 snap
  selector (calendar view only), a Today button, and a Sign in button that
  shows only when there is no token.
- Sticky header strip shows the month(s) currently in view — "March 2027", or
  "Feb – Mar 2027" when the view straddles a boundary, which at rest it does.
  It cross-fades as the visible range changes.
- A thin rule + small month label marks each month boundary inline in the
  scroll, running from the 1st to the end of that week row. The label is a
  filled badge, identical in both views — the same treatment in the calendar
  and the year grid.
- **Multi-day/multi-week events render as horizontal bars spanning their days
  within each week row, wrapping across consecutive week rows** (like text
  wraps). Same lane-packing as v2: longest-first placement. Bars carry titles;
  a continuation carries none, so the title appears once per event.
- Timed (non-all-day) events render as compact chips within their day cell,
  sorted by start time, with start time shown.
- Day numbers sit in the **top-right** of each day cell; the inline month
  label sits **top-left**, so the two never collide on the day a month starts.
- Today: strong marker (filled day number), always findable via a "Today"
  button in the header that animates the scroll back and re-snaps.
- Tap/click a day → day drawer (port from v2) with that day's events and the
  add/edit form.

## Perpetual scroll mechanics

- Virtualized: render only the week rows the viewport needs plus a small
  buffer, and recycle DOM nodes as the user scrolls. Derive the count from
  viewport height — rows are uniform, so it is simply how many fit. Week index
  is the source of truth (week 0 = week containing today; negative = past).
- Load events lazily by month as weeks approach the render window
  (fetch a month when any of its weeks is within ~8 weeks of the viewport),
  both directions. Cache per `year-month` in localStorage; render from cache
  instantly, background-refresh visible months.
- Scrolling must stay 60fps on a mid-range phone: transform-based positioning,
  no layout thrash in the scroll handler, interpolation math only.

## Visual direction

Modern, clean, inviting. Light surface, generous whitespace, restrained
neutral type (system font stack is fine); the user's commitments are the only
strong color on screen. No gradients-for-decoration, no card chrome, no
elevation or scaling on rows. Structure is communicated by the alternating
month bands and the weekend shade — both neutral, both quiet. Dark mode:
honor `prefers-color-scheme` with the same restraint.

## PWA requirements

- `manifest.webmanifest`: name, icons (generate simple ones), display
  `standalone`, theme color.
- Service worker: precache the app shell; runtime cache-first for static
  assets. Do NOT cache Calendar API responses in the SW (localStorage cache
  already handles data; avoids stale-auth confusion).
- Offline: app opens, renders from localStorage cache read-only, writes fail
  with a visible message and roll back. On reconnect, background refresh.
- Installable on iOS/Android/desktop; verify viewport meta and safe-area
  insets so a full month still fits on phones with notches.

## Stack

- Vite + vanilla TypeScript. No framework. Hand-rolled DOM + transforms
  (the scroll interpolation is easier without a VDOM in the way).
- localStorage for event cache + prefs (last docked position, snap step,
  sound toggle).

## File layout

```
/index.html
/manifest.webmanifest
/src/main.ts        — bootstrapping, wiring
/src/auth.ts        — GIS token client; the ONLY file that knows about auth
/src/gcal.ts        — Calendar API module; the ONLY file making network calls
/src/state.ts       — event cache, week-index math, localStorage persistence
/src/scroll.ts      — virtualizer, month-snap physics
/src/render.ts      — week rows, bars, lane packing, month labels, header
/src/year.ts        — year view: 365-day week-aligned grid
/src/drawer.ts      — day drawer + event form (port from v2)
/src/categories.ts  — category <-> colorId mapping
/src/sw.ts          — service worker
/src/types.ts
/src/style.css     — app stylesheet (added at stage 03)
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

- `npm run dev` → sign in → a full month is visible at once with today marked,
  the month(s) in view named in the header, alternating month bands legible
- Flick-scroll three months ahead: smooth 60fps, momentum settles softly onto
  a centred anchor at the selected 15/30/45 granularity, month header updates
- On a phone, double-tapping a day never zooms the page
- Year view shows all 365 days at once on a desktop window, week-aligned,
  with month badges and today marked; clicking a day returns to that day
- Hovering a day in the year view (tapping, on a phone) shows that day with
  the day either side of it, events listed in full
- Scroll a year into the past: months load in as approached, no jank, no
  unbounded DOM growth
- Create a 3-week all-day commitment → renders as a wrapping bar across three
  week rows, correct color in the Google Calendar app
- Edit one occurrence of a weekly event; delete the series with confirmation
- Install as PWA on a phone; kill the network; app opens read-only from cache;
  a write fails visibly and rolls back
- A full month fits the viewport on a phone with a notch and on a 27" monitor
  alike; day numbers are never clipped at the left edge

---

## MANUAL SETUP (one-time, Google Cloud Console — Claude Code cannot do this)

If you completed this for v2, it carries over — same client ID. Just add the
deployed origin when you deploy.

1. console.cloud.google.com → New project
2. Enable **Google Calendar API**
3. OAuth consent screen → External → add scope `.../auth/calendar.events`,
   add yourself as test user, leave in **Testing**
4. Credentials → OAuth client ID → Web application → authorized JavaScript
   origins: `http://localhost:5173` and `https://cal.no.fail` (see DEPLOY).
   No redirect URIs.
5. Client ID → `.env.local` as `VITE_GOOGLE_CLIENT_ID=`

Testing-status consent expires periodically; re-clicking sign-in fixes it.
Not a bug.

---

## DEPLOY (Cloudflare Pages → https://cal.no.fail)

### The origin must be a domain root

Not a subpath. Three things depend on it and break together otherwise:
`sw.ts` registers `/sw.js` and precaches `/`, `/index.html`, `/icon-*.png`;
the webmanifest declares `"start_url": "/"` and `"scope": "/"`; `index.html`
links its icons at `/`. HTTPS is required twice over — Google Identity
Services refuses insecure origins, and service workers do not register on
them.

`cal.no.fail` is a dedicated subdomain in the existing `no.fail` Cloudflare
zone, chosen for exactly this reason. The apex serves an unrelated Carrd site
and `www` 301s to the apex; neither is disturbed. Serving this app from
`no.fail/calendar/` is not an option — that is the subpath case above.

### Pages project settings

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |
| Node version | pinned by `.node-version` |
| Environment variable | `VITE_GOOGLE_CLIENT_ID` |
| Custom domain | `cal.no.fail` |

`VITE_GOOGLE_CLIENT_ID` must be set in the Pages dashboard, not just
`.env.local` — Vite inlines it at build time and `.env.local` is gitignored,
so the build host has no other source for it. A web OAuth client ID is public
by design; the origin allowlist below is the security boundary, not secrecy.

Adding `cal.no.fail` as a Pages custom domain creates the proxied CNAME in the
zone automatically. Cloudflare issues the certificate; wait for it to go
active before testing sign-in.

`public/_headers` is copied to the output root and holds the cache rules. The
`/sw.js` rule is load-bearing: if the worker gets pinned by a cache, bumping
`CACHE` in `sw.ts` can never take effect and installed clients stay on the old
shell permanently.

### Then, in Google Cloud Console

Add `https://cal.no.fail` to the OAuth client's authorized JavaScript origins,
alongside `http://localhost:5173`. Exact-match, so the scheme and the full
hostname both matter — `no.fail` and `www.no.fail` are different origins to
Google and neither one covers `cal.no.fail`. Until this is done, sign-in fails
with `origin_mismatch` — that is the expected failure, not a bug in the app.

**Preview deployments cannot sign in.** Each Pages preview gets its own
`<hash>.<project>.pages.dev` origin, Google does not accept wildcard origins,
and adding them one by one is not practical. Previews are for layout only.
Anything touching auth or the Calendar API must be tested on `cal.no.fail`.

### Deploying is a prerequisite for the stage 04 gate, not a step after it

`npm run preview` on localhost is a secure context, but a phone reaching
`http://<lan-ip>:4173` is not: the service worker will not register and no
install prompt appears. The Definition-of-done items covering PWA install and
offline open are therefore only testable against `https://cal.no.fail`.
