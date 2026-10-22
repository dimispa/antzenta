// Πυρήνας της εφαρμογής: καθαρές συναρτήσεις χωρίς IndexedDB/DOM, ώστε να ελέγχονται με tests.
//
// Δεδομένα (κάθε εγγραφή έχει id, updatedAt και προαιρετικά deleted για τον συγχρονισμό):
//   classes   { id, name, order }
//   teachings { id, classId, subject, color, order, plan, folder }   ένα μάθημα σε ένα τμήμα
//   entries   { id, teachingId, date, status, planned, actual, reason, note, createdAt }
// Βαθμολόγιο (βλ. grading.js): students, assessments, marks, scores, settings.

export const COLLECTIONS = ['classes', 'teachings', 'entries', 'students', 'assessments', 'marks', 'scores', 'settings'];

export const STATUS = { DONE: 'done', NOT_HELD: 'not_held' };

/** Λόγοι για τους οποίους ένα μάθημα δεν πραγματοποιήθηκε. */
export const REASONS = [
  { id: 'council', label: 'Έκτακτος σύλλογος διδασκόντων' },
  { id: 'trip', label: 'Εκδρομή / εκπαιδευτική επίσκεψη' },
  { id: 'other_teacher', label: 'Μάθημα από άλλον εκπαιδευτικό' },
  { id: 'holiday', label: 'Αργία / απεργία / κλειστό σχολείο' },
  { id: 'other', label: 'Άλλος λόγος' },
];

export function reasonLabel(id) {
  return REASONS.find((r) => r.id === id)?.label ?? 'Άλλος λόγος';
}

export const COLORS = ['#3f51b5', '#1e88e5', '#00897b', '#43a047', '#f4511e', '#e53935', '#8e24aa', '#6d4c41'];

/**
 * Χρονοσφραγίδα αλλαγής: τουλάχιστον κατά 1 μεγαλύτερη από την έκδοση στην οποία βασίστηκε,
 * ώστε μια αλλαγή να κερδίζει πάντα την έκδοση που είδατε — ακόμη κι αν το ρολόι κάποιας
 * άλλης συσκευής πηγαίνει μπροστά.
 */
export function nextStamp(previous, now = Date.now()) {
  return Math.max(now, (previous ?? 0) + 1);
}

export function newId() {
  return crypto.randomUUID();
}

/** Σημερινή ημερομηνία ως YYYY-MM-DD, στην τοπική ώρα. */
export function today(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function alive(records) {
  return records.filter((r) => !r.deleted);
}

/** Ταξινόμηση εγγραφών ημερολογίου: πιο πρόσφατη πρώτη. */
export function byNewest(a, b) {
  return b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0);
}

/** Τα μαθήματα ενός τμήματος / οι εγγραφές ενός μαθήματος. */
export function teachingsOf(teachings, classId) {
  return alive(teachings).filter((t) => t.classId === classId).sort((a, b) => a.order - b.order);
}

export function entriesOf(entries, teachingId) {
  return alive(entries).filter((e) => e.teachingId === teachingId).sort(byNewest);
}

/**
 * Αριστερή στήλη: η τελευταία φορά που το μάθημα πραγματοποιήθηκε.
 * Τα μαθήματα που δεν έγιναν αγνοούνται, οπότε η στήλη μένει ως είχε.
 */
export function lastDone(entries, teachingId) {
  return entriesOf(entries, teachingId).find((e) => e.status === STATUS.DONE) ?? null;
}

/**
 * «Το μάθημα έγινε»: γράφει την εγγραφή στο ιστορικό και αδειάζει τον προγραμματισμό,
 * ώστε ο εκπαιδευτικός να γράψει τι θα κάνει την επόμενη φορά.
 */
export function completeLesson(teaching, { date, actual }, now = Date.now()) {
  const entry = {
    id: newId(),
    teachingId: teaching.id,
    date,
    status: STATUS.DONE,
    planned: teaching.plan ?? '',
    actual: actual.trim(),
    reason: null,
    note: '',
    createdAt: now,
    updatedAt: now,
  };
  return { entry, teaching: { ...teaching, plan: '', updatedAt: nextStamp(teaching.updatedAt, now) } };
}

/** «Δεν πραγματοποιήθηκε»: καταγράφεται ο λόγος, ο προγραμματισμός μένει για την επόμενη φορά. */
export function skipLesson(teaching, { date, reason, note }, now = Date.now()) {
  return {
    entry: {
      id: newId(),
      teachingId: teaching.id,
      date,
      status: STATUS.NOT_HELD,
      planned: teaching.plan ?? '',
      actual: '',
      reason,
      note: (note ?? '').trim(),
      createdAt: now,
      updatedAt: now,
    },
    teaching,
  };
}

// ---------------------------------------------------------------------------
// Συγχρονισμός: συγχώνευση δύο αντιγράφων εγγραφή-προς-εγγραφή (κερδίζει η πιο πρόσφατη αλλαγή).
// Οι διαγραφές είναι «ταφόπλακες» (deleted: true), ώστε να μη «ξαναζωντανεύουν» από άλλη συσκευή.

export function emptyData() {
  const data = { version: 1 };
  for (const c of COLLECTIONS) data[c] = [];
  return data;
}

export function mergeCollection(a = [], b = []) {
  const map = new Map();
  for (const r of a) map.set(r.id, r);
  for (const r of b) {
    const mine = map.get(r.id);
    if (!mine || (r.updatedAt ?? 0) > (mine.updatedAt ?? 0)) map.set(r.id, r);
  }
  return [...map.values()];
}

export function mergeData(local, remote) {
  const out = emptyData();
  for (const c of COLLECTIONS) out[c] = mergeCollection(local?.[c], remote?.[c]);
  return out;
}

/** Ίδιο περιεχόμενο; (για να μη γίνεται άσκοπη αποστολή) */
export function sameData(a, b) {
  for (const c of COLLECTIONS) {
    const x = a[c] ?? [];
    const y = b[c] ?? [];
    if (x.length !== y.length) return false;
    const m = new Map(y.map((r) => [r.id, r.updatedAt]));
    if (x.some((r) => m.get(r.id) !== r.updatedAt)) return false;
  }
  return true;
}

/** Ταφόπλακες παλαιότερες από [maxAgeDays] σβήνονται οριστικά. */
export function pruneTombstones(data, now = Date.now(), maxAgeDays = 180) {
  const limit = now - maxAgeDays * 864e5;
  const out = emptyData();
  for (const c of COLLECTIONS) out[c] = (data[c] ?? []).filter((r) => !r.deleted || r.updatedAt > limit);
  return out;
}

// ---------------------------------------------------------------------------
// Εμφάνιση

const MONTHS = ['Ιαν', 'Φεβ', 'Μαρ', 'Απρ', 'Μαΐ', 'Ιουν', 'Ιουλ', 'Αυγ', 'Σεπ', 'Οκτ', 'Νοε', 'Δεκ'];
const DAYS = ['Κυρ', 'Δευ', 'Τρί', 'Τετ', 'Πέμ', 'Παρ', 'Σάβ'];

/** «Δευ 19 Οκτ» */
export function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYS[dt.getDay()]} ${d} ${MONTHS[m - 1]}`;
}

/** «σήμερα», «χθες», «πριν 5 ημέρες» */
export function relativeDays(iso, now = new Date()) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const diff = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(y, m - 1, d)) / 864e5);
  if (diff === 0) return 'σήμερα';
  if (diff === 1) return 'χθες';
  if (diff > 1) return `πριν ${diff} ημέρες`;
  if (diff === -1) return 'αύριο';
  return `σε ${-diff} ημέρες`;
}
