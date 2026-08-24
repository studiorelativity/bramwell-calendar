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

*(Appended 2026-08-23, stage 05.)* The year view shares the calendar's
visual system: alternating month bands with the weekend shade, 1px
hairlines between cells, a 2px strong rule on each month's leading edge,
the month badge pill, and the today ring scaled to cell size. Per-day event
bars stay full-color (tinting does not read at 4px).

*(Revised 2026-08-24.)* At year scale a ring on one 44px cell out of 365 is
not findable, so **today is a solid ink cell** with the surrounding days
fading off it: a short lead-in on the day before, a tail out to nothing
across the two days after. Ink, not a fifth hue — the four category colors
are spoken for and commitments stay the only strong color on screen. Today's
day number inverts on the solid cell. The hover/tap panel is
a card in the same tokens: three day rows, hovered day emphasized on a band
surface, events with category dots and meridiem times. The add button is
present here too, pre-filled with today.

## Layout details

- 7 equal columns. Weekend columns (Sat/Sun) get a subtle background shade,
  layered over the month band so both remain readable.
- Each month gets an alternating neutral background band, applied per day
  column. A week straddling a boundary shows both bands side by side.
- The sticky header carries, left to right: the month(s) or year in view
  (heavier weight), the year steppers (year view only), the Cal/Year view
  toggle, a Today button, and the account avatar. *(Revised 2026-08-23: the
  15/30/45 selector moved to Settings; the Sign in button is replaced by the
  first-run screen and the reconnect pill — see "First-run and connection
  state".)*
- A floating add button sits bottom-right, safe-area aware, in both views.
  It opens the event form pre-filled with the date nearest the viewport
  center (year view: today); `n` on desktop does the same. It must not
  cover the last row's Sunday events on a notched phone.
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

## First-run and connection state

*(Added 2026-08-23, stage 05.)*

Cold start with no auth and no cached months shows a first-run screen — app
mark, name, one-line description, a Connect Google Calendar button (wraps
`auth.signIn`), and a note that events live only in Google Calendar.
Nothing else.

If cached months exist but auth is stale, the calendar renders read-only
from cache with a small reconnect pill in the header; the first-run screen
never covers a warm cache (preserves the offline-open behavior).

Signed in, the header shows the account initial in an avatar with a
connection dot bound to auth state. The avatar opens Settings.

## Settings

*(Added 2026-08-23, stage 05.)*

A sheet opened from the avatar: account row with sign-out, snap granularity
15/30/45 (writes `prefs.snapStepDays`), default view (Cal/Year), sound stub
(off, reserved). Backed entirely by existing prefs; no new storage. A
background refresh must not close or reset the sheet.

## Demo mode

*(Added 2026-08-23, stage 06 — the public-sharing stage.)*

A no-auth path so anyone can feel the product without connecting a
calendar. Entry: a "Try the demo" secondary action on the first-run
screen, or `?demo` in the URL (the shareable link).

- Demo seeds a deterministic ~17 months of plausible events (same for
  every visitor, generated around today) into the **in-memory** cache
  only. localStorage is never written in demo; `ensureMonthsFor` and every
  other network path is inert. DevTools must show zero requests to
  googleapis.com.
- Everything else behaves identically: scroll, snap, year view, hover
  panel, drawer, FAB. Writes reject before the optimistic apply with
  "Demo — connect your Google Calendar to save." surfaced in the form and
  toast; nothing is applied, nothing rolls back.
- The header shows a demo pill ("Demo · Connect") in place of the avatar.
  Clicking it (or Connect anywhere) exits demo: demo months are dropped,
  the real cache reloads from localStorage, and sign-in proceeds.
- Demo state does not survive a reload and is never persisted.

## Day notes

*(Added 2026-08-23, stage 07.)*

One free-text note per day, stored in Google Calendar itself — no new
scope, no second backend. (Keep integration is impossible: its API is
enterprise-only, no consumer access.)

- **Wire format**: a day note is an all-day single-day event with
  `extendedProperties.private.bramwell = "daynote"`. Its `summary` is the
  note's first line (truncated to 60 chars); the full text lives in
  `description`. colorId is the `other` mapping. In the official Google
  Calendar apps it appears as a quiet all-day event — that portability is
  a feature, not a leak.
- **One note per day**: saving when a note exists patches it (upsert);
  saving empty text deletes it. The app never creates a second daynote on
  the same day.
- **Rendering**: a day note is NEVER a bar or chip and never occupies a
  lane. The day cell shows a small neutral marker (bottom-right, distinct
  from the "+N" overflow at bottom-left); the day drawer gets a Notes
  panel — the note text with an edit affordance, above the events list.
- **Writes** go through the existing optimistic flow (UI → state.ts →
  gcal.ts). Offline: visible failure + rollback, same as events. Demo:
  rejects with the demo message, and the demo seed includes two day notes
  so the panel and marker are visible in the demo.
- A background month refresh must never wipe note text being typed
  (same transient-UI rule the drawer form already obeys).

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

*(Revised 2026-08-23, stage 05. Approved reference: `05_polish/mock.html` —
the spec describes intent, the mock fixes token values.)*

Modern, clean, inviting. Warm neutral surfaces, generous whitespace,
restrained type (system stack); the user's commitments are the only strong
color on screen. No gradients-for-decoration, no card chrome, no elevation
or scaling on rows.

Structure is communicated by three quiet layers: alternating month bands,
the weekend shade, and 1px hairline rules between week rows and day columns.
In dark mode the surfaces are lifted warm graphite, never near black — the
band contrast must survive a phone at arm's length. Category colors get
brightened dark-mode variants; the light-mode hues fail contrast on tinted
dark fills.

Event bars are tinted: category color at ~16% as fill, full color for the
text and a 3px left spine, 5px radius. Bars continuing across a row break
keep a flat edge on the broken side and drop the spine. Timed chips carry a
small category dot, a muted tabular time, and the title.

Day numbers are tabular, top-right. Today's number sits in a filled ink
circle — findable in under a second on a full grid. Desktop day cells take
a faint hover wash. Dark mode honors `prefers-color-scheme` with the same
restraint.

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
/src/chrome.ts      — first-run screen, settings sheet, FAB (added at stage 05)
/.env.local         — VITE_GOOGLE_CLIENT_ID=... (gitignored)
```

## Auth (src/auth.ts) — unchanged from v2 spec

Google Identity Services token model (`google.accounts.oauth2.initTokenClient`).

- Script: `https://accounts.google.com/gsi/client`
- Scope: `https://www.googleapis.com/auth/calendar.events` only
- Cached in-memory token if valid; otherwise "Sign in with Google" button in
  the header. `requestAccessToken({prompt: ''})` for quiet renewal, interactive
  on failure. Any 401 → clear token, surface sign-in, never a dead state.
- Exports exactly: `getToken(): Promise<string>`, `signIn()`, `signOut()`,
  `isSignedIn()`. Nothing outside this file touches auth. *(`signOut` added
  2026-08-23, stage 05: Settings requires it — revoke the token via
  `google.accounts.oauth2.revoke`, clear in-memory state.)*

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
- Cold start signed out shows the first-run screen; Connect lands on today.
  A stale token over a warm cache shows the read-only calendar with a
  reconnect pill, not the first-run screen
- The add button (and `n` on desktop) opens the event form on the centered
  date, from anywhere in time
- Settings changes (snap, default view) persist across a reload; sign-out
  returns to the first-run screen
- In dark mode, the month boundary is readable from the bands alone on a
  phone at arm's length — in both the calendar and the year view
- `?demo` (and the first-run "Try the demo") opens a populated calendar
  with no sign-in and zero googleapis.com requests; a save attempt fails
  visibly with the demo message; Connect exits demo into real sign-in
- A note saved on a day shows the cell marker and survives reload; its
  event in the Google Calendar app carries the first line as its title;
  editing to empty deletes it; a daynote never renders as a bar or chip

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
zone, chosen for exactly this reason. The apex serves an unrelated Astro site
with its own routes (`/about/`, `/work/`, `/writing/`, ...) and `www` 301s to
the apex; neither is disturbed. Serving this app from `no.fail/calendar/` is
not an option — that is the subpath case above, and it would collide with the
apex site's routing besides.

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
