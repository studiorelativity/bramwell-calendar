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
the month badge pill, and the today marker (below). Per-day event bars stay
full-color (tinting does not read at 4px). The hover/tap panel is a card in
the same tokens: three day rows, hovered day emphasized on a band surface,
events with category dots and meridiem times. The add button is present here
too, pre-filled with today.

**Today, in both views** *(settled 2026-08-24 after three attempts)*: a
filled pill on the day number plus a wash across the day's cell, in `--today`
— **one indicator at two scales**, so moving between calendar and year never
asks the eye to relearn it. `--today` is the single reserved hue outside the
four categories and is used for nothing else; red-for-today is the convention
every desktop calendar already teaches, so it reads as "now" rather than as a
fifth category. The wash is lighter in the calendar than in the year grid: a
calendar cell is many times the area, and equal alpha over a bigger field
reads as more emphasis, not the same.

Rejected, and why, so they are not retried: a **solid ink cell with gradients
fading into the neighbouring days** — the value out-shouted every event bar,
the ramps read as lighting artifacts rather than meaning, they clipped hard at
cell edges, and they marked a region instead of a day. A **1.5px inset outline
on the cell** — around a tall, near-empty year cell an outline encloses
nothing, so it parses as a form field.

The **Today button goes to today without changing the view**: in the calendar
it scrolls and re-snaps; in the year grid it pages back to the current year if
you had stepped away and scrolls today into view. The Cal/Year toggle stays
the only control that switches views.

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
- Today: filled day-number pill in `--today` plus a wash on the cell — the
  same indicator the year view uses, see "Year view". Always findable via a
  "Today" button in the header that animates the scroll back and re-snaps.
