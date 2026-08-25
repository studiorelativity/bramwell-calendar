// STAGE 02 — category <-> colorId mapping.
// STAGE 08 — the set became the user's. This file no longer *holds* four
// categories; it *resolves* whatever list it was given, and it owns the three
// colour tables the app names anywhere: Google's eleven event colours, the
// four seed categories, and the curated moods.
//
// Two boundaries hold this file's shape:
//   1. It imports types and nothing else. In particular NOT state.ts — the
//      graph is state -> gcal -> categories, and reading prefs from here would
//      close it into a cycle. main.ts reads prefs and calls configure().
//   2. It is DOM-free. themeCss() returns a string; main.ts owns the <style>.

import type { Category, CategoryName, ColorId, StoredCategory } from './types.ts';

/**
 * Google Calendar has exactly 11 event colorIds, and the colorId is the only
 * channel by which an event read back from Google resolves to a category. One
 * category per colorId, therefore at most eleven categories.
 */
export const MAX_CATEGORIES = 11;

// ---------------------------------------------------------------------------
// Google's eleven event colours — layer 1
// ---------------------------------------------------------------------------

export interface GoogleColor {
  id: ColorId;
  /** Google's own name for it, as shown in the Google Calendar apps. */
  name: string;
  /** Google's own hex, as the Google apps paint it. */
  hex: string;
}

const GOOGLE: readonly GoogleColor[] = [
  { id: '1' as ColorId, name: 'Lavender', hex: '#7986cb' },
  { id: '2' as ColorId, name: 'Sage', hex: '#33b679' },
  { id: '3' as ColorId, name: 'Grape', hex: '#8e24aa' },
  { id: '4' as ColorId, name: 'Flamingo', hex: '#e67c73' },
  { id: '5' as ColorId, name: 'Banana', hex: '#f6bf26' },
  { id: '6' as ColorId, name: 'Tangerine', hex: '#f4511e' },
  { id: '7' as ColorId, name: 'Peacock', hex: '#039be5' },
  { id: '8' as ColorId, name: 'Graphite', hex: '#616161' },
  { id: '9' as ColorId, name: 'Blueberry', hex: '#3f51b5' },
  { id: '10' as ColorId, name: 'Basil', hex: '#0b8043' },
  { id: '11' as ColorId, name: 'Tomato', hex: '#d50000' },
];

export function googleColors(): readonly GoogleColor[] {
  return GOOGLE;
}

export function googleColor(id: ColorId): GoogleColor | undefined {
  return GOOGLE.find((c) => c.id === id);
}

// ---------------------------------------------------------------------------
// The seed — what a fresh install, and every install predating stage 08, gets
// ---------------------------------------------------------------------------

/**
 * The colorIds are frozen: events already in the user's calendar carry them.
 * The display hexes are stage 05's approved values, seeded EXPLICITLY as
 * overrides — Google's own hexes for 9/10/5/8 are different colours, so
 * without these a fresh install would not render like v3 did. This is what
 * makes "indistinguishable from today" true rather than nearly true.
 */
export const SEED: readonly StoredCategory[] = [
  { name: 'work', label: 'Work', colorId: '9' as ColorId, displayHex: '#3056d3' },
  { name: 'personal', label: 'Personal', colorId: '10' as ColorId, displayHex: '#17925a' },
  { name: 'financial', label: 'Financial', colorId: '5' as ColorId, displayHex: '#d97706' },
  { name: 'other', label: 'Other', colorId: '8' as ColorId, displayHex: '#64748b' },
];

export const SEED_FALLBACK: CategoryName = 'other';

// ---------------------------------------------------------------------------
// Dark-mode colour derivation
// ---------------------------------------------------------------------------

/**
 * The four seed hues have hand-picked dark variants (index.html, stage 05);
 * `brighten` would land near them but not on them, and "near" is not
 * pixel-identity. Keyed by lower-case display hex.
 */
const DARK_TWIN: Record<string, string> = {
  '#3056d3': '#7b96ff',
  '#17925a': '#4fc48d',
  '#d97706': '#f0a13c',
  '#64748b': '#94a3b8',
};

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return null;
  let body = m[1] as string;
  if (body.length === 3) body = body.replace(/./g, (ch) => ch + ch);
  return [
    parseInt(body.slice(0, 2), 16),
    parseInt(body.slice(2, 4), 16),
    parseInt(body.slice(4, 6), 16),
  ];
}

/** `#abc` and `ABC123` both normalize to `#aabbcc` / `#abc123`. */
export function normalizeHex(hex: string): string | null {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  return `#${rgb.map((c) => c.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * A dark-mode variant of an arbitrary hue: raise lightness to a floor and cap
 * saturation. Light-mode hues fail contrast on tinted dark fills (spec,
 * Visual direction), and a user's custom colour gets the same treatment the
 * built-in ones were given by hand.
 */
function brighten(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  const l2 = Math.max(l, 0.62);
  const s2 = Math.min(s, 0.72);
  const c = (1 - Math.abs(2 * l2 - 1)) * s2;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l2 - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const table: [number, number, number][] = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ];
  const [rr, gg, bb] = table[seg] as [number, number, number];
  const out = [rr + m, gg + m, bb + m].map((v) =>
    Math.max(0, Math.min(255, Math.round(v * 255)))
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${out.join('')}`;
}

