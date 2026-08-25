// STAGE 04 — day drawer + event form. Behaviour ported from
// year-planner-v2.html (fields, validation, series-delete confirmation);
// layout is v3's. The instance-vs-series choice is NOT from v2 — v2 had no
// such UI — it comes from the spec's Calendar API section.
//
// Module boundary: UI -> state.ts -> gcal.ts. This file never touches gcal.

import { allCategories, categoryOf } from './categories.ts';
import {
  civilFromDay,
  createEvent,
  dayFromCivil,
  deleteEvent,
  eventsOnDay,
  noteForDay,
  saveNote,
  updateEvent,
} from './state.ts';
import type {
  CalendarEvent,
  Category,
  CategoryName,
  DayNumber,
  EventDraft,
  EventSpan,
  MinuteOfDay,
  RecurrenceScope,
} from './types.ts';

const DAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const REPEATS: Array<[string, string]> = [
  ['', 'Does not repeat'],
  ['DAILY', 'Daily'],
  ['WEEKLY', 'Weekly'],
  ['MONTHLY', 'Monthly'],
  ['YEARLY', 'Yearly'],
];

let root: HTMLElement | null = null;
let els: Record<string, HTMLElement> = {};
let currentDay: DayNumber | null = null;
let editing: CalendarEvent | null = null;
let open = false;
/**
 * STAGE 07 — the note editor is open. Same transient-UI rule as the event
 * form: a month landing from a background refresh must not wipe what is
 * being typed, so refresh() stands down while this is true.
 */
let notingOpen = false;

// -- small display-boundary helpers ------------------------------------------

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function isoOf(day: DayNumber): string {
  const c = civilFromDay(day);
  return `${c.year}-${pad2(c.month)}-${pad2(c.day)}`;
}

function dayOfIso(iso: string): DayNumber {
  const [year, month, day] = iso.split('-').map(Number);
  return dayFromCivil(year, month, day);
}

function minutesOf(hhmm: string): MinuteOfDay {
  const [h, m] = hhmm.split(':').map(Number);
  return (h * 60 + m) as MinuteOfDay;
}

function hhmmOf(minute: number): string {
  return `${pad2(Math.floor(minute / 60))}:${pad2(minute % 60)}`;
}

function isRecurring(event: CalendarEvent): boolean {
  return Boolean(event.recurringEventId ?? event.recurrence?.length);
}

function input(id: string): HTMLInputElement {
  return els[id] as HTMLInputElement;
}

// -- toast --------------------------------------------------------------------

let toastEl: HTMLElement | null = null;
let toastTimer = 0;

function toast(message: string, tone: 'ok' | 'bad' = 'ok'): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    document.body.append(toastEl);
  }
  toastEl.textContent = message;
  toastEl.dataset.tone = tone;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toastEl) toastEl.hidden = true;
  }, 3200);
}

// -- construction --------------------------------------------------------------

function field(label: string, control: HTMLElement, cls = ''): HTMLElement {
  const row = document.createElement('div');
  row.className = `frow ${cls}`.trim();
  const lab = document.createElement('label');
  lab.textContent = label;
  row.append(lab, control);
  return row;
}

