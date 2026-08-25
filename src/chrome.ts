// STAGE 05 — everything around the grid: first-run screen, settings sheet,
// FAB, avatar/connection state. In the spec's file layout as of 2026-08-23.
//
// Boundaries: talks to auth.ts and state.ts through their public exports
// only; never touches gcal.ts or the render pipeline. main.ts passes
// callbacks for anything that belongs to scroll/view wiring, so this module
// stays ignorant of the scroller.
//
// Transient-UI rule (04's lesson): nothing here is rebuilt by cache changes.
// The sheet and the first-run screen live outside every repaint path, so a
// background month refresh cannot close or reset them by construction.

import { isSignedIn, signIn, signOut } from './auth.ts';
import {
  MAX_CATEGORIES,
  configure as configureCategories,
  currentMood,
  fallbackCategory as resolvedFallback,
  googleColor,
  googleColors,
  moods,
  normalizeHex,
  slugFor,
  storedCategories,
  swatchPair,
  usedColorIds,
} from './categories.ts';
import { isDemo, prefs, savePrefs } from './state.ts';
import type { CategoryName, ColorId, StoredCategory } from './types.ts';

export type ViewName = 'calendar' | 'year';
export type SnapDays = 15 | 30 | 45;

export interface ChromeCallbacks {
  /** Apply a snap granularity now (persisting is done here). */
  onSnapChange: (days: SnapDays) => void;
  /** Switch the visible view now (persisting the default is done here). */
  onViewChange: (view: ViewName) => void;
  /** Open the add form on the contextually right day (main decides which). */
  onAdd: () => void;
  /** Enter demo mode (stage 06). */
  onDemo: () => void;
  /** Leave demo mode and start real sign-in (stage 06). */
  onDemoExit: () => void;
  /**
   * The category set, a colour, or the mood changed (stage 08). categories.ts
   * already holds the new set and prefs already hold it too (except in demo);
   * this asks main.ts to re-emit the tokens and repaint.
   */
  onColorsChange: () => void;
}

let callbacks: ChromeCallbacks | null = null;
let firstRun: HTMLElement | null = null;
let sheet: HTMLElement | null = null;
let fab: HTMLButtonElement | null = null;
let avatarBtn: HTMLButtonElement | null = null;
let reconnectPill: HTMLButtonElement | null = null;
let demoPill: HTMLButtonElement | null = null;
let accountStatus: HTMLElement | null = null;
let accountAction: HTMLButtonElement | null = null;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

function segment<T>(
  options: readonly { value: T; label: string }[],
  selected: T,
  pick: (value: T) => void,
): HTMLElement {
  const group = el('div', 'seg');
  for (const option of options) {
    const button = el('button', 'segopt', option.label);
    button.type = 'button';
    button.setAttribute('aria-pressed', String(option.value === selected));
    button.addEventListener('click', () => {
      for (const sibling of group.children) sibling.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      pick(option.value);
    });
    group.append(button);
  }
  return group;
}

// -- first-run -----------------------------------------------------------------

function buildFirstRun(): HTMLElement {
  const screen = el('div', 'firstrun');
  screen.innerHTML = `
    <div class="fr-card">
      <div class="fr-mark">B</div>
      <h1 class="fr-name">Bramwell</h1>
      <p class="fr-blurb">A perpetual calendar for your Google Calendar.
        Weeks stack forever &mdash; months are labels, not walls.</p>
      <ul class="fr-what">
        <li>Weeks run top to bottom, without a break &mdash; scroll from this
          week into next month without turning a page.</li>
        <li>Zoom out to the whole year, back in to a single week.</li>
        <li>Tap a day to add an event, change one, or leave yourself a note.</li>
      </ul>
      <p class="fr-blurb fr-plain">Nothing fancy. A calendar that works the way you do.</p>
      <button class="fr-connect" type="button">
        <span class="fr-g">G</span>Connect Google Calendar
      </button>
      <p class="fr-fine">Your events stay in Google Calendar. Nothing is stored anywhere else.</p>
      <button class="fr-demo" type="button">Try the demo</button>
      <p class="fr-contact">Questions or trouble &mdash;
        <a href="mailto:hello@no.fail">hello@no.fail</a></p>
    </div>`;
  screen.querySelector('.fr-connect')?.addEventListener('click', () => signIn());
  screen.querySelector('.fr-demo')?.addEventListener('click', () => callbacks?.onDemo());
  document.body.append(screen);
  return screen;
}