/** The colour a category paints in dark mode. */
function darkHexOf(hex: string): string {
  return DARK_TWIN[hex.toLowerCase()] ?? brighten(hex);
}

// ---------------------------------------------------------------------------
// Moods — the surface and month-band wash
// ---------------------------------------------------------------------------

/** `[--band-a, --band-b, --band-a-we, --band-b-we]`; `--surface` is band A. */
type Bands = readonly [string, string, string, string];

export interface Mood {
  id: string;
  label: string;
  light: Bands;
  dark: Bands;
}

/**
 * A curated set, deliberately not a picker: the restraint rule survives
 * customization, and the month-band contrast is a Definition-of-done item.
 *
 * Every mood but `warm` was generated on the SAME mean-luminance ladder as
 * `warm` — same lightness per band, only the hue lean differs — so band
 * contrast is a property of the set rather than of the choice. Measured
 * band-A/band-B contrast across the five: 1.09-1.12 in light, 1.09-1.12 in
 * dark, against `warm`'s 1.10/1.11. `warm` carries stage 05's literal values,
 * so choosing it is a byte-for-byte no-op against index.html.
 */
const MOODS: readonly Mood[] = [
  {
    id: 'warm',
    label: 'Warm',
    light: ['#faf9f7', '#f0eeea', '#f2f0ec', '#e8e5df'],
    dark: ['#151210', '#211d18', '#1c1815', '#29241e'],
  },
  {
    id: 'paper',
    label: 'Paper',
    light: ['#fcfaf4', '#f4f0e4', '#f6f2e6', '#eee8d6'],
    dark: ['#16140d', '#231f13', '#1e1a11', '#2c2718'],
  },
  {
    id: 'cool',
    label: 'Cool',
    light: ['#f6f8fc', '#e8ecf4', '#eaeef6', '#dce2ee'],
    dark: ['#0f1116', '#171b23', '#14171e', '#1d222c'],
  },
  {
    id: 'sage',
    label: 'Sage',
    light: ['#f6faf9', '#e9f1ee', '#ebf3f0', '#dde9e5'],
    dark: ['#0f1413', '#18201d', '#151b19', '#1e2824'],
  },
  {
    id: 'dusk',
    label: 'Dusk',
    light: ['#faf6fa', '#f0e8f1', '#f2eaf3', '#e8dce9'],
    dark: ['#140f14', '#201720', '#1b141b', '#271d28'],
  },
];

export const SEED_MOOD = 'warm';

export function moods(): readonly Mood[] {
  return MOODS;
}

// ---------------------------------------------------------------------------
// The live set
// ---------------------------------------------------------------------------

let list: StoredCategory[] = SEED.map((c) => ({ ...c }));
let fallbackName: CategoryName = SEED_FALLBACK;
let moodId: string = SEED_MOOD;

let resolved: Category[] = [];
let byColorId: Record<string, CategoryName> = {};
let byName: Record<string, Category> = {};

function reindex(): void {
  resolved = list.map((c) => ({ ...c, hex: c.displayHex ?? googleColor(c.colorId)?.hex ?? '#64748b' }));
  byColorId = {};
  byName = {};
  for (const c of resolved) {
    byColorId[c.colorId] = c.name;
    byName[c.name] = c;
  }
}

/**
 * Accept a stored list, repairing anything that would break an invariant. The
 * prefs blob is user-visible JSON in localStorage and survives across
 * versions, so it is treated as untrusted input rather than as our own state.
 */
function sanitize(input: readonly StoredCategory[] | undefined): StoredCategory[] {
  if (!Array.isArray(input) || input.length === 0) return SEED.map((c) => ({ ...c }));
  const out: StoredCategory[] = [];
  const takenNames = new Set<string>();
  const takenColors = new Set<string>();
  for (const raw of input) {
    if (!raw || typeof raw.name !== 'string' || typeof raw.label !== 'string') continue;
    const colorId = String(raw.colorId) as ColorId;
    // Unknown colorId, duplicate colorId, duplicate name: all would make the
    // read-side mapping ambiguous. First writer wins; the rest are dropped.
    if (!googleColor(colorId)) continue;
    if (takenNames.has(raw.name) || takenColors.has(colorId)) continue;
    takenNames.add(raw.name);
    takenColors.add(colorId);
    const entry: StoredCategory = { name: raw.name, label: raw.label, colorId };
    const hex = typeof raw.displayHex === 'string' ? normalizeHex(raw.displayHex) : null;
    if (hex) entry.displayHex = hex;
    out.push(entry);
    if (out.length === MAX_CATEGORIES) break;
  }
  return out.length ? out : SEED.map((c) => ({ ...c }));
}