function build(host: HTMLElement): void {
  host.innerHTML = '';
  const overlay = document.createElement('div');
  overlay.className = 'dr-overlay';
  overlay.addEventListener('click', closeDrawer);

  const panel = document.createElement('div');
  panel.className = 'dr-panel';

  // --- head
  const head = document.createElement('header');
  head.className = 'dr-head';
  const date = document.createElement('div');
  date.className = 'dr-date';
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'dr-x';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', closeDrawer);
  head.append(date, close);

  // --- notes panel (STAGE 07), above the events list per the spec
  const notes0 = document.createElement('section');
  notes0.className = 'dr-notes';

  const noteView = document.createElement('button');
  noteView.type = 'button';
  noteView.className = 'dr-noteview';
  noteView.addEventListener('click', () => showNoteEditor(true));

  const noteEdit = document.createElement('div');
  noteEdit.className = 'dr-noteedit';
  noteEdit.hidden = true;
  const noteText = document.createElement('textarea');
  noteText.rows = 4;
  noteText.placeholder = 'A note for this day…';
  const noteErr = document.createElement('div');
  noteErr.className = 'formerr';
  noteErr.hidden = true;
  const noteFoot = document.createElement('div');
  noteFoot.className = 'dr-notefoot';
  const noteCancel = document.createElement('button');
  noteCancel.type = 'button';
  noteCancel.className = 'btn';
  noteCancel.textContent = 'Cancel';
  noteCancel.addEventListener('click', () => showNoteEditor(false));
  const noteSave = document.createElement('button');
  noteSave.type = 'button';
  noteSave.className = 'btn primary grow';
  noteSave.textContent = 'Save';
  noteSave.addEventListener('click', () => void onSaveNote());
  noteFoot.append(noteCancel, noteSave);
  noteEdit.append(noteText, noteErr, noteFoot);
  notes0.append(noteView, noteEdit);

  // --- list
  const list = document.createElement('div');
  list.className = 'dr-list';

  const foot = document.createElement('div');
  foot.className = 'dr-foot';
  const newBtn = document.createElement('button');
  newBtn.type = 'button';
  newBtn.className = 'btn primary';
  newBtn.textContent = '+ New event';
  newBtn.addEventListener('click', () => openForm(null));
  foot.append(newBtn);

  // --- form
  const form = document.createElement('form');
  form.className = 'dr-form';
  form.hidden = true;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    void onSave();
  });

  const title = document.createElement('input');
  title.type = 'text';
  title.autocomplete = 'off';

  const cats = document.createElement('div');
  cats.className = 'catpick';

  const startDate = document.createElement('input');
  startDate.type = 'date';
  const endDate = document.createElement('input');
  endDate.type = 'date';
  const dates = document.createElement('div');
  dates.className = 'pair';
  dates.append(field('Start date', startDate), field('End date', endDate));

  const allDay = document.createElement('input');
  allDay.type = 'checkbox';
  const allDayRow = document.createElement('label');
  allDayRow.className = 'checkrow';
  allDayRow.append(allDay, document.createTextNode(' All day'));

  const startTime = document.createElement('input');
  startTime.type = 'time';
  startTime.value = '09:00';
  const endTime = document.createElement('input');
  endTime.type = 'time';
  endTime.value = '10:00';
  const times = document.createElement('div');
  times.className = 'pair';
  times.append(field('Start', startTime), field('End', endTime));
  allDay.addEventListener('change', () => {
    times.hidden = allDay.checked;
  });

  const repeat = document.createElement('select');
  for (const [value, label] of REPEATS) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = label;
    repeat.append(option);
  }

  const notes = document.createElement('textarea');
  notes.rows = 3;

  // Instance vs series. Spec: offer both, default "this occurrence".
  const scope = document.createElement('div');
  scope.className = 'scopepick';
  scope.hidden = true;
  for (const [value, label] of [
    ['instance', 'This occurrence'],
    ['series', 'Whole series'],
  ]) {
    const opt = document.createElement('label');
    opt.className = 'scopeopt';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'scope';
    radio.value = value;
    if (value === 'instance') radio.checked = true;
    opt.append(radio, document.createTextNode(` ${label}`));
    scope.append(opt);
  }

  const error = document.createElement('div');
  error.className = 'formerr';
  error.hidden = true;

  const body = document.createElement('div');
  body.className = 'fbody';
  body.append(
    field('Title', title),
    field('Category', cats),
    dates,
    allDayRow,
    times,
    field('Repeats', repeat),
    field('Notes', notes),
    scope,
    error,
  );

  const formFoot = document.createElement('div');
  formFoot.className = 'dr-formfoot';
  const del = document.createElement('button');
  del.type = 'button';
  del.className = 'btn danger';
  del.textContent = 'Delete';
  del.hidden = true;
  del.addEventListener('click', () => void onDelete());
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = 'Cancel';
  cancel.addEventListener('click', () => showForm(false));
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn primary grow';
  save.textContent = 'Save';
  formFoot.append(del, cancel, save);
  form.append(body, formFoot);

  panel.append(head, notes0, list, foot, form);
  host.append(overlay, panel);

  els = {
    date, list, foot, form, title, cats, startDate, endDate, allDay,
    times, startTime, endTime, repeat, notes, scope, error, del, save,
    notes0, noteView, noteEdit, noteText, noteErr, noteSave,
  };
}

// -- category picker -----------------------------------------------------------

// STAGE 08: the set is the user's, so the default is "the first one", not a
// literal name — 'work' may not exist.
let chosenCategory: CategoryName = '';

function paintCategories(): void {
  const host = els.cats;
  host.replaceChildren();
  const categories = allCategories();
  // The chosen one may have been renamed out of existence between openings of
  // the form; fall back to the first chip rather than showing none selected.
  if (!categories.some((c) => c.name === chosenCategory)) {
    chosenCategory = (categories[0] as Category).name;
  }
  for (const category of categories) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'catopt';
    option.dataset.cat = category.name;
    if (category.name === chosenCategory) option.dataset.sel = '1';
    const dot = document.createElement('span');
    dot.className = 'catdot';
    option.append(dot, document.createTextNode(category.label));
    option.addEventListener('click', () => {
      chosenCategory = category.name;
      paintCategories();
    });
    host.append(option);
  }
}

