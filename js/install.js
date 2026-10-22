// Εγκατάσταση της εφαρμογής στη συσκευή (PWA): αναγνώριση συσκευής και, όπου το επιτρέπει
// ο browser (Chrome/Edge σε Android και υπολογιστή), εγκατάσταση με ένα κουμπί.

let deferredPrompt = null;
const listeners = new Set();

// Το συμβάν έρχεται νωρίς, γι' αυτό το «πιάνουμε» μόλις φορτώσει το αρχείο.
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  emit();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  emit();
});

function emit() {
  for (const fn of listeners) fn(getInstallState());
}

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Η συσκευή και ο browser, για να δείχνουμε τις σωστές οδηγίες. */
export function detectDevice() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  let browser = 'other';
  if (ios) browser = /CriOS/.test(ua) ? 'chrome' : /FxiOS/.test(ua) ? 'firefox' : /EdgiOS/.test(ua) ? 'edge' : 'safari';
  else if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  else if (/Edg\//.test(ua)) browser = 'edge';
  else if (/Firefox\//.test(ua)) browser = 'firefox';
  else if (/Chrome\//.test(ua)) browser = 'chrome';
  else if (/Safari\//.test(ua)) browser = 'safari';
  return { platform: ios ? 'ios' : android ? 'android' : 'desktop', browser };
}

export function isInstalled() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export function getInstallState() {
  return { installed: isInstalled(), canPrompt: deferredPrompt !== null };
}

/** Εμφανίζει το παράθυρο εγκατάστασης του browser. Επιστρέφει true αν έγινε αποδοχή. */
export async function promptInstall() {
  if (!deferredPrompt) return false;
  const e = deferredPrompt;
  deferredPrompt = null;
  e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === 'accepted';
}