/**
 * Install the user's set. Called by main.ts at boot from prefs, and by
 * chrome.ts on every edit. Absent arguments mean the seed — which is what
 * makes a pre-stage install indistinguishable from a fresh one.
 */
export function configure(next: {
  categories?: readonly StoredCategory[];
  fallbackCategory?: CategoryName;
  mood?: string;
}): void {
  list = sanitize(next.categories);
  const wanted = next.fallbackCategory;
  fallbackName =
    wanted !== undefined && list.some((c) => c.name === wanted)
      ? wanted
      : (list.find((c) => c.name === SEED_FALLBACK)?.name ?? (list[0] as StoredCategory).name);
  moodId = MOODS.some((m) => m.id === next.mood) ? (next.mood as string) : SEED_MOOD;
  reindex();
}

reindex();

/** The categories, in display order, with display colours resolved. */
export function allCategories(): readonly Category[] {
  return resolved;
}

/** The stored shape, for chrome.ts to edit and persist. */
export function storedCategories(): readonly StoredCategory[] {
  return list;
}

export function currentMood(): string {
  return moodId;
}

/** The category unknown colorIds — and deleted category names — resolve to. */
export function fallbackCategory(): Category {
  return byName[fallbackName] ?? (resolved[0] as Category);
}

/** A name that is no longer in the set resolves to the fallback, never undefined. */
export function categoryOf(name: CategoryName): Category {
  return byName[name] ?? fallbackCategory();
}

/** Unknown or absent colorId on read resolves to the fallback. */
export function categoryFromColorId(colorId: string | undefined): CategoryName {
  if (colorId === undefined) return fallbackCategory().name;
  return byColorId[String(colorId)] ?? fallbackCategory().name;
}

export function colorIdFor(name: CategoryName): ColorId {
  return categoryOf(name).colorId;
}

/** What gcal.ts writes for a day note — the fallback is a role, not a name. */
export function fallbackColorId(): ColorId {
  return fallbackCategory().colorId;
}

/** colorIds already spoken for, so the UI can disable them elsewhere. */
export function usedColorIds(exceptName?: CategoryName): Set<string> {
  const used = new Set<string>();
  for (const c of list) if (c.name !== exceptName) used.add(c.colorId);
  return used;
}

/**
 * Mint a stable key for a new category. Names are immutable once created and
 * are what cached events point at, so a new one must never collide with an
 * existing one — including one the user deleted earlier this session, whose
 * events may still be in the cache.
 */
export function slugFor(label: string, taken: Iterable<string>): CategoryName {
  const held = new Set(taken);
  const base =
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'category';
  if (!held.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!held.has(candidate)) return candidate;
  }
}

// ---------------------------------------------------------------------------
// The CSS these produce — a pure string; main.ts owns the <style> element
// ---------------------------------------------------------------------------

function bandBlock(bands: Bands): string {
  return [
    `--surface:${bands[0]}`,
    `--band-a:${bands[0]}`,
    `--band-b:${bands[1]}`,
    `--band-a-we:${bands[2]}`,
    `--band-b-we:${bands[3]}`,
  ].join(';');
}

/**
 * One rule per category plus the mood tokens, light and dark.
 *
 * The base `[data-cat]` rule is load-bearing: an event whose category was
 * deleted still carries the old name, and without a base value its `--cat`
 * would be unset and the bar would paint as nothing. It resolves to the
 * fallback colour, which is exactly what the read path would have done.
 *
 * Per-frame cost is zero — render.ts still sets `data-cat` and nothing else.
 */
export function themeCss(): string {
  const mood = MOODS.find((m) => m.id === moodId) ?? (MOODS[0] as Mood);
  const fallback = fallbackCategory();

  const light: string[] = [`:root{${bandBlock(mood.light)}}`, `[data-cat]{--cat:${fallback.hex}}`];
  const dark: string[] = [
    `:root{${bandBlock(mood.dark)}}`,
    `[data-cat]{--cat:${darkHexOf(fallback.hex)}}`,
  ];

  for (const c of resolved) {
    const sel = `[data-cat="${c.name.replace(/"/g, '\\"')}"]`;
    light.push(`${sel}{--cat:${c.hex}}`);
    dark.push(`${sel}{--cat:${darkHexOf(c.hex)}}`);
    // Named per-category properties too: the settings sheet and any static
    // rule that wants one hue by name (index.html seeds the same four).
    light.push(`:root{--cat-${cssName(c.name)}:${c.hex}}`);
    dark.push(`:root{--cat-${cssName(c.name)}:${darkHexOf(c.hex)}}`);
  }

  return `${light.join('\n')}\n@media (prefers-color-scheme:dark){\n${dark.join('\n')}\n}`;
}

/** A category name as a CSS custom-property fragment. */
function cssName(name: CategoryName): string {
  return name.replace(/[^a-zA-Z0-9-]/g, '-');
}

/** The swatch pair a settings row shows: what Bramwell paints, what Google does. */
export function swatchPair(c: StoredCategory): { display: string; google: string } {
  const google = googleColor(c.colorId)?.hex ?? '#64748b';
  return { display: c.displayHex ?? google, google };
}
