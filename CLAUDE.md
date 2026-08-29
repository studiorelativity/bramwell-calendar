# Bramwell Calendar — ICM Workspace

Single-user perpetual-calendar PWA (vertical weeks, lens zoom) backed by
Google Calendar. One build, executed in four gated stages. The product is
the Vite source tree at repo root; stage folders hold contracts and
verification artifacts only.

## Canonical sources (L3)
- `_references/BUILD-SPEC-V3.md` — the contract. Conflicts resolve to the spec.
- `_references/year-planner-v2.html` — port source for the day drawer, event
  form, and category/API-adjacent logic ONLY. Never layout. v3 layout is
  fully specified in the spec.
- `_references/conventions.md` — TS/style rules. Grows from friction; check
  it before writing code in stages 02–04.

## Routing
| Task | Stage | Read |
|------|-------|------|
| Init repo, module skeleton, types | 01_scaffold | 01_scaffold/CONTEXT.md |
| Auth, Calendar API, cache, categories | 02_data | 02_data/CONTEXT.md |
| Virtualizer, lens, detents, rendering | 03_engine | 03_engine/CONTEXT.md |
| Day drawer, service worker, PWA, offline | 04_shell | 04_shell/CONTEXT.md |
| Visual pass, first-run, settings, FAB | 05_polish | 05_polish/CONTEXT.md |
| Demo mode, README, open-source prep | 06_share | 06_share/CONTEXT.md |
| Day notes (extended-property events) | 07_notes | 07_notes/CONTEXT.md |
| Category/colour customization, mood | 08_customize | 08_customize/CONTEXT.md |
| Motion system, inline day expansion | 09_redesign | 09_redesign/CONTEXT.md |

## Rules
- One stage per session. Read only that stage's CONTEXT.md and the spec
  sections it names. Do not load the full spec unless the contract says to.
- Stages run in order. Do not start a stage until the previous stage's gate
  has passed and its `output/verification.md` exists.
- Module boundaries from the spec's file layout are hard boundaries:
  `auth.ts` is the only file that knows about auth; `gcal.ts` is the only
  file making network calls. Enforce this in every stage.
- Fix upstream. If a stage produced wrong output because its contract or a
  reference file was wrong, edit the contract or reference — do not patch
  the output and move on.
- Each stage ends by writing `output/verification.md`: gate criteria checked,
  results, and any decisions made that the spec left open.

## Naming
- Stage folders: `NN_name/` (numbered, execution order)
- Non-stage root folders: `_name/` (underscored)
- Verification notes: `output/verification.md` per stage
- Open decisions logged in verification files, not in the spec

## Manual setup (human-only, before 02)
Google Cloud Console OAuth client per the spec's MANUAL SETUP section.
If v2's client ID exists, it carries over — put it in `.env.local` as
`VITE_GOOGLE_CLIENT_ID=`. Claude cannot do this step.