// -- colors (STAGE 08) ---------------------------------------------------------
// The category set, its two colour layers, and the mood. Everything here edits
// a plain StoredCategory[] and hands it to categories.ts; this module never
// resolves a colour itself.

let colorsHost: HTMLElement | null = null;

/**
 * Install an edited set, persist it, and ask main.ts to repaint.
 *
 * Persisting is skipped in demo — customization applies in memory and writes
 * nothing, the same rule the demo cache follows. `storedCategories()` is read
 * back after `configure` so what is saved is what was actually accepted, not
 * what was proposed.
 */
function commitColors(patch: { categories?: StoredCategory[]; mood?: string }): void {
  const categories = patch.categories ?? storedCategories().map((c) => ({ ...c }));
  const mood = patch.mood ?? currentMood();
  // The fallback can never be deleted, so its name always survives an edit;
  // configure() re-picks one anyway if a corrupt prefs blob ever lost it.
  configureCategories({ categories, fallbackCategory: resolvedFallback().name, mood });
  if (!isDemo()) {
    savePrefs({
      categories: storedCategories().map((c) => ({ ...c })),
      fallbackCategory: resolvedFallback().name,
      mood: currentMood(),
    });
  }
  callbacks?.onColorsChange();
}

/**
 * Edit one category in place.
 *
 * `rebuild` is the focus rule: a label being typed must not have its input
 * torn out from under the caret, so text edits commit without repainting.
 * Structural edits (colorId, clearing an override) do repaint, because the
 * other rows' disabled colours change with them.
 */
function patchCategory(
  name: CategoryName,
  mutate: (c: StoredCategory) => void,
  rebuild: boolean,
): void {
  const next = storedCategories().map((c) => ({ ...c }));
  const target = next.find((c) => c.name === name);
  if (!target) return;
  mutate(target);
  commitColors({ categories: next });
  if (rebuild) paintColors();
}

function addCategory(): void {
  const next = storedCategories().map((c) => ({ ...c }));
  if (next.length >= MAX_CATEGORIES) return;
  const used = new Set(next.map((c) => c.colorId));
  const free = googleColors().find((gc) => !used.has(gc.id));
  if (!free) return; // unreachable: the cap and the palette are the same size
  const label = 'New category';
  const name = slugFor(
    label,
    next.map((c) => c.name),
  );
  next.push({ name, label, colorId: free.id });
  commitColors({ categories: next });
  paintColors();
  colorsHost?.querySelector<HTMLInputElement>(`.catrow[data-cat="${name}"] .catlab`)?.select();
}

function deleteCategory(name: CategoryName): void {
  if (name === resolvedFallback().name) return; // belt: the row has no control
  commitColors({ categories: storedCategories().filter((c) => c.name !== name).map((c) => ({ ...c })) });
  paintColors();
}

function swatch(kind: 'display' | 'google', hex: string, title: string): HTMLElement {
  const node = el('span', `catsw is-${kind}`);
  node.style.setProperty('--sw', hex);
  node.title = title;
  return node;
}

