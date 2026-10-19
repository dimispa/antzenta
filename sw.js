// Service worker: κρατά όλα τα αρχεία της εφαρμογής στη συσκευή ώστε να ανοίγει χωρίς διαδίκτυο.
// Σε κάθε νέα έκδοση αλλάζει το VERSION· η εφαρμογή προτείνει «Ανανέωση».
const VERSION = 'atzenta-v1.0.2';

const FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './js/main.js',
  './js/config.js',
  './js/model.js',
  './js/db.js',
  './js/store.js',
  './js/sync.js',
  './js/onedrive.js',
  './js/router.js',
  './js/ui/common.js',
  './js/ui/icons.js',
  './js/ui/HomeView.js',
  './js/ui/LessonView.js',
  './js/ui/MaterialDrawer.js',
  './js/ui/SettingsView.js',
  './js/vendor/preact-htm.js',
  './js/vendor/msal-browser.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(FILES)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  // Μόνο τα αρχεία της εφαρμογής· OneDrive/Microsoft πάνε πάντα στο δίκτυο.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Η σελίδα ανοίγει πάντα από τη συσκευή (η πλοήγηση γίνεται με #).
    event.respondWith(caches.match('./index.html').then((cached) => cached ?? fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((cached) => cached ?? fetch(req)));
});
