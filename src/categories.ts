// STAGE 02 — category <-> colorId mapping.
// Existing v2 events depend on these exact ids; do not renumber.
// Ported verbatim from year-planner-v2.html lines 257-262.

import type { Category, CategoryName, ColorId } from './types.ts';

const CATEGORIES: Record<CategoryName, Category> = {
  work: { name: 'work', colorId: '9' as ColorId, hex: '#3056D3', label: 'Work' },
  personal: { name: 'personal', colorId: '10' as ColorId, hex: '#17925A', label: 'Personal' },
  financial: { name: 'financial', colorId: '5' as ColorId, hex: '#D97706', label: 'Financial' },
  other: { name: 'other', colorId: '8' as ColorId, hex: '#64748B', label: 'Other' },
};

const ORDER: readonly CategoryName[] = ['work', 'personal', 'financial', 'other'];
const ORDERED: readonly Category[] = ORDER.map((name) => CATEGORIES[name]);

const BY_COLOR_ID: Record<string, CategoryName> = {};
for (const name of ORDER) BY_COLOR_ID[CATEGORIES[name].colorId] = name;

/** The four categories, in display order. */
export function allCategories(): readonly Category[] {
  return ORDERED;
}

export function categoryOf(name: CategoryName): Category {
  return CATEGORIES[name];
}

/** Unknown or absent colorId resolves to 'other'. */
export function categoryFromColorId(colorId: string | undefined): CategoryName {
  if (colorId === undefined) return 'other';
  return BY_COLOR_ID[String(colorId)] ?? 'other';
}

export function colorIdFor(name: CategoryName): ColorId {
  return CATEGORIES[name].colorId;
}
