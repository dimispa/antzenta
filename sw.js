// Η εφαρμογή μεταφέρθηκε: αυτός ο service worker αντικαθιστά τον παλιό και σβήνει τα αποθηκευμένα αρχεία,
// ώστε οι παλιές εγκαταστάσεις να δείξουν τη σελίδα μεταφοράς (με εξαγωγή δεδομένων).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', (e) => { if (e.data === 'skipWaiting') self.skipWaiting(); });