function categoryRow(cat: StoredCategory, fallback: CategoryName): HTMLElement {
  const row = el('div', 'catrow');
  row.dataset.cat = cat.name;
  const { display, google } = swatchPair(cat);
  const googleName = googleColor(cat.colorId)?.name ?? 'Unknown';

  // Line 1: what Bramwell paints, the label, and (unless this is the
  // fallback) removal.
  const main = el('div', 'catrow-main');

  const pickWrap = el('label', 'catcolorwrap');
  pickWrap.title = 'Colour shown in Bramwell';
  const shown = swatch('display', display, 'Colour shown in Bramwell');
  const picker = document.createElement('input');
  picker.type = 'color';
  picker.className = 'catcolorin';
  picker.value = display;
  picker.setAttribute('aria-label', `Display colour for ${cat.label}`);
  picker.addEventListener('input', () => {
    const hex = normalizeHex(picker.value);
    if (!hex) return;
    shown.style.setProperty('--sw', hex);
    // No rebuild: a colour input fires continuously while the user drags.
    patchCategory(cat.name, (c) => {
      c.displayHex = hex;
    }, false);
  });
  // The "clear" control only exists once an override does, so appearing is a
  // structural change — repaint on the way out of the picker, not during it.
  picker.addEventListener('change', () => paintColors());
  pickWrap.append(shown, picker);

  const label = document.createElement('input');
  label.type = 'text';
  label.className = 'catlab';
  label.value = cat.label;
  label.maxLength = 24;
  label.setAttribute('aria-label', 'Category name');
  label.addEventListener('input', () => {
    patchCategory(cat.name, (c) => {
      c.label = label.value;
    }, false);
  });
  label.addEventListener('blur', () => {
    if (label.value.trim()) return;
    // An empty label would leave an unclickable chip in the event form.
    label.value = 'Untitled';
    patchCategory(cat.name, (c) => {
      c.label = 'Untitled';
    }, false);
  });

  main.append(pickWrap, label);

  if (cat.name !== fallback) {
    const del = el('button', 'catdel', '&times;');
    del.type = 'button';
    del.setAttribute('aria-label', `Remove ${cat.label}`);
    // Two-step rather than a modal: a confirm() dialog on top of the sheet is
    // heavy for something that touches no data in Google.
    del.addEventListener('click', () => {
      if (del.dataset.armed === '1') {
        deleteCategory(cat.name);
        return;
      }
      del.dataset.armed = '1';
      del.textContent = 'Remove?';
    });
    main.append(del);
  } else {
    const role = el('span', 'catrole', 'fallback');
    role.title = 'Events with an unrecognised colour land here. Cannot be removed.';
    main.append(role);
  }

  // Line 2: what Google stores. Both swatches are visible at once, so a
  // divergence between the layers is something you can see rather than
  // discover in the Google Calendar app.
  const sub = el('div', 'catrow-sub');
  sub.append(swatch('google', google, `In Google Calendar: ${googleName}`));

  const select = document.createElement('select');
  select.className = 'catcol';
  select.setAttribute('aria-label', `Google colour for ${cat.label}`);
  const taken = usedColorIds(cat.name);
  for (const gc of googleColors()) {
    const option = document.createElement('option');
    option.value = gc.id;
    option.textContent = gc.name;
    option.style.color = gc.hex;
    // THE INVARIANT: a colorId held by another category is unreachable here,
    // so two categories on one colorId cannot be produced by clicking.
    if (taken.has(gc.id)) {
      option.disabled = true;
      option.textContent = `${gc.name} — in use`;
    }
    if (gc.id === cat.colorId) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', () => {
    patchCategory(cat.name, (c) => {
      c.colorId = select.value as ColorId;
    }, true);
  });
  sub.append(select);

  if (cat.displayHex) {
    const clear = el('button', 'catclear', 'Match Google');
    clear.type = 'button';
    clear.title = 'Drop the display colour and follow the Google colour';
    clear.addEventListener('click', () => {
      patchCategory(cat.name, (c) => {
        delete c.displayHex;
      }, true);
    });
    sub.append(clear);
  }

  row.append(main, sub);
  return row;
}