// -- notes (STAGE 07) ----------------------------------------------------------
// The drawer knows nothing about extended properties or upsert rules: it reads
// noteForDay() and writes saveNote(). Deleting is saving empty text.

/** The note's text: the full body, falling back to the derived title. */
function noteTextOf(note: CalendarEvent | undefined): string {
  return note?.notes ?? note?.title ?? '';
}

function paintNote(): void {
  if (currentDay === null || !els.noteView) return;
  // Never repaint under an open editor — that is the transient-UI rule.
  if (notingOpen) return;
  const text = noteTextOf(noteForDay(currentDay));
  els.noteView.textContent = text || '+ Add a note';
  els.noteView.dataset.empty = text ? '0' : '1';
}

function showNoteEditor(on: boolean): void {
  if (currentDay === null) return;
  notingOpen = on;
  els.noteView.hidden = on;
  els.noteEdit.hidden = !on;
  els.noteErr.hidden = true;
  if (on) {
    const area = els.noteText as HTMLTextAreaElement;
    area.value = noteTextOf(noteForDay(currentDay));
    area.focus();
  } else {
    paintNote();
  }
}

async function onSaveNote(): Promise<void> {
  if (currentDay === null) return;
  const area = els.noteText as HTMLTextAreaElement;
  const text = area.value;
  const save = els.noteSave as HTMLButtonElement;
  save.disabled = true;
  save.textContent = 'Saving…';
  try {
    await saveNote(currentDay, text);
    toast(text.trim() ? 'Note saved' : 'Note deleted');
    // Clear the guard before repainting, or paintNote() would stand down.
    notingOpen = false;
    showNoteEditor(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.';
    els.noteErr.textContent = message;
    els.noteErr.hidden = false;
    toast(message, 'bad');
  }
  save.disabled = false;
  save.textContent = 'Save';
}

// -- list ----------------------------------------------------------------------

function timeText(event: CalendarEvent): string {
  if (event.span.kind === 'allDay') return 'All day';
  const h = Math.floor(event.span.startMinute / 60);
  const m = event.span.startMinute % 60;
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = h < 12 ? 'am' : 'pm';
  return m === 0 ? `${hour12}${suffix}` : `${hour12}:${pad2(m)}${suffix}`;
}

function paintList(): void {
  if (currentDay === null) return;
  const civil = civilFromDay(currentDay);
  const dow = ((((currentDay + 3) % 7) + 7) % 7);
  els.date.textContent = `${DAYS_FULL[dow]}, ${MONTHS[civil.month - 1]} ${civil.day}`;

  paintNote();

  const events = eventsOnDay(currentDay).filter((event) => !event.isDayNote);
  els.list.replaceChildren();
  if (events.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'dr-empty';
    empty.textContent = 'Nothing scheduled. Add something below.';
    els.list.append(empty);
    return;
  }
  for (const event of events) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'evrow';
    row.dataset.cat = event.category;
    if (event.pending) row.dataset.pending = '1';
    const t = document.createElement('div');
    t.className = 'evtitle';
    t.textContent = event.title + (isRecurring(event) ? ' ↻' : '');
    const m = document.createElement('div');
    m.className = 'evmeta';
    // The label, not the key: a category's name is machinery, its label is
    // what the user typed.
    m.textContent = `${timeText(event)} · ${categoryOf(event.category).label}`;
    row.append(t, m);
    row.addEventListener('click', () => openForm(event));
    els.list.append(row);
  }
}

// -- form ----------------------------------------------------------------------

function showForm(on: boolean): void {
  els.list.hidden = on;
  els.foot.hidden = on;
  els.notes0.hidden = on;
  els.form.hidden = !on;
  els.error.hidden = true;
  if (!on) {
    editing = null;
    paintList();
  }
}

function openForm(event: CalendarEvent | null): void {
  editing = event;
  chosenCategory = event ? event.category : chosenCategory;
  paintCategories();

  input('title').value = event?.title ?? '';
  const start = event ? event.span.start : (currentDay as DayNumber);
  input('startDate').value = isoOf(start);
  input('endDate').value =
    event && event.span.end > event.span.start ? isoOf(event.span.end) : '';

  const allDay = event ? event.span.kind === 'allDay' : true;
  input('allDay').checked = allDay;
  els.times.hidden = allDay;
  if (event && event.span.kind === 'timed') {
    input('startTime').value = hhmmOf(event.span.startMinute);
    input('endTime').value = hhmmOf(event.span.endMinute);
  }

  const repeat = els.repeat as unknown as HTMLSelectElement;
  repeat.value = '';
  // Changing an existing event's recurrence rule is out of scope; the API
  // treats it as a different kind of write. v2 disabled it too.
  repeat.disabled = Boolean(event);

  (els.notes as HTMLTextAreaElement).value = event?.notes ?? '';
  els.scope.hidden = !(event && isRecurring(event));
  els.del.hidden = !event;
  showForm(true);
}

