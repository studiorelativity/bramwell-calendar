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
import { prefs, savePrefs } from './state.ts';

export type ViewName = 'calendar' | 'year';
export type SnapDays = 15 | 30 | 45;

export interface ChromeCallbacks {
  /** Apply a snap granularity now (persisting is done here). */
  onSnapChange: (days: SnapDays) => void;
  /** Switch the visible view now (persisting the default is done here). */
  onViewChange: (view: ViewName) => void;
  /** Open the add form on the contextually right day (main decides which). */
  onAdd: () => void;
}

let callbacks: ChromeCallbacks | null = null;
let firstRun: HTMLElement | null = null;
let sheet: HTMLElement | null = null;
let fab: HTMLButtonElement | null = null;
let avatarBtn: HTMLButtonElement | null = null;
let reconnectPill: HTMLButtonElement | null = null;
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
      <button class="fr-connect" type="button">
        <span class="fr-g">G</span>Connect Google Calendar
      </button>
      <p class="fr-fine">Your events stay in Google Calendar. Nothing is stored anywhere else.</p>
    </div>`;
  screen.querySelector('.fr-connect')?.addEventListener('click', () => signIn());
  document.body.append(screen);
  return screen;
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

  card.append(head, account, snapRow, viewRow, soundRow);
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
export function setAuthState(signedIn: boolean, warmCache: boolean): void {
  const showFirstRun = !signedIn && !warmCache;
  if (firstRun) firstRun.hidden = !showFirstRun;
  if (fab) fab.hidden = showFirstRun;
  if (avatarBtn) {
    avatarBtn.hidden = showFirstRun;
    avatarBtn.classList.toggle('is-on', signedIn);
  }
  if (reconnectPill) reconnectPill.hidden = signedIn || showFirstRun;
  if (sheet && !sheet.hidden) paintAccountRow();
  // Signing out with the sheet open while the cache is cold: the first-run
  // screen takes over, so the sheet must yield.
  if (showFirstRun && sheet && !sheet.hidden) toggleSheet(false);
}