function moodPicker(): HTMLElement {
  const row = el('div', 'sheet-row');
  row.append(
    el('div', 'sheet-lab', 'Mood<span class="sheet-sub">Surface and month bands</span>'),
  );
  const group = el('div', 'moods');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Mood');
  for (const mood of moods()) {
    const option = el('button', 'moodopt');
    option.type = 'button';
    option.title = mood.label;
    option.setAttribute('aria-label', mood.label);
    option.setAttribute('aria-pressed', String(mood.id === currentMood()));
    // Both variants: the swatch shows the mood you would actually get, which
    // depends on the viewer's colour scheme.
    option.style.setProperty('--m-a', mood.light[0]);
    option.style.setProperty('--m-b', mood.light[1]);
    option.style.setProperty('--m-a-dark', mood.dark[0]);
    option.style.setProperty('--m-b-dark', mood.dark[1]);
    option.addEventListener('click', () => {
      commitColors({ mood: mood.id });
      paintColors();
    });
    group.append(option);
  }
  row.append(group);
  return row;
}

/** Rebuild the Colors section. Called only from its own edits — never from a
 *  cache change, which is what keeps the transient-UI rule true here. */
function paintColors(): void {
  const host = colorsHost;
  if (!host) return;
  host.replaceChildren();

  const list = storedCategories();
  const fallback = resolvedFallback().name;

  const head = el('div', 'sheet-sechead', 'Colors');
  head.append(
    el(
      'span',
      'sheet-sub',
      'The Google colour is what the Google Calendar app shows. ' +
        'The display colour is what Bramwell paints.',
    ),
  );
  host.append(head);

  const rows = el('div', 'catrows');
  for (const cat of list) rows.append(categoryRow(cat, fallback));
  host.append(rows);

  const addRow = el('div', 'catadd-row');
  const add = el('button', 'catadd', '+ Add category');
  add.type = 'button';
  add.disabled = list.length >= MAX_CATEGORIES;
  add.addEventListener('click', () => addCategory());
  addRow.append(add);
  if (add.disabled) {
    addRow.append(
      el(
        'span',
        'catcap',
        `${MAX_CATEGORIES} is the maximum — Google Calendar has ${MAX_CATEGORIES} event colours, ` +
          'and the colour is how an event finds its way back to a category.',
      ),
    );
  }
  host.append(addRow);

  host.append(moodPicker());
}

// -- settings sheet ------------------------------------------------------------

function buildSheet(): HTMLElement {
  const overlay = el('div', 'sheet-overlay');
  overlay.hidden = true;

  const card = el('div', 'sheet');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-label', 'Settings');

  const head = el('div', 'sheet-head', '<span>Settings</span>');
  const close = el('button', 'sheet-x', '&times;');
  close.type = 'button';
  close.setAttribute('aria-label', 'Close settings');
  close.addEventListener('click', () => toggleSheet(false));
  head.append(close);

  // Account row. The calendar.events scope carries no profile, so there is
  // no name or email to show — the row names the connection, not the person.
  const account = el('div', 'sheet-row');
  accountStatus = el('div', 'sheet-lab', 'Google Calendar<span class="sheet-sub"></span>');
  accountAction = el('button', 'sheet-auth', '');
  accountAction.type = 'button';
  accountAction.addEventListener('click', () => {
    if (isSignedIn()) signOut();
    else signIn();
    toggleSheet(false);
  });
  account.append(accountStatus, accountAction);

  const snapRow = el('div', 'sheet-row');
  snapRow.append(
    el('div', 'sheet-lab', 'Snap granularity<span class="sheet-sub">How far one flick travels</span>'),
    segment<SnapDays>(
      [
        { value: 15, label: '15' },
        { value: 30, label: '30' },
        { value: 45, label: '45' },
      ],
      prefs().snapStepDays ?? 30,
      (days) => {
        savePrefs({ snapStepDays: days });
        callbacks?.onSnapChange(days);
      },
    ),
  );

  const viewRow = el('div', 'sheet-row');
  viewRow.append(
    el('div', 'sheet-lab', 'Default view'),
    segment<ViewName>(
      [
        { value: 'calendar', label: 'Cal' },
        { value: 'year', label: 'Year' },
      ],
      prefs().defaultView ?? 'calendar',
      (view) => {
        savePrefs({ defaultView: view });
        callbacks?.onViewChange(view);
      },
    ),
  );

  const soundRow = el('div', 'sheet-row');
  soundRow.append(
    el('div', 'sheet-lab', 'Sound<span class="sheet-sub">Reserved &mdash; no audio shipped</span>'),
    segment<boolean>(
      [
        { value: false, label: 'Off' },
        { value: true, label: 'On' },
      ],
      prefs().soundEnabled,
      (on) => savePrefs({ soundEnabled: on }),
    ),
  );

  // Colors (stage 08). Built once here and repainted only by its own edits.
  colorsHost = el('div', 'sheet-colors');
  paintColors();

  card.append(head, account, snapRow, viewRow, soundRow, colorsHost);
  overlay.append(card);
  // Click on the dimmed backdrop closes; clicks inside the card do not bubble
  // to it because the card is a child — check the target.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) toggleSheet(false);
  });
  document.body.append(overlay);
  return overlay;
}

