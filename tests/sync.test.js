// Tests του συγχρονισμού (js/sync.js + js/store.js) με ψεύτικο OneDrive.
import * as store from '../js/store.js';
import * as sync from '../js/sync.js';
import { remote } from './mock-onedrive.js';
import { alive, lastDone } from '../js/model.js';

const results = [];
async function test(name, fn) {
  try {
    await fn();
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

/** Μια αλλαγή «από άλλη συσκευή»: γράφεται κατευθείαν στο αρχείο του cloud. */
function otherDevice(change) {
  change(remote.file);
  remote.etag++;
}

await store.load();
store.setChangeHandler(() => {}); // χωρίς αυτόματο συγχρονισμό· τον καλούμε ρητά

let teaching;

await test('Πρώτος συγχρονισμός: τα τοπικά ανεβαίνουν στο OneDrive', async () => {
  const cls = store.addClass('Α1');
  teaching = store.addTeaching(cls.id, 'Μαθηματικά');
  await store.setPlan(teaching.id, 'Εξισώσεις');
  await sync.syncNow();
  eq(sync.getState().status, 'ok');
  eq(alive(remote.file.classes).map((c) => c.name), ['Α1']);
  eq(remote.file.teachings[0].plan, 'Εξισώσεις');
});

await test('Αλλαγή από άλλη συσκευή έρχεται εδώ', async () => {
  otherDevice((f) => {
    f.classes.push({ id: 'c-b2', name: 'Β2', order: 1, updatedAt: Date.now() + 1000 });
  });
  await sync.syncNow();
  eq(alive(store.getData().classes).map((c) => c.name).sort(), ['Α1', 'Β2']);
});

await test('Καταχώριση μαθήματος εδώ + αλλαγή τμήματος εκεί: κρατιούνται και οι δύο', async () => {
  await store.markDone(teaching.id, { date: '2026-10-19', actual: 'Εξισώσεις 1-3' });
  otherDevice((f) => {
    const b2 = f.classes.find((c) => c.id === 'c-b2');
    b2.name = 'Β2 (Θετική)';
    b2.updatedAt = Date.now() + 2000;
  });
  await sync.syncNow();
  const data = store.getData();
  eq(lastDone(data.entries, teaching.id)?.actual, 'Εξισώσεις 1-3');
  eq(data.classes.find((c) => c.id === 'c-b2').name, 'Β2 (Θετική)');
  eq(lastDone(remote.file.entries, teaching.id)?.actual, 'Εξισώσεις 1-3', 'στο cloud:');
});

await test('Σύγκρουση: άλλη συσκευή γράφει ακριβώς πριν ανεβάσουμε — κανένα δεδομένο δεν χάνεται', async () => {
  await store.setPlan(teaching.id, 'Προβλήματα σελ. 45');
  remote.beforeWrite = () =>
    otherDevice((f) => {
      f.teachings.push({ id: 't-fys', classId: 'c-b2', subject: 'Φυσική', color: '#00897b', order: 0, plan: '', folder: null, updatedAt: Date.now() + 3000 });
    });
  await sync.syncNow();
  eq(sync.getState().status, 'ok');
  const subjects = alive(remote.file.teachings).map((t) => t.subject).sort();
  eq(subjects, ['Μαθηματικά', 'Φυσική'], 'στο cloud:');
  eq(remote.file.teachings.find((t) => t.id === teaching.id).plan, 'Προβλήματα σελ. 45', 'ο προγραμματισμός στο cloud:');
  eq(alive(store.getData().teachings).length, 2, 'τοπικά:');
});

await test('Διαγραφή εδώ διαδίδεται και δεν επιστρέφει', async () => {
  await store.deleteTeaching('t-fys');
  await sync.syncNow();
  eq(remote.file.teachings.find((t) => t.id === 't-fys').deleted, true);
  await sync.syncNow();
  eq(alive(store.getData().teachings).map((t) => t.subject), ['Μαθηματικά']);
});

await test('Χωρίς αλλαγές δεν ξαναγράφεται το αρχείο', async () => {
  const before = remote.writes;
  await sync.syncNow();
  eq(remote.writes, before);
});

await test('Αλλαγή που έγινε ενώ κατέβαιναν δεδομένα δεν χάνεται', async () => {
  // Η αλλαγή γίνεται «κατά τη διάρκεια» του συγχρονισμού (πριν το ανέβασμα).
  remote.beforeWrite = () => store.setPlan(teaching.id, 'Γράφτηκε την ώρα του συγχρονισμού');
  otherDevice((f) => f.classes.push({ id: 'c-g1', name: 'Γ1', order: 2, updatedAt: Date.now() + 4000 }));
  await store.renameClass(alive(store.getData().classes).find((c) => c.name === 'Α1').id, 'Α1 (Γενική)'); // ώστε να γίνει ανέβασμα
  await sync.syncNow();
  await sync.syncNow(); // ο επόμενος κύκλος ανεβάζει και τη νέα αλλαγή
  eq(store.getData().teachings.find((t) => t.id === teaching.id).plan, 'Γράφτηκε την ώρα του συγχρονισμού');
  eq(remote.file.teachings.find((t) => t.id === teaching.id).plan, 'Γράφτηκε την ώρα του συγχρονισμού', 'στο cloud:');
  eq(alive(remote.file.classes).map((c) => c.name).sort(), ['Α1 (Γενική)', 'Β2 (Θετική)', 'Γ1'], 'τμήματα στο cloud:');
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