function chosenScope(): RecurrenceScope {
  const checked = els.scope.querySelector<HTMLInputElement>('input:checked');
  return checked?.value === 'series' ? 'series' : 'instance';
}

function fail(message: string): void {
  els.error.textContent = message;
  els.error.hidden = false;
}

/** Validation ported from v2, with the same messages. */
function readForm(): EventDraft | null {
  const title = input('title').value.trim();
  const date = input('startDate').value;
  const dateEnd = input('endDate').value;
  const allDay = input('allDay').checked;
  const start = input('startTime').value;
  const end = input('endTime').value;
  const notes = (els.notes as HTMLTextAreaElement).value.trim();
  const repeat = (els.repeat as unknown as HTMLSelectElement).value;

  if (!title) {
    fail('Title is required.');
    return null;
  }
  if (!date) {
    fail('Start date is required.');
    return null;
  }
  if (dateEnd && dateEnd < date) {
    fail('End date is before start date.');
    return null;
  }
  if (dateEnd && dateEnd > date && !allDay) {
    fail('Multi-day events must be all-day.');
    return null;
  }
  if (!allDay && end <= start) {
    fail('End time must be after start time.');
    return null;
  }

  const startDay = dayOfIso(date);
  const span: EventSpan = allDay
    ? { kind: 'allDay', start: startDay, end: dateEnd ? dayOfIso(dateEnd) : startDay }
    : {
        kind: 'timed',
        start: startDay,
        end: startDay,
        startMinute: minutesOf(start),
        endMinute: minutesOf(end),
      };

  const draft: EventDraft = { title, category: chosenCategory, span };
  if (notes) draft.notes = notes;
  if (repeat && !editing) draft.recurrence = [`RRULE:FREQ=${repeat}`];
  return draft;
}

async function onSave(): Promise<void> {
  const draft = readForm();
  if (!draft) return;
  const save = els.save as HTMLButtonElement;
  save.disabled = true;
  save.textContent = 'Saving…';
  try {
    if (editing) {
      await updateEvent(editing, draft, chosenScope());
      toast('Updated');
    } else {
      await createEvent(draft);
      toast('Added to Google Calendar');
    }
    showForm(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed.';
    fail(message);
    toast(message, 'bad');
  }
  save.disabled = false;
  save.textContent = 'Save';
}

async function onDelete(): Promise<void> {
  if (!editing) return;
  const scope = chosenScope();
  if (
    isRecurring(editing) &&
    scope === 'series' &&
    // eslint-disable-next-line no-alert -- ported from v2; the spec requires a confirmation
    !confirm('This deletes the whole series. Continue?')
  ) {
    return;
  }
  const del = els.del as HTMLButtonElement;
  del.disabled = true;
  del.textContent = 'Deleting…';
  try {
    await deleteEvent(editing, scope);
    toast('Deleted');
    showForm(false);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed.';
    fail(message);
    toast(message, 'bad');
  }
  del.disabled = false;
  del.textContent = 'Delete';
}

// -- public interface ----------------------------------------------------------

/** Open the drawer on a day: its events, plus the add form. */
export function openDay(day: DayNumber): void {
  root ??= document.getElementById('drawer');
  if (!root) return;
  if (!els.list) build(root);
  currentDay = day;
  editing = null;
  open = true;
  notingOpen = false;
  root.hidden = false;
  showNoteEditor(false);
  showForm(false);
  paintList();
}

/**
 * STAGE 05 — open the drawer directly on the blank add form for a day.
 * The FAB's path: one tap to a ready-to-type form, no intermediate list.
 */
export function openAdd(day: DayNumber): void {
  openDay(day);
  openForm(null);
}

/** Open the edit form for one event; offers instance vs series. */
export function editEvent(event: CalendarEvent): void {
  if (!open) openDay(event.span.start);
  openForm(event);
}

export function closeDrawer(): void {
  if (!root) return;
  open = false;
  root.hidden = true;
  editing = null;
  notingOpen = false;
}

export function isOpen(): boolean {
  return open;
}

/**
 * Repaint the day list after a background refresh. Deliberately a no-op while
 * the form OR the note editor is showing: a month arriving must never wipe
 * what is being typed.
 */
export function refresh(): void {
  if (open && els.form && els.form.hidden && !notingOpen) paintList();
}
