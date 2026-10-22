// Ρυθμίσεις: σύνδεση OneDrive, συγχρονισμός, αντίγραφο ασφαλείας, εγκατάσταση.
import { html, useRef, useState } from '../vendor/preact-htm.js';
import * as onedrive from '../onedrive.js';
import * as sync from '../sync.js';
import * as store from '../store.js';
import { APP_VERSION, CLIENT_ID } from '../config.js';
import { COLLECTIONS, alive, emptyData, mergeData } from '../model.js';
import { Icon } from './icons.js';
import { toast, useStore } from './common.js';
import { back } from '../router.js';
import { StudentsPanel } from './StudentsUI.js';

const CLIENT_ID_KEY = 'atzenta.clientId';

/** Το client ID: πρώτα από τις ρυθμίσεις της συσκευής, αλλιώς από το config.js. */
export function clientId() {
  return localStorage.getItem(CLIENT_ID_KEY) || CLIENT_ID;
}

export function SettingsView({ data }) {
  return html`
    <header class="topbar">
      <button class="icon-btn" aria-label="Πίσω" onClick=${() => back('/')}><${Icon} name="back" /></button>
      <h1>Ρυθμίσεις</h1>
    </header>
    <main class="page">
      <${OneDrivePanel} />
      <${StudentsPanel} data=${data} />
      <${BackupPanel} data=${data} />
      <${InstallPanel} />
      <p class="muted" style="text-align:center;font-size:.85rem">Ατζέντα Εκπαιδευτικού · έκδοση ${APP_VERSION}</p>
    </main>`;
}

function OneDrivePanel() {
  const { configured, account } = useStore(onedrive.onChange, onedrive.getStatus);
  const s = useStore(sync.subscribe, sync.getState);
  const [id, setId] = useState(clientId());
  const [showHelp, setShowHelp] = useState(!clientId());

  const saveId = async () => {
    const value = id.trim();
    if (value) localStorage.setItem(CLIENT_ID_KEY, value);
    else localStorage.removeItem(CLIENT_ID_KEY);
    try {
      await onedrive.init(clientId());
      toast('Αποθηκεύτηκε. Πατήστε «Σύνδεση με OneDrive».');
    } catch (e) {
      toast(`Μη έγκυρο Client ID: ${e.message}`);
    }
  };

  return html`
    <section class="panel">
      <h2>OneDrive</h2>
      <p class="muted">Η σύνδεση με το OneDrive δείχνει το υλικό κάθε μαθήματος και συγχρονίζει τις καταχωρίσεις σας
        μεταξύ των συσκευών (κινητό, tablet, υπολογιστής). Η εφαρμογή δουλεύει και χωρίς αυτήν.</p>
      ${account
        ? html`
          <div class="row">
            <${Icon} name="cloudDone" />
            <span class="grow">Συνδεδεμένος λογαριασμός: <b>${account.name || account.username}</b><br />
              <span class="muted" style="font-size:.85rem">${account.username}</span></span>
            <button class="btn small" onClick=${() => onedrive.logout()}>Αποσύνδεση</button>
          </div>
          <div class="row">
            <span class="grow">${syncText(s)}</span>
            <button class="btn small" disabled=${s.status === 'syncing' || !navigator.onLine} onClick=${() => sync.syncNow()}>
              <${Icon} name="sync" class=${s.status === 'syncing' ? 'spin' : ''} /> Συγχρονισμός τώρα</button>
          </div>
          ${s.status === 'login' && html`<button class="btn primary" onClick=${() => onedrive.login()}>Νέα σύνδεση</button>`}`
        : configured
          ? html`<button class="btn primary" disabled=${!navigator.onLine} onClick=${() => onedrive.login()}>
              <${Icon} name="cloud" /> Σύνδεση με OneDrive</button>`
          : html`<div class="notice plan"><${Icon} name="info" /><span>Χρειάζεται μια εφάπαξ ρύθμιση (οδηγίες παρακάτω).</span></div>`}

      <details open=${showHelp} onToggle=${(e) => setShowHelp(e.target.open)}>
        <summary style="cursor:pointer;font-weight:600;color:var(--primary)">Εφάπαξ ρύθμιση (Client ID)</summary>
        <div style="display:flex;flex-direction:column;gap:12px;margin-top:12px">
          <ol>
            <li>Ανοίξτε το <a href="https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener">Microsoft Entra — App registrations</a>${' '}
              και συνδεθείτε με τον λογαριασμό Microsoft σας.</li>
            <li>Πατήστε <b>New registration</b>. Όνομα: <i>Ατζέντα Εκπαιδευτικού</i>.</li>
            <li>Στο <b>Supported account types</b> επιλέξτε${' '}
              <i>Accounts in any organizational directory and personal Microsoft accounts</i>.</li>
            <li>Στο <b>Redirect URI</b> επιλέξτε <b>Single-page application (SPA)</b> και επικολλήστε:
              <code class="copy">${onedrive.redirectUri()}</code></li>
            <li>Πατήστε <b>Register</b> και αντιγράψτε το <b>Application (client) ID</b> εδώ:</li>
          </ol>
          <label class="field">Application (client) ID
            <input type="text" value=${id} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              onInput=${(e) => setId(e.target.value)} spellcheck="false" autocapitalize="off" />
          </label>
          <div class="row end"><button class="btn primary" onClick=${saveId}>Αποθήκευση</button></div>
        </div>
      </details>
    </section>`;
}

