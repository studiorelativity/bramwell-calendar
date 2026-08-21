# Stage 01 — Scaffold

## Inputs
- L3: `../_references/BUILD-SPEC-V3.md` — sections **"Stack"**,
  **"File layout"**, **"PWA requirements"** (manifest portion only) — nothing else
- L3: `../_references/conventions.md`

## Process
1. Init Vite + vanilla TypeScript at repo root. No framework. Confirm
   `npm run dev` serves before writing any project code.
2. Create the exact file layout from the spec: `index.html`,
   `manifest.webmanifest`, and every `/src` module as a stub with its
   public interface declared and a `// STAGE NN` comment marking which
   stage implements it (auth/gcal/categories/state → 02; scroll/render → 03;
   drawer/sw → 04).
3. Write `src/types.ts` for real: `CalendarEvent`, `Category`, week-index
   types, cache shapes. Derive from the spec's API and layout sections —
   this file is the shared vocabulary for stages 02–04, so it is the one
   file this stage implements fully rather than stubs.
4. `manifest.webmanifest` complete with generated simple icons, `standalone`
   display, theme color.
5. `.gitignore` including `.env.local`. Git init + initial commit.

## Constraints
- Stubs export their spec-defined interfaces (e.g. `auth.ts` exports exactly
  `getToken`, `signIn`, `isSignedIn`) so later stages compile against them.
- No implementation logic beyond types.ts. Resist filling in easy modules.

## Outputs
- Repo-root source tree per spec file layout
- `output/verification.md`

## Gate
- `npm run dev` serves without errors
- `tsc --noEmit` passes — all stub imports resolve
- types.ts reviewed by human against the spec's API section
