// Κατάσταση της εφαρμογής στη μνήμη + ενέργειες. Κάθε αλλαγή γράφεται αμέσως στη συσκευή
// και ειδοποιεί τον συγχρονισμό (αν υπάρχει σύνδεση με OneDrive).

import * as db from './db.js';
import {
  COLLECTIONS, COLORS, completeLesson, emptyData, mergeData, newId, nextStamp, skipLesson, teachingsOf, alive,
} from './model.js';

let data = emptyData();
const listeners = new Set();
let onChange = () => {};

export function getData() {
  return data;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(data);
}

/** Ο συγχρονισμός δηλώνει εδώ τι να γίνεται μετά από κάθε τοπική αλλαγή. */
export function setChangeHandler(fn) {
  onChange = fn;
}

export async function load() {
  data = await db.loadAll();
  emit();
}

/**
 * Δεδομένα από έξω (συγχρονισμός ή εισαγωγή αντιγράφου). Συγχωνεύονται με την τρέχουσα
 * κατάσταση, ώστε να μη χαθεί αλλαγή που έγινε όσο κατέβαιναν από το OneDrive.
 */
export async function mergeIn(incoming) {
  data = mergeData(data, incoming);
  emit();
  await db.replaceAll(data);
}

/** Γράφει εγγραφές σε μνήμη και συσκευή: save({ teachings: [t], entries: [e] }) */
async function save(changes) {
  const next = { ...data };
  for (const [c, records] of Object.entries(changes)) {
    const byId = new Map(next[c].map((r) => [r.id, r]));
    for (const r of records) byId.set(r.id, r);
    next[c] = [...byId.values()];
  }
  data = next;
  emit();
  await db.putRecords(changes);
  onChange();
}

const stamp = (r) => ({ ...r, updatedAt: nextStamp(r.updatedAt) });
const find = (c, id) => data[c].find((r) => r.id === id && !r.deleted);

// ---- Τμήματα ----
export function addClass(name) {
  const order = Math.max(-1, ...alive(data.classes).map((c) => c.order)) + 1;
  const cls = stamp({ id: newId(), name: name.trim(), order });
  save({ classes: [cls] });
  return cls;
}

export function renameClass(id, name) {
  return save({ classes: [stamp({ ...find('classes', id), name: name.trim() })] });
}

export function deleteClass(id) {
  const teachings = teachingsOf(data.teachings, id);
  return save({
    classes: [stamp({ ...find('classes', id), deleted: true })],
    teachings: teachings.map((t) => stamp({ ...t, deleted: true })),
    entries: alive(data.entries)
      .filter((e) => teachings.some((t) => t.id === e.teachingId))
      .map((e) => stamp({ ...e, deleted: true })),
  });
}

export function moveClass(id, delta) {
  const list = alive(data.classes).sort((a, b) => a.order - b.order);
  const i = list.findIndex((c) => c.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return;
  return save({
    classes: [stamp({ ...list[i], order: list[j].order }), stamp({ ...list[j], order: list[i].order })],
  });
}

// ---- Μαθήματα (μάθημα σε τμήμα) ----
export function addTeaching(classId, subject, color) {
  const siblings = teachingsOf(data.teachings, classId);
  const t = stamp({
    id: newId(),
    classId,
    subject: subject.trim(),
    color: color ?? COLORS[siblings.length % COLORS.length],
    order: Math.max(-1, ...siblings.map((s) => s.order)) + 1,
    plan: '',
    folder: null,
  });
  save({ teachings: [t] });
  return t;
}

export function updateTeaching(id, fields) {
  return save({ teachings: [stamp({ ...find('teachings', id), ...fields })] });
}

export function deleteTeaching(id) {
  return save({
    teachings: [stamp({ ...find('teachings', id), deleted: true })],
    entries: alive(data.entries).filter((e) => e.teachingId === id).map((e) => stamp({ ...e, deleted: true })),
  });
}

/** Ο προγραμματισμός (μεσαία στήλη) αποθηκεύεται καθώς γράφετε. */
export function setPlan(id, plan) {
  const t = find('teachings', id);
  if (!t || t.plan === plan) return;
  return save({ teachings: [stamp({ ...t, plan })] });
}

// ---- Καταγραφή μαθήματος ----
/** Επιστρέφει ό,τι χρειάζεται για αναίρεση. */
export async function markDone(teachingId, { date, actual }) {
  const before = find('teachings', teachingId);
  const { entry, teaching } = completeLesson(before, { date, actual });
  await save({ entries: [entry], teachings: [teaching] });
  return { entryId: entry.id, previousPlan: before.plan };
}

export async function markNotHeld(teachingId, { date, reason, note }) {
  const { entry } = skipLesson(find('teachings', teachingId), { date, reason, note });
  await save({ entries: [entry] });
  return { entryId: entry.id, previousPlan: null };
}

export async function undo(teachingId, { entryId, previousPlan }) {
  const changes = { entries: [stamp({ ...find('entries', entryId), deleted: true })] };
  if (previousPlan !== null) changes.teachings = [stamp({ ...find('teachings', teachingId), plan: previousPlan })];
  await save(changes);
}

export function updateEntry(id, fields) {
  return save({ entries: [stamp({ ...find('entries', id), ...fields })] });
}

export function deleteEntry(id) {
  return save({ entries: [stamp({ ...find('entries', id), deleted: true })] });
}
