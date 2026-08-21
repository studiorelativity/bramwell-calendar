// STAGE 02 — category <-> colorId mapping.
// Existing v2 events depend on these exact ids; do not renumber.
//   work "9" #3056D3 · personal "10" #17925A ·
//   financial "5" #D97706 · other "8" #64748B

import type { Category, CategoryName, ColorId } from './types.ts';

const TODO = 'STAGE 02: not implemented';

/** The four categories, in display order. */
export function allCategories(): readonly Category[] {
  throw new Error(TODO);
}

export function categoryOf(_name: CategoryName): Category {
  throw new Error(TODO);
}

/** Unknown or absent colorId resolves to 'other'. */
export function categoryFromColorId(_colorId: string | undefined): CategoryName {
  throw new Error(TODO);
}

export function colorIdFor(_name: CategoryName): ColorId {
  throw new Error(TODO);
}