function syncText(s) {
  switch (s.status) {
    case 'syncing': return 'Συγχρονισμός…';
    case 'offline': return 'Εκτός σύνδεσης — οι αλλαγές θα συγχρονιστούν αργότερα.';
    case 'error': return `Σφάλμα: ${s.error}`;
    case 'login': return 'Η σύνδεση έληξε· συνδεθείτε ξανά.';
    default: return s.lastSync ? `Τελευταίος συγχρονισμός: ${new Date(s.lastSync).toLocaleString('el-GR')}` : 'Δεν έχει γίνει ακόμη συγχρονισμός.';
  }
}

function BackupPanel({ data }) {
  const input = useRef(null);

  const exportData = () => {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `atzenta-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  };

  const importData = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const incoming = JSON.parse(await file.text());
      if (!COLLECTIONS.every((c) => Array.isArray(incoming[c]))) throw new Error('δεν είναι αρχείο της Ατζέντας');
      await store.mergeIn(mergeData(emptyData(), incoming));
      sync.schedule();
      toast(`Έγινε εισαγωγή: ${alive(incoming.classes).length} τμήματα, ${alive(incoming.entries).length} καταχωρίσεις.`);
    } catch (err) {
      toast(`Η εισαγωγή απέτυχε: ${err.message}`);
    }
  };

  return html`
    <section class="panel">
      <h2>Αντίγραφο ασφαλείας</h2>
      <p class="muted">Τα δεδομένα αποθηκεύονται στη συσκευή. Κρατήστε κατά διαστήματα ένα αντίγραφο,
        ειδικά αν δεν χρησιμοποιείτε συγχρονισμό με OneDrive.</p>
      <div class="row">
        <button class="btn" onClick=${exportData}><${Icon} name="download" /> Εξαγωγή αρχείου</button>
        <button class="btn" onClick=${() => input.current.click()}><${Icon} name="offline" /> Εισαγωγή αρχείου</button>
        <input ref=${input} type="file" accept="application/json,.json" hidden onChange=${importData} />
      </div>
      <p class="muted" style="font-size:.85rem">Η εισαγωγή συγχωνεύει το αρχείο με τα υπάρχοντα δεδομένα — δεν σβήνει τίποτα.</p>
    </section>`;
}

function InstallPanel() {
  return html`
    <section class="panel">
      <h2>Εγκατάσταση στη συσκευή</h2>
      <p><b>iPhone / iPad:</b> ανοίξτε την εφαρμογή στο Safari → κουμπί «Κοινοποίηση» → <i>Προσθήκη στην οθόνη Αφετηρίας</i>.</p>
      <p><b>Android:</b> ανοίξτε την εφαρμογή στο Chrome → μενού ⋮ → <i>Εγκατάσταση εφαρμογής</i>${' '}
        (ή <i>Προσθήκη στην αρχική οθόνη</i>).</p>
      <p class="muted">Μετά την πρώτη φόρτωση η εφαρμογή ανοίγει και χωρίς διαδίκτυο.</p>
    </section>`;
}
