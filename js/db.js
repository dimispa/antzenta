// Τοπική αποθήκευση στη συσκευή (IndexedDB) — η εφαρμογή δουλεύει πλήρως χωρίς διαδίκτυο.
//   classes / teachings / entries : τα δεδομένα (συγχρονίζονται)
//   meta     : ρυθμίσεις, πρόχειρα, κατάσταση συγχρονισμού (μόνο σε αυτή τη συσκευή)
//   files    : αρχεία υλικού αποθηκευμένα για χρήση εκτός σύνδεσης
//   listings : τελευταία λίστα αρχείων κάθε φακέλου OneDrive

import { COLLECTIONS } from './model.js';

const DB_NAME = 'atzenta';
const DB_VERSION = 2; // 2: βαθμολόγιο (students, assessments, marks, scores, settings)
let dbPromise = null;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const c of COLLECTIONS) {
          if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
        }
        for (const s of ['meta', 'files', 'listings']) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Όλα τα δεδομένα (μαζί με τις ταφόπλακες). */
export async function loadAll() {
  const db = await open();
  const tx = db.transaction(COLLECTIONS, 'readonly');
  const out = { version: 1 };
  await Promise.all(COLLECTIONS.map(async (c) => (out[c] = await request(tx.objectStore(c).getAll()))));
  return out;
}

/** Αποθηκεύει εγγραφές σε μία συναλλαγή: { teachings: [..], entries: [..] } */
export async function putRecords(changes) {
  const db = await open();
  const names = Object.keys(changes).filter((c) => changes[c]?.length);
  if (!names.length) return;
  const tx = db.transaction(names, 'readwrite');
  for (const c of names) for (const r of changes[c]) tx.objectStore(c).put(r);
  await done(tx);
}

/** Αντικαθιστά όλα τα δεδομένα (μετά από συγχρονισμό ή επαναφορά αντιγράφου). */
export async function replaceAll(data) {
  const db = await open();
  const tx = db.transaction(COLLECTIONS, 'readwrite');
  for (const c of COLLECTIONS) {
    const store = tx.objectStore(c);
    store.clear();
    for (const r of data[c] ?? []) store.put(r);
  }
  await done(tx);
}

async function kv(storeName, mode, fn) {
  const db = await open();
  const tx = db.transaction(storeName, mode);
  const result = await request(fn(tx.objectStore(storeName)));
  await done(tx);
  return result;
}

export const meta = {
  get: (key) => kv('meta', 'readonly', (s) => s.get(key)),
  set: (key, value) => kv('meta', 'readwrite', (s) => s.put(value, key)),
  del: (key) => kv('meta', 'readwrite', (s) => s.delete(key)),
};

export const files = {
  get: (itemId) => kv('files', 'readonly', (s) => s.get(itemId)),
  set: (itemId, value) => kv('files', 'readwrite', (s) => s.put(value, itemId)),
  del: (itemId) => kv('files', 'readwrite', (s) => s.delete(itemId)),
  keys: () => kv('files', 'readonly', (s) => s.getAllKeys()),
};

export const listings = {
  get: (folderId) => kv('listings', 'readonly', (s) => s.get(folderId)),
  set: (folderId, value) => kv('listings', 'readwrite', (s) => s.put(value, folderId)),
};

/** Ζητά από τον browser να μη σβήσει τα δεδομένα όταν λείπει χώρος. */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* δεν υποστηρίζεται — δεν πειράζει */
  }
}