function paintAccountRow(): void {
  if (!accountStatus || !accountAction) return;
  const on = isSignedIn();
  const sub = accountStatus.querySelector('.sheet-sub');
  if (sub) sub.textContent = on ? 'Connected' : 'Signed out';
  accountAction.textContent = on ? 'Sign out' : 'Connect';
  accountAction.classList.toggle('danger', on);
}

export function toggleSheet(show?: boolean): void {
  if (!sheet) return;
  const next = show ?? sheet.hidden;
  if (next) paintAccountRow();
  sheet.hidden = !next;
}

// -- public interface ----------------------------------------------------------

export function initChrome(cb: ChromeCallbacks): void {
  callbacks = cb;

  firstRun = buildFirstRun();
  firstRun.hidden = true;
  sheet = buildSheet();

  fab = el('button', 'fab', '+');
  fab.type = 'button';
  fab.setAttribute('aria-label', 'Add event');
  fab.hidden = true;
  fab.addEventListener('click', () => cb.onAdd());
  document.body.append(fab);

  avatarBtn = document.getElementById('avatar-btn') as HTMLButtonElement | null;
  avatarBtn?.addEventListener('click', () => toggleSheet());

  reconnectPill = document.getElementById('reconnect-pill') as HTMLButtonElement | null;
  reconnectPill?.addEventListener('click', () => signIn());

  // Demo pill (stage 06): lives where the avatar would, exits demo into
  // real sign-in. Injected here rather than in index.html because it is
  // meaningless without this module.
  demoPill = el('button', 'hbtn demopill', 'Demo · Connect');
  demoPill.type = 'button';
  demoPill.hidden = true;
  avatarBtn?.before(demoPill);
  demoPill.addEventListener('click', () => cb.onDemoExit());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sheet && !sheet.hidden) toggleSheet(false);
  });
}

/**
 * Auth/cache state drives which shell shows. Called by main.ts from its
 * existing poll — auth.ts exports no change event by design.
 *
 * - no auth, no warm cache → first-run screen (nothing else)
 * - no auth, warm cache    → calendar read-only + reconnect pill (the
 *                            first-run screen never covers a warm cache)
 * - auth                   → calendar + avatar dot
 */
export function setAuthState(signedIn: boolean, warmCache: boolean, demo = false): void {
  // Demo (stage 06): a populated calendar with the demo pill in the
  // avatar's place. No first-run, no reconnect, no settings entry point.
  const showFirstRun = !demo && !signedIn && !warmCache;
  if (firstRun) firstRun.hidden = !showFirstRun;
  if (fab) fab.hidden = showFirstRun;
  if (avatarBtn) {
    avatarBtn.hidden = showFirstRun || demo;
    avatarBtn.classList.toggle('is-on', signedIn);
  }
  if (reconnectPill) reconnectPill.hidden = demo || signedIn || showFirstRun;
  if (demoPill) demoPill.hidden = !demo;
  if (sheet && !sheet.hidden) paintAccountRow();
  // Signing out with the sheet open while the cache is cold: the first-run
  // screen takes over, so the sheet must yield.
  if (showFirstRun && sheet && !sheet.hidden) toggleSheet(false);
}
