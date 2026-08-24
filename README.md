# Bramwell

A perpetual calendar for your Google Calendar. Weeks stack vertically
forever — months are labels, not walls. February flows into March.

**[Try the demo](https://bramwell-calendar.studiorelativity.workers.dev/?demo)** —
no sign-in, seeded events, the real UI.

## What it is

- **Vertical weeks, rolling months.** Uniform week rows, ~6.5 weeks in
  view, momentum scrolling that settles softly on half-month anchors
  (a 15/30/45-day granularity setting). Alternating neutral bands mark
  the months; there is no month grid and no year boundary.
- **A year at a glance.** A week-aligned 365-day grid (28 columns on
  desktop), month badges, hover panel showing any day with its
  neighbors.
- **Your real calendar.** Google Calendar is the only backend. Full
  create/edit/delete with optimistic writes and rollback, four
  categories mapped to Google colorIds, recurring-event instance/series
  handling.
- **A real PWA.** Installable, offline read-only from cache, no server
  of its own. Your events live in Google Calendar and your browser —
  nowhere else.

Vite + vanilla TypeScript. No framework, no dependencies at runtime.

## Run it

```sh
npm install
npm run dev
```

`?demo` on any origin works without credentials. Real sign-in needs your
own (free) Google OAuth client:

1. [console.cloud.google.com](https://console.cloud.google.com) → new
   project → enable **Google Calendar API**.
2. OAuth consent screen → External → scope
   `.../auth/calendar.events` → add yourself as a test user → leave in
   **Testing**. (Testing mode allows up to 100 named users and needs no
   Google review.)
3. Credentials → OAuth client ID → **Web application** → authorized
   JavaScript origins: `http://localhost:5173` plus your deployed
   origin. No redirect URIs — this app uses the GIS token model.
4. `.env.local`: `VITE_GOOGLE_CLIENT_ID=<your client id>`

Deploy anywhere that serves static files over HTTPS at a domain root
(Cloudflare Pages/Workers settings are in the build spec's DEPLOY
section). The client ID is public by design; the origin allowlist is the
security boundary.

## How it was built

This repo is also a build record. The app was built by Claude in four
gated stages — scaffold, data layer, scroll engine, shell — plus polish
and sharing stages, under a lite deterministic orchestration ("rig"):

- `_references/BUILD-SPEC-V3.md` is the contract; conflicts resolve to
  the spec, and fixes go upstream into it, never patched downstream.
- Each `NN_*/CONTEXT.md` is one stage's contract: exactly which spec
  sections it may read, what it builds, and a human-executed gate.
- Each `NN_*/output/verification.md` records what was verified, what
  was tuned by feel, and every decision the spec left open — including
  the mechanic that was built, tried on device, and rejected.

The product is the Vite tree at repo root; the stage folders are the
story of how it got there.

## License

MIT — see [LICENSE](LICENSE).
