// Κατάσταση της εφαρμογής στη μνήμη + ενέργειες. Κάθε αλλαγή γράφεται αμέσως στη συσκευή
// και ειδοποιεί τον συγχρονισμό (αν υπάρχει σύνδεση με OneDrive).

import * as db from './db.js';
import {
  COLLECTIONS, COLORS, completeLesson, emptyData, mergeData, newId, nextStamp, skipLesson, teachingsOf, alive,
} from './model.js';
import { DEFAULT_TERM1_END, DEFAULT_WEIGHTS, markId, scoreId } from './grading.js';
import { studentKey } from './myschool.js';

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
/** Και σβησμένη εγγραφή: για σταθερά id (βαθμοί), ώστε η νέα τιμή να «κερδίζει» την ταφόπλακα. */
const findAny = (c, id) => data[c].find((r) => r.id === id);
const tombstone = (r) => stamp({ ...r, deleted: true });

/** Ό,τι του βαθμολογίου πρέπει να σβηστεί μαζί με μαθήματα ή/και μαθητές. */
function gradebookOf({ teachingIds = [], studentIds = [] }) {
  const teachings = new Set(teachingIds);
  const students = new Set(studentIds);
  const assessments = alive(data.assessments).filter((a) => teachings.has(a.teachingId));
  const assessmentIds = new Set(assessments.map((a) => a.id));
  return {
    assessments: assessments.map(tombstone),
    marks: alive(data.marks).filter((m) => assessmentIds.has(m.assessmentId) || students.has(m.studentId)).map(tombstone),
    scores: alive(data.scores).filter((s) => teachings.has(s.teachingId) || students.has(s.studentId)).map(tombstone),
  };
}

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
  const students = alive(data.students).filter((s) => s.classId === id);
  return save({
    classes: [tombstone(find('classes', id))],
    teachings: teachings.map(tombstone),
    entries: alive(data.entries).filter((e) => teachings.some((t) => t.id === e.teachingId)).map(tombstone),
    students: students.map(tombstone),
    ...gradebookOf({ teachingIds: teachings.map((t) => t.id), studentIds: students.map((s) => s.id) }),
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
    examined: false,
    weights: { ...DEFAULT_WEIGHTS },
  });
  save({ teachings: [t] });
  return t;
}

export function updateTeaching(id, fields) {
  return save({ teachings: [stamp({ ...find('teachings', id), ...fields })] });
}

export function deleteTeaching(id) {
  return save({
    teachings: [tombstone(find('teachings', id))],
    entries: alive(data.entries).filter((e) => e.teachingId === id).map(tombstone),
    ...gradebookOf({ teachingIds: [id] }),
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

// ---- Μαθητές ----
const normalizeClassName = (n) => String(n).replace(/\s+/g, '').toLocaleUpperCase('el');

/**
 * Εισαγωγή από τη λίστα του myschool: sections = [{ name, students: [{ order, surname, name, father }] }].
 * Τα τμήματα αντιστοιχίζονται με το όνομα (Α1 ↔ «Α1») ή δημιουργούνται. Οι μαθητές που υπάρχουν
 * ήδη στο τμήμα (ίδιο επώνυμο, όνομα, πατρώνυμο) ενημερώνονται· δεν διπλασιάζονται.
 */
export async function importStudents(sections) {
  const summary = { classesCreated: 0, added: 0, updated: 0 };
  const classes = [];
  const students = [];
  let order = Math.max(-1, ...alive(data.classes).map((c) => c.order));
  for (const section of sections) {
    let cls = alive(data.classes).find((c) => normalizeClassName(c.name) === normalizeClassName(section.name))
      ?? classes.find((c) => normalizeClassName(c.name) === normalizeClassName(section.name));
    if (!cls) {
      cls = stamp({ id: newId(), name: section.name, order: ++order });
      classes.push(cls);
      summary.classesCreated++;
    }
    const existing = new Map(alive(data.students).filter((s) => s.classId === cls.id).map((s) => [studentKey(s), s]));
    for (const st of section.students) {
      const found = existing.get(studentKey(st));
      if (found) {
        if (found.order !== st.order) {
          students.push(stamp({ ...found, order: st.order }));
          summary.updated++;
        }
        continue;
      }
      students.push(stamp({
        id: newId(), classId: cls.id, surname: st.surname, name: st.name, father: st.father ?? '', order: st.order,
      }));
      summary.added++;
    }
  }
  await save({ classes, students });
  return summary;
}

export function addStudent(classId, { surname, name, father = '' }) {
  const order = Math.max(0, ...alive(data.students).filter((s) => s.classId === classId).map((s) => s.order ?? 0)) + 1;
  const st = stamp({ id: newId(), classId, surname: surname.trim(), name: name.trim(), father: father.trim(), order });
  save({ students: [st] });
  return st;
}

export function updateStudent(id, fields) {
  return save({ students: [stamp({ ...find('students', id), ...fields })] });
}

export function deleteStudent(id) {
  return save({ students: [tombstone(find('students', id))], ...gradebookOf({ studentIds: [id] }) });
}

// ---- Αξιολογήσεις και βαθμοί ----
export function addAssessment(teachingId, { kind, title, date }) {
  const a = stamp({ id: newId(), teachingId, kind, title: title.trim(), date, createdAt: Date.now() });
  save({ assessments: [a] });
  return a;
}

export function updateAssessment(id, fields) {
  return save({ assessments: [stamp({ ...find('assessments', id), ...fields })] });
}

export function deleteAssessment(id) {
  return save({
    assessments: [tombstone(find('assessments', id))],
    marks: alive(data.marks).filter((m) => m.assessmentId === id).map(tombstone),
  });
}

/** Βαθμός/κατάσταση ενός μαθητή σε μια αξιολόγηση: setMark(a, s, { grade }) ή ({ status }). */
export function setMark(assessmentId, studentId, fields) {
  const id = markId(assessmentId, studentId);
  const prev = findAny('marks', id);
  const base = prev && !prev.deleted ? prev : { id, assessmentId, studentId, grade: null, status: null, updatedAt: prev?.updatedAt };
  return save({ marks: [stamp({ ...base, ...fields, deleted: false })] });
}

/** Βαθμοί που μπαίνουν απευθείας: participation1/2 (συμμετοχή ανά τετράμηνο), final (γραπτές). */
export function setScore(teachingId, studentId, key, value) {
  const id = scoreId(teachingId, studentId, key);
  const prev = findAny('scores', id);
  return save({ scores: [stamp({ ...(prev ?? {}), id, teachingId, studentId, key, value, deleted: false })] });
}

// ---- Ρυθμίσεις βαθμολογίου ----
export function gradingSettings() {
  return find('settings', 'grading') ?? { id: 'grading', term1EndMonthDay: DEFAULT_TERM1_END };
}

export function updateGradingSettings(fields) {
  return save({ settings: [stamp({ ...gradingSettings(), ...fields })] });
}
