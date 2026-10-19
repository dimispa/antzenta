// Συγχρονισμός των δεδομένων μεταξύ συσκευών μέσω ενός αρχείου JSON στο OneDrive.
// Κάθε συσκευή δουλεύει τοπικά· όταν υπάρχει σύνδεση, κατεβάζει το αρχείο, συγχωνεύει
// εγγραφή-προς-εγγραφή (κερδίζει η πιο πρόσφατη αλλαγή) και ανεβάζει το αποτέλεσμα.

import * as onedrive from './onedrive.js';
import * as store from './store.js';
import { meta } from './db.js';
import { mergeData, pruneTombstones, sameData } from './model.js';

const DEBOUNCE_MS = 3000;
const MAX_ATTEMPTS = 3;

/** status: off | offline | syncing | ok | error | login */
let state = { status: 'off', lastSync: null, error: null };
const listeners = new Set();
let timer = null;
let running = null;
let pendingAgain = false;

export function getState() {
  return state;
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(patch) {
  state = { ...state, ...patch };
  for (const fn of listeners) fn(state);
}

export async function start() {
  set({ lastSync: (await meta.get('lastSync')) ?? null });
  store.setChangeHandler(schedule);
  onedrive.onChange(() => syncNow());
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => set({ status: onedrive.getAccount() ? 'offline' : 'off' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  syncNow();
}

/** Μετά από τοπική αλλαγή: συγχρονισμός λίγο αργότερα (μαζεύει πολλές αλλαγές μαζί). */
export function schedule() {
  clearTimeout(timer);
  timer = setTimeout(syncNow, DEBOUNCE_MS);
}

export async function syncNow() {
  clearTimeout(timer);
  if (!onedrive.getAccount()) return set({ status: 'off', error: null });
  if (!navigator.onLine) return set({ status: 'offline' });
  if (running) {
    pendingAgain = true;
    return running;
  }
  running = run().finally(() => {
    running = null;
    if (pendingAgain) {
      pendingAgain = false;
      syncNow();
    }
  });
  return running;
}

async function run() {
  set({ status: 'syncing', error: null });
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const remote = await onedrive.readDataFile();
      const local = store.getData();
      const merged = pruneTombstones(mergeData(local, remote?.data));

      if (!sameData(merged, local)) await store.mergeIn(merged);
      if (remote && sameData(merged, remote.data)) return finish();

      const result = await onedrive.writeDataFile(merged, remote?.etag);
      if (result.ok) return finish();
      // Άλλη συσκευή έγραψε στο μεταξύ — ξανά από την αρχή με τα νέα της δεδομένα.
    }
    throw new Error('Δεν ολοκληρώθηκε ο συγχρονισμός (συνεχείς αλλαγές από άλλη συσκευή)');
  } catch (e) {
    if (e instanceof onedrive.LoginRequiredError) return set({ status: 'login', error: e.message });
    if (!navigator.onLine) return set({ status: 'offline' });
    console.error(e);
    set({ status: 'error', error: e.message });
  }
}

async function finish() {
  const now = Date.now();
  await meta.set('lastSync', now);
  set({ status: 'ok', lastSync: now, error: null });
}
