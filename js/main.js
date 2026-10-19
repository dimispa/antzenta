// Εκκίνηση: τοπικά δεδομένα → οθόνη αμέσως· OneDrive και συγχρονισμός στο παρασκήνιο.
import { html, render, useEffect, useState } from './vendor/preact-htm.js';
import * as store from './store.js';
import * as onedrive from './onedrive.js';
import * as sync from './sync.js';
import { requestPersistence } from './db.js';
import { currentRoute, onRouteChange } from './router.js';
import { ToastHost, toast } from './ui/common.js';
import { HomeView } from './ui/HomeView.js';
import { LessonView } from './ui/LessonView.js';
import { SettingsView, clientId } from './ui/SettingsView.js';

function App() {
  const [data, setData] = useState(store.getData());
  const [route, setRoute] = useState(currentRoute());
  useEffect(() => store.subscribe(setData), []);
  useEffect(() => onRouteChange(setRoute), []);
  useEffect(() => window.scrollTo(0, 0), [route.name, route.teachingId]);

  let view;
  if (route.name === 'lesson') view = html`<${LessonView} data=${data} teachingId=${route.teachingId} />`;
  else if (route.name === 'settings') view = html`<${SettingsView} data=${data} />`;
  else view = html`<${HomeView} data=${data} classId=${route.classId} />`;

  return html`${view}<${ToastHost} />`;
}

async function startOneDrive() {
  try {
    await onedrive.init(clientId());
  } catch (e) {
    console.error(e);
    toast(`OneDrive: ${e.message}`);
  }
  sync.start();
}

async function main() {
  // Επιστροφή από τη σελίδα σύνδεσης της Microsoft: ολοκληρώνεται πριν διαβαστεί η διαδρομή.
  const returningFromLogin = /[#&?](code|error)=/.test(location.hash + location.search);
  const oneDriveReady = returningFromLogin ? startOneDrive() : null;
  if (oneDriveReady) await oneDriveReady;
  if (returningFromLogin && !location.hash.startsWith('#/')) history.replaceState(null, '', '#/settings');

  await store.load();
  render(html`<${App} />`, document.getElementById('app'));
  requestPersistence();
  if (!oneDriveReady) startOneDrive();
  registerServiceWorker();
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker:', e.message)).then((reg) => {
    if (!reg) return;
    // Νέα έκδοση βρέθηκε στο άνοιγμα: εφαρμόζεται αμέσως (δεν έχετε αρχίσει ακόμη να γράφετε).
    if (reg.waiting && navigator.serviceWorker.controller) {
      reg.waiting.postMessage('skipWaiting');
      return;
    }
    // Νέα έκδοση ενώ χρησιμοποιείτε την εφαρμογή: ρωτάμε, ώστε να μη χαθεί κάτι που γράφετε.
    const offerUpdate = (worker) =>
      toast('Υπάρχει νέα έκδοση της εφαρμογής.', {
        action: 'Ανανέωση',
        persistent: true,
        onAction: () => worker.postMessage('skipWaiting'),
      });
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(worker);
      });
    });
  });
  // Επαναφόρτωση μόνο όταν αντικαθίσταται παλιά έκδοση (όχι στην πρώτη εγκατάσταση).
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloading) {
      reloading = true;
      location.reload();
    }
  });
}

main();
