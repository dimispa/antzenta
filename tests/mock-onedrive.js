// Ψεύτικο OneDrive για τα tests του συγχρονισμού: το «αρχείο στο cloud» κρατιέται στη μνήμη.
export class LoginRequiredError extends Error {}
export class NotSignedInError extends Error {}

export const remote = { file: null, etag: 0, conflictsToSimulate: 0, writes: 0, beforeWrite: null };
const listeners = new Set();

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
export function getAccount() {
  return { username: 'test@example.com' };
}

export async function readDataFile() {
  if (!remote.file) return null;
  return { data: structuredClone(remote.file), etag: String(remote.etag) };
}

export async function writeDataFile(data, etag) {
  if (remote.beforeWrite) {
    const hook = remote.beforeWrite;
    remote.beforeWrite = null;
    hook(); // π.χ. «άλλη συσκευή γράφει ακριβώς πριν από εμάς»
  }
  if (remote.conflictsToSimulate > 0) {
    remote.conflictsToSimulate--;
    return { conflict: true };
  }
  if ((etag ?? null) !== (remote.file ? String(remote.etag) : null)) return { conflict: true };
  remote.file = structuredClone(data);
  remote.etag++;
  remote.writes++;
  return { ok: true, etag: String(remote.etag) };
}
