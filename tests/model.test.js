// Tests του πυρήνα (js/model.js). Ανοίξτε το tests/index.html από τον τοπικό διακομιστή.
import {
  STATUS, nextStamp, completeLesson, emptyData, lastDone, mergeData, pruneTombstones, relativeDays, sameData, skipLesson, formatDate,
} from '../js/model.js';

const results = [];
function test(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
}
function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} αναμενόταν ${b}, βρέθηκε ${a}`);
}

const teaching = { id: 't1', classId: 'c1', subject: 'Μαθηματικά', plan: 'Εξισώσεις σελ. 42', updatedAt: 1 };

test('«Το μάθημα έγινε»: εγγραφή στο ιστορικό και άδειος προγραμματισμός', () => {
  const { entry, teaching: t } = completeLesson(teaching, { date: '2026-10-19', actual: '  Εξισώσεις, ασκ. 1-3 ' }, 100);
  eq(entry.status, STATUS.DONE);
  eq(entry.planned, 'Εξισώσεις σελ. 42');
  eq(entry.actual, 'Εξισώσεις, ασκ. 1-3');
  eq(t.plan, '');
  eq(t.updatedAt, 100);
});

test('«Δεν πραγματοποιήθηκε»: ο προγραμματισμός μένει ως έχει', () => {
  const { entry, teaching: t } = skipLesson(teaching, { date: '2026-10-19', reason: 'trip', note: '' }, 100);
  eq(entry.status, STATUS.NOT_HELD);
  eq(entry.reason, 'trip');
  eq(t.plan, 'Εξισώσεις σελ. 42');
  eq(t, teaching, 'το μάθημα δεν αλλάζει:');
});

test('Αριστερή στήλη: το τελευταίο μάθημα που έγινε, αγνοώντας όσα δεν έγιναν', () => {
  const entries = [
    { id: 'a', teachingId: 't1', date: '2026-10-12', status: STATUS.DONE, actual: 'Α', createdAt: 1 },
    { id: 'b', teachingId: 't1', date: '2026-10-14', status: STATUS.DONE, actual: 'Β', createdAt: 2 },
    { id: 'c', teachingId: 't1', date: '2026-10-16', status: STATUS.NOT_HELD, reason: 'council', createdAt: 3 },
    { id: 'd', teachingId: 't2', date: '2026-10-17', status: STATUS.DONE, actual: 'άλλο μάθημα', createdAt: 4 },
    { id: 'e', teachingId: 't1', date: '2026-10-15', status: STATUS.DONE, actual: 'σβησμένο', createdAt: 5, deleted: true },
  ];
  eq(lastDone(entries, 't1').id, 'b');
  eq(lastDone(entries, 't3'), null);
});

test('Ίδια ημερομηνία: κερδίζει η πιο πρόσφατη καταχώριση', () => {
  const entries = [
    { id: 'a', teachingId: 't1', date: '2026-10-19', status: STATUS.DONE, createdAt: 1 },
    { id: 'b', teachingId: 't1', date: '2026-10-19', status: STATUS.DONE, createdAt: 2 },
  ];
  eq(lastDone(entries, 't1').id, 'b');
});

test('Συγχρονισμός: κερδίζει η πιο πρόσφατη αλλαγή κάθε εγγραφής', () => {
  const local = { ...emptyData(), teachings: [{ id: 't1', plan: 'τοπικό', updatedAt: 5 }, { id: 't2', plan: 'μόνο εδώ', updatedAt: 1 }] };
  const remote = { ...emptyData(), teachings: [{ id: 't1', plan: 'από tablet', updatedAt: 9 }, { id: 't3', plan: 'μόνο εκεί', updatedAt: 1 }] };
  const merged = mergeData(local, remote);
  const byId = Object.fromEntries(merged.teachings.map((t) => [t.id, t.plan]));
  eq(byId, { t1: 'από tablet', t2: 'μόνο εδώ', t3: 'μόνο εκεί' });
});

test('Συγχρονισμός: η διαγραφή δεν «ξαναζωντανεύει» από άλλη συσκευή', () => {
  const local = { ...emptyData(), classes: [{ id: 'c1', name: 'Α1', updatedAt: 10, deleted: true }] };
  const remote = { ...emptyData(), classes: [{ id: 'c1', name: 'Α1', updatedAt: 3 }] };
  eq(mergeData(local, remote).classes[0].deleted, true);
  eq(mergeData(remote, local).classes[0].deleted, true);
});

test('Συγχρονισμός: χωρίς αρχείο στο OneDrive κρατά τα τοπικά', () => {
  const local = { ...emptyData(), classes: [{ id: 'c1', name: 'Α1', updatedAt: 1 }] };
  eq(mergeData(local, undefined).classes.length, 1);
});

test('sameData: ανιχνεύει αλλαγή και ίδιο περιεχόμενο', () => {
  const a = { ...emptyData(), classes: [{ id: 'c1', updatedAt: 1 }] };
  eq(sameData(a, { ...emptyData(), classes: [{ id: 'c1', updatedAt: 1 }] }), true);
  eq(sameData(a, { ...emptyData(), classes: [{ id: 'c1', updatedAt: 2 }] }), false);
  eq(sameData(a, emptyData()), false);
});

test('Παλιές ταφόπλακες σβήνονται, οι πρόσφατες μένουν', () => {
  const now = Date.UTC(2026, 9, 19);
  const data = { ...emptyData(), entries: [
    { id: 'old', deleted: true, updatedAt: now - 200 * 864e5 },
    { id: 'new', deleted: true, updatedAt: now - 5 * 864e5 },
    { id: 'live', updatedAt: now - 400 * 864e5 },
  ] };
  eq(pruneTombstones(data, now).entries.map((e) => e.id), ['new', 'live']);
});

test('Ημερομηνίες στα ελληνικά', () => {
  eq(formatDate('2026-10-19'), 'Δευ 19 Οκτ');
  const now = new Date(2026, 9, 19);
  eq(relativeDays('2026-10-19', now), 'σήμερα');
  eq(relativeDays('2026-10-18', now), 'χθες');
  eq(relativeDays('2026-10-12', now), 'πριν 7 ημέρες');
});

test('Χρονοσφραγίδα: η αλλαγή κερδίζει την έκδοση που είδατε, ακόμη και με «μπροστά» ρολόι αλλού', () => {
  eq(nextStamp(100, 500), 500);
  eq(nextStamp(9000, 500), 9001, 'έκδοση από συσκευή με μπροστά ρολόι:');
  eq(nextStamp(undefined, 500), 500);
});

// ---- Εμφάνιση αποτελεσμάτων ----
const list = document.getElementById('results');
for (const r of results) {
  const li = document.createElement('li');
  li.className = r.ok ? 'pass' : 'fail';
  li.textContent = r.ok ? `✓ ${r.name}` : `✗ ${r.name} — ${r.error}`;
  list.append(li);
}
const failed = results.filter((r) => !r.ok).length;
document.getElementById('summary').textContent = failed ? `${failed} από ${results.length} απέτυχαν` : `Όλα τα ${results.length} tests πέρασαν`;
document.title = failed ? `ΑΠΟΤΥΧΙΑ (${failed})` : `OK (${results.length})`;
