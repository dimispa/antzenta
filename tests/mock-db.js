// Αποθήκευση στη μνήμη αντί για IndexedDB, ώστε τα tests να μην αγγίζουν τα δεδομένα της εφαρμογής.
import { COLLECTIONS, emptyData } from '../js/model.js';

let stored = emptyData();
const kv = new Map();

export async function loadAll() {
  return structuredClone(stored);
}
export async function putRecords(changes) {
  for (const [c, records] of Object.entries(changes)) {
    const byId = new Map(stored[c].map((r) => [r.id, r]));
    for (const r of records) byId.set(r.id, structuredClone(r));
    stored[c] = [...byId.values()];
  }
}
export async function replaceAll(data) {
  stored = emptyData();
  for (const c of COLLECTIONS) stored[c] = structuredClone(data[c] ?? []);
}
export const meta = {
  get: async (k) => kv.get(k),
  set: async (k, v) => kv.set(k, v),
  del: async (k) => kv.delete(k),
};
export const files = meta;
export const listings = meta;
export async function requestPersistence() {}