- Tap/click a day → day drawer (port from v2) with that day's events and the
  add/edit form. *(Superseded stage 09: the overlay drawer is replaced by
  inline day expansion — see "Visual direction v4" and "Motion". The
  drawer's content contract carries over unchanged.)*

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

*(Extended 2026-08-24, stage 08.)* The sheet also carries a **Colors**
section — the category list, each category's Google colorId and optional
display colour, and the Mood selector. Same backing, same rule. See
**Customization (stage 08)**.

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

## Customization (stage 08)

*(Added 2026-08-24, stage 08.)*

Categories stop being four constants in the source and become the user's own
list. Two colour layers per category, plus a curated surface mood. Everything
here is prefs: no new storage, no new fetch, no new file.

### Categories become data

`src/categories.ts` stops holding the list and starts resolving it. The list
lives in prefs:

```
StoredCategory       = { name, label, colorId, displayHex? }
prefs.categories       — StoredCategory[]  (absent -> the seed below)
prefs.fallbackCategory — name of the fallback category (absent -> "other")
prefs.mood             — mood id (absent -> "warm")
```

- `name` is the stable key. It is what `CalendarEvent.category` carries, what
  `data-cat` carries, and it never changes once created — **renaming edits
  `label` only.** A new category's name is a slug of its label, uniquified;
  the seed's four names stay `work` / `personal` / `financial` / `other`
  forever, so no cached event is orphaned by this stage.
- **Seed** — a fresh install, and any install predating this stage:

  | name | label | colorId | displayHex |
  |---|---|---|---|
  | work | Work | 9 | #3056D3 |
  | personal | Personal | 10 | #17925A |
  | financial | Financial | 5 | #D97706 |
  | other | Other | 8 | #64748B |

  The colorIds are the ones existing events already carry; they are not
  reassigned, now or ever. The display hexes are stage 05's approved values,
  seeded **explicitly as overrides** so a fresh install renders identically to
  v3 before this stage — Google's own hexes for 9/10/5/8 are different
  colours, so this is a deliberate seed, not a coincidence.
- Users may **add, rename, and remove**. Ceiling: **11 categories**, because
  Google Calendar has exactly 11 event colorIds and the colorId is the only
  channel by which an event read back from Google resolves to a category. The
  add control is disabled at 11, with the reason stated.
- **INVARIANT — no two categories may share a colorId.** Enforced in the UI: a
  colorId already spoken for is disabled in every other category's dropdown.
  Two categories on one colorId would make `categoryFromColorId` ambiguous and
  the Google round-trip lossy. This is a data invariant, not a nicety.
- **One category is always the fallback** (the `other` role). Unknown or
  absent colorId on read resolves to it; it cannot be deleted and its row
  carries no delete control. Which category holds the role is
  `prefs.fallbackCategory`.
- **Deleting a category does not touch its events in Google.** No bulk write,
  no repaint of history. Those events keep their colorId; on the next read it
  matches nothing and they resolve to the fallback. An event already in the
  cache under a now-deleted name resolves to the fallback at render time by
  the same rule.

### Two colour layers

Each category carries two colours, and they are allowed to disagree.

- **Layer 1 — the Google colorId.** A dropdown of exactly Google's 11 event
  colours, each shown as its own swatch beside Google's own name for it
  (Lavender, Sage, Grape, Flamingo, Banana, Tangerine, Peacock, Graphite,
  Blueberry, Basil, Tomato). This is what the Google Calendar app shows and
  what a later read resolves through. **Changing it affects new writes only.**
  Existing events keep the colorId they were written with; the app never mass-
  PATCHes history to repaint them. That is out of scope by decision — a
  bulk rewrite of a user's calendar is not something a colour control should
  do quietly, and the failure modes (partial writes, rate limits, an
  irreversible edit to every event) are all worse than a legend that changed.
- **Layer 2 — the display hex, optional.** When set it overrides how Bramwell
  renders the category on screen: bars, chips, dots, year-grid bars, drawer
  rows, form chips. When unset, display follows the colorId's own hex.
- When the two disagree, Bramwell and the Google app **intentionally
  diverge**; the settings row makes that visible by showing both swatches side
  by side. Divergence is a feature — Google's palette is fixed, the user's
  taste is not — but it must never be a surprise.
- The bar treatment is unchanged and applies to whatever the user picks:
  category colour at ~16% as fill, full colour for the title and the 3px
  spine, 5px radius. **Both layers must stay legible at arm's length, in light
  and in dark.** Dark mode uses a brightened variant of the display colour —
  curated for the four seed hues and for Google's eleven, derived for a custom
  hex — because light-mode hues fail contrast on tinted dark fills (Visual
  direction).
- **Red stays the today convention.** Google's Tomato (colorId 11) remains
  selectable as a category — refusing it would be arbitrary — but `--today`
  keeps a treatment no category ever takes: a filled pill on the day number
  plus a wash across the cell. Today is distinguished by **form**, not by hue
  alone, so a Tomato category can never read as today. `--today` itself is
  never a category colour and never a mood token.

### Mood

A curated set of surface tints: a **fixed list, not a free picker.** The
restraint rule survives customization — the user's commitments stay the only
strong colour on screen, and Mood only moves the quiet ground beneath them.

- Five moods: **Warm** (the default: stage 05's values, unchanged), **Paper**,
  **Cool**, **Sage**, **Dusk**. Each sets `--surface` and the four band tokens
  (`--band-a`, `--band-b`, `--band-a-we`, `--band-b-we`), with a light variant
  and a dark variant.
- Every mood holds the same lightness steps between band A and band B as the
  default, so **month-band contrast is a property of the set, not of the
  choice.** "In dark mode the month boundary is readable from the bands alone
  on a phone at arm's length" is a Definition-of-done item; it holds for every
  option or the option does not ship.
- Mood never touches `--ink*`, `--rule*`, `--today`, or any category colour.

### Settings UI

A **Colors** section in the existing Settings sheet (`src/chrome.ts`):

- One row per category, in list order: the label (editable in place), the
  colorId dropdown, the display swatch with a clear affordance, and a delete
  control on every row but the fallback's.
- An add-category row, disabled at 11.
- The Mood selector.
- Backed by prefs through `savePrefs`, like every other setting. **No new
  storage class, no new file.** A background refresh must not close or reset
  the sheet — the existing rule, unchanged.
- **Demo mode**: customization works, in memory, and writes nothing. Same rule
  as the demo cache — `?demo` never touches localStorage.

### Ripples

- `src/categories.ts` becomes prefs-backed. It stays DOM-free and free of any
  import from `state.ts`: the stored list is pushed into it at boot by
  `main.ts`, which keeps the import graph acyclic (`state -> gcal ->
  categories`). It also gains the Google colour table and the mood palette —
  the one place colour values are named.
- Its consumers render the dynamic list instead of four hard-coded chips: the
  event form's category chips, the day drawer's event rows (which show a
  category's **label**, not its name), `render.ts`'s bars and chips,
  `year.ts`'s per-day bars and hover panel.
- `gcal.ts` writes the **fallback's** colorId for day notes rather than
  `other`'s literally — the fallback is a role now, not a name.
- The `:root` category custom properties in `index.html` become **seed values
  only**: what the page paints before the first script runs. Runtime values are
  emitted by `main.ts` into a single `<style>` element built from
  `categories.ts`'s pure `themeCss()` string — one rule per category plus the
  mood tokens, light and dark. Per-frame cost stays zero: `render.ts` keeps
  setting `data-cat` and nothing else.

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

*(Superseded in part 2026-08-29, stage 09: where "Visual direction v4 —
Night Depth" below conflicts with this section — elevation, hover, today
marker, band/hairline structure — v4 wins. Clauses v4 does not address
still govern.)*

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

## Visual direction v4 — Night Depth (stage 09)

*(Added 2026-08-29, stage 09. Approved reference: the "Bramwell Calendar"
design canvas — Night Depth week-view artboard and motion-primitives
artboard. The canvas fixes token values; this section describes intent.
Where it conflicts with "Visual direction" above, this section wins.)*

- Layered dark-first. Day cells are rounded (12px) raised tiles on a
  near-black ground, not hairline-ruled grid cells. Month structure reads
  through tile surface value (in-month vs. out-month, weekend shade), not
  bands and hairlines alone.
- Exactly three elevation levels: resting cell, hovered cell, open day.
  Nothing else casts a shadow.
- Hover: the cell lifts (translateY(-2px)), its shadow deepens, and a 1px
  accent ring fades in. This replaces v3's "faint hover wash" and repeals
  its "no elevation or scaling on rows" clause.
- Today: accent inset ring on the cell plus accent day number — replaces
  the filled ink pill and cell wash.
- The overlay day drawer is replaced by **inline day expansion**: the day
  grows in place within its week row (row height and the row's column
  tracks animate together), neighbors compress, and the expanded day
  carries everything the drawer carried — event list, add/edit form,
  notes panel, the transient-UI rule. One day open at a time; opening
  another collapses the first; Escape collapses; scrolling does not
  force-collapse.
- Light mode receives the same structure with inverted surface logic;
  dark remains the design-lead mode.

## Motion (stage 09)

- Motion tokens live in `:root` beside the color tokens:
  `--t-fast: 140ms`, `--t-base: 240ms`, `--t-open: 380ms`,
  `--ease-out: cubic-bezier(0.22, 1, 0.36, 1)`,
  `--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1)`.
  No transition or animation value may appear outside the token layer.
- Choreography: hover enters in `--t-fast --ease-out`, leaves in
  `--t-base`. Expand runs `--t-open --ease-spring`; expanded content
  staggers in 40ms apart (fade + 6px rise). Collapse runs `--t-base
  --ease-out`, content fades first, no stagger.
- One shared enter/exit utility solves display:none-vs-animation once
  (`@starting-style` + `transition-behavior: allow-discrete` on enter,
  `transitionend` on exit). Components never write their own transitions.
- `prefers-reduced-motion`: every animation collapses to 80ms
  opacity-only.
- Performance: hover animates compositor properties only. The expand
  row-height animation is the one permitted layout animation and must be
  contained to the scroller; 60fps on a mid phone is a gate criterion.

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
/src/categories.ts  — category <-> colorId mapping; from stage 08 also the
                      Google colour table, the mood palette, and themeCss()
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

## Categories (src/categories.ts) — the seed; existing events depend on it

- work → "9" (#3056D3) · personal → "10" (#17925A) ·
  financial → "5" (#D97706) · other → "8" (#64748B)
- Unknown/absent colorId on read → "other".

*(Revised 2026-08-24, stage 08.)* These four are no longer the category set —
they are its **seed**, and the colorIds above are frozen because events already
in the user's calendar carry them. The live set is user-defined and prefs-
backed; "other" is the seed's fallback rather than a hard-coded name. See
**Customization (stage 08)**.

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
- A fresh install renders identically to v3 before stage 08 — same four
  categories, same colours, same bands
- Add a category, give it a Google colour and a different display colour: a
  new event in it renders in the display colour and arrives in the Google
  Calendar app in the Google colour; both swatches are visible in Settings
- A colorId already used by one category cannot be chosen for a second; the
  add control is dead at 11 categories
- Delete a non-fallback category: its existing events are untouched in Google
  and render in the fallback colour
- Rename a category: existing events keep their colour and their category
- Every mood keeps the month boundary readable from the bands alone, on a
  phone at arm's length, in light and dark
- Colour changes persist across a reload; in `?demo` they apply and persist
  nothing

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
