// Κοινά στοιχεία: παράθυρα διαλόγου, ειδοποιήσεις (toast), ένδειξη συγχρονισμού.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import { Icon } from './icons.js';
import * as sync from '../sync.js';
import { COLORS } from '../model.js';

export function useStore(subscribe, get) {
  const [value, setValue] = useState(get());
  useEffect(() => {
    const unsubscribe = subscribe(setValue);
    // Αν η κατάσταση άλλαξε πριν από την εγγραφή (π.χ. το OneDrive ξεκίνησε γρήγορα), την παίρνουμε τώρα.
    setValue(get());
    return unsubscribe;
  }, []);
  return value;
}

export function Dialog({ title, children, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return html`
    <div class="backdrop" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div class="dialog" role="dialog" aria-modal="true" aria-label=${title}>
        <h2>${title}</h2>
        ${children}
      </div>
    </div>`;
}

/** Διάλογος με ένα πεδίο κειμένου (νέο τμήμα, μετονομασία…). */
export function TextDialog({ title, label, initial = '', placeholder = '', confirm = 'Αποθήκευση', onSave, onClose }) {
  const [value, setValue] = useState(initial);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);
  const submit = (e) => {
    e.preventDefault();
    if (!value.trim()) return;
    onSave(value.trim());
    onClose();
  };
  return html`
    <${Dialog} title=${title} onClose=${onClose}>
      <form onSubmit=${submit} style="display:contents">
        <label class="field">${label}
          <input ref=${input} type="text" value=${value} placeholder=${placeholder} onInput=${(e) => setValue(e.target.value)} />
        </label>
        <div class="row end">
          <button type="button" class="btn" onClick=${onClose}>Άκυρο</button>
          <button type="submit" class="btn primary" disabled=${!value.trim()}>${confirm}</button>
        </div>
      </form>
    <//>`;
}

export function ConfirmDialog({ title, text, confirm = 'Διαγραφή', onConfirm, onClose }) {
  return html`
    <${Dialog} title=${title} onClose=${onClose}>
      <p style="margin:0">${text}</p>
      <div class="row end">
        <button class="btn" onClick=${onClose}>Άκυρο</button>
        <button class="btn primary" onClick=${() => { onConfirm(); onClose(); }}>${confirm}</button>
      </div>
    <//>`;
}

/** Νέο μάθημα / επεξεργασία μαθήματος: όνομα και χρώμα. */
export function TeachingDialog({ title, initial = {}, onSave, onClose }) {
  const [subject, setSubject] = useState(initial.subject ?? '');
  const [color, setColor] = useState(initial.color ?? COLORS[0]);
  const input = useRef(null);
  useEffect(() => input.current?.focus(), []);
  const submit = (e) => {
    e.preventDefault();
    if (!subject.trim()) return;
    onSave({ subject: subject.trim(), color });
    onClose();
  };
  return html`
    <${Dialog} title=${title} onClose=${onClose}>
      <form onSubmit=${submit} style="display:contents">
        <label class="field">Μάθημα
          <input ref=${input} type="text" value=${subject} placeholder="π.χ. Μαθηματικά" onInput=${(e) => setSubject(e.target.value)} />
        </label>
        <div class="field">Χρώμα
          <div class="swatches">
            ${COLORS.map((c) => html`<button type="button" class=${`swatch ${c === color ? 'on' : ''}`} style=${`background:${c}`}
                aria-label=${`Χρώμα ${c}`} onClick=${() => setColor(c)} />`)}
          </div>
        </div>
        <div class="row end">
          <button type="button" class="btn" onClick=${onClose}>Άκυρο</button>
          <button type="submit" class="btn primary" disabled=${!subject.trim()}>Αποθήκευση</button>
        </div>
      </form>
    <//>`;
}

/** Μενού «⋮»: items = [{ label, icon, onClick, disabled?, danger? }] */
export function Menu({ label = 'Επιλογές', items }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const outside = (e) => !ref.current?.contains(e.target) && setOpen(false);
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  return html`
    <div class="menu-wrap" ref=${ref}>
      <button class="icon-btn" aria-label=${label} aria-expanded=${open} onClick=${() => setOpen(!open)}><${Icon} name="more" /></button>
      ${open && html`
        <div class="menu" role="menu">
          ${items.filter(Boolean).map((it) => html`
            <button role="menuitem" class=${it.danger ? 'danger' : ''} disabled=${it.disabled}
                onClick=${() => { setOpen(false); it.onClick(); }}>
              <${Icon} name=${it.icon} /> ${it.label}
            </button>`)}
        </div>`}
    </div>`;
}

// ---- Toast ----
let showToastFn = () => {};

/** toast('Κείμενο', { action: 'Αναίρεση', onAction }) */
export function toast(text, options = {}) {
  showToastFn({ text, ...options, key: Date.now() });
}

export function ToastHost() {
  const [t, setT] = useState(null);
  useEffect(() => {
    showToastFn = setT;
  }, []);
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), t.action ? 8000 : 3500);
    return () => clearTimeout(id);
  }, [t]);
  if (!t) return null;
  return html`
    <div class="toast" role="status">
      <span>${t.text}</span>
      ${t.action && html`<button onClick=${() => { t.onAction(); setT(null); }}>${t.action}</button>`}
    </div>`;
}

// ---- Ένδειξη συγχρονισμού στη μπάρα ----
const SYNC_LABEL = {
  off: null,
  offline: 'Εκτός σύνδεσης',
  syncing: 'Συγχρονισμός…',
  ok: 'Συγχρονισμένο',
  error: 'Σφάλμα συγχρονισμού',
  login: 'Χρειάζεται σύνδεση',
};
const SYNC_ICON = { offline: 'cloudOff', syncing: 'sync', ok: 'cloudDone', error: 'warning', login: 'warning' };

export function SyncBadge({ onClick }) {
  const s = useStore(sync.subscribe, sync.getState);
  if (s.status === 'off') {
    return navigator.onLine ? null : html`<span class="sync offline"><${Icon} name="cloudOff" /><span class="label">Εκτός σύνδεσης</span></span>`;
  }
  return html`
    <button class=${`icon-btn sync ${s.status}`} title=${s.error ?? SYNC_LABEL[s.status]} onClick=${onClick}>
      <${Icon} name=${SYNC_ICON[s.status]} class=${s.status === 'syncing' ? 'spin' : ''} />
      <span class="label">${SYNC_LABEL[s.status]}</span>
    </button>`;
}
