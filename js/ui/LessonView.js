// Ένα μάθημα σε ένα τμήμα, σε τρεις στήλες:
//   1. Την προηγούμενη φορά   — τι έγινε στο τελευταίο μάθημα που πραγματοποιήθηκε
//   2. Προγραμματισμός        — τι θα κάνω (γράφεται ελεύθερα, αποθηκεύεται αυτόματα)
//   3. Τι έκανα τελικά        — καταχώριση του μαθήματος ή «δεν πραγματοποιήθηκε» με λόγο
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { meta } from '../db.js';
import { REASONS, STATUS, entriesOf, formatDate, lastDone, reasonLabel, relativeDays, today } from '../model.js';
import { Icon } from './icons.js';
import { ConfirmDialog, Dialog, Menu, SyncBadge, TeachingDialog, toast } from './common.js';
import { MaterialDrawer } from './MaterialDrawer.js';
import { back, navigate } from '../router.js';

export function LessonView({ data, teachingId }) {
  const t = data.teachings.find((x) => x.id === teachingId && !x.deleted);
  const cls = t && data.classes.find((c) => c.id === t.classId);
  const [dialog, setDialog] = useState(null);
  const [drawer, setDrawer] = useState(() => window.matchMedia('(min-width: 1101px)').matches && Boolean(t?.folder));

  if (!t) {
    return html`
      <header class="topbar">
        <button class="icon-btn" aria-label="Πίσω" onClick=${() => navigate('/', { replace: true })}><${Icon} name="back" /></button>
        <h1>Δεν βρέθηκε το μάθημα</h1>
      </header>`;
  }

  const close = () => setDialog(null);
  const entries = entriesOf(data.entries, t.id);

  return html`
    <header class="topbar">
      <button class="icon-btn" aria-label="Πίσω" onClick=${() => back(`/c/${t.classId}`)}><${Icon} name="back" /></button>
      <h1>
        <span style=${`color:${t.color}`}>●</span> ${t.subject}
        <span class="sub">Τμήμα ${cls?.name ?? ''}</span>
      </h1>
      <${SyncBadge} onClick=${() => navigate('/settings')} />
      <button class="icon-btn" aria-pressed=${drawer} onClick=${() => setDrawer(!drawer)} title="Υλικό μαθήματος (OneDrive)">
        <${Icon} name=${drawer ? 'folderOpen' : 'folder'} /><span class="label">Υλικό</span>
      </button>
      <${Menu} label="Επιλογές μαθήματος" items=${[
        { label: 'Επεξεργασία μαθήματος', icon: 'edit', onClick: () => setDialog(html`<${TeachingDialog} title="Επεξεργασία μαθήματος"
            initial=${t} onSave=${(fields) => store.updateTeaching(t.id, fields)} onClose=${close} />`) },
        t.folder && { label: 'Αποσύνδεση φακέλου υλικού', icon: 'folder', onClick: () => store.updateTeaching(t.id, { folder: null }) },
        { label: 'Διαγραφή μαθήματος', icon: 'trash', danger: true, onClick: () => setDialog(html`<${ConfirmDialog}
            title="Διαγραφή μαθήματος" text=${`Θα διαγραφεί το «${t.subject}» του ${cls?.name ?? ''} με όλο το ιστορικό του.`}
            onConfirm=${() => { store.deleteTeaching(t.id); navigate(`/c/${t.classId}`, { replace: true }); }} onClose=${close} />`) },
      ]} />
    </header>
    <main class="lesson">
      <div class="columns">
        <${PreviousColumn} entries=${entries} last=${lastDone(data.entries, t.id)} setDialog=${setDialog} />
        <${PlanColumn} key=${`plan-${t.id}`} t=${t} entries=${entries} />
        <${ActualColumn} key=${`actual-${t.id}`} t=${t} />
      </div>
      ${drawer && html`<${MaterialDrawer} t=${t} onClose=${() => setDrawer(false)} />`}
    </main>
    ${dialog}`;
}

// ---- 1. Την προηγούμενη φορά ----
function PreviousColumn({ entries, last, setDialog }) {
  const close = () => setDialog(null);
  const edit = (e) => setDialog(html`<${EditEntryDialog} entry=${e} onClose=${close} />`);
  return html`
    <section class="col prev" aria-labelledby="col-prev">
      <h2 id="col-prev"><span class="step">1</span> Την προηγούμενη φορά</h2>
      ${last
        ? html`
          <div class="when">${formatDate(last.date)} <small>(${relativeDays(last.date)})</small></div>
          <p class=${last.actual ? 'prose' : 'prose placeholder'}>${last.actual || 'Δεν γράφτηκε περιγραφή.'}</p>`
        : html`<p class="placeholder">Δεν έχει καταγραφεί ακόμη μάθημα.</p>`}
      ${entries.length > 0 && html`
        <details class="history">
          <summary>Ιστορικό (${entries.length})</summary>
          <ul class="history-list">
            ${entries.map((e) => html`
              <li key=${e.id} class=${e.status === STATUS.DONE ? '' : 'skipped'}>
                <span class="dot"></span>
                <div class="body">
                  <div class="meta">${formatDate(e.date)}</div>
                  <div class="text">${e.status === STATUS.DONE
                    ? (e.actual || '—')
                    : `Δεν πραγματοποιήθηκε: ${reasonLabel(e.reason)}${e.note ? ` — ${e.note}` : ''}`}</div>
                </div>
                <button class="icon-btn" aria-label="Επεξεργασία" onClick=${() => edit(e)}><${Icon} name="edit" /></button>
              </li>`)}
          </ul>
        </details>`}
    </section>`;
}

function EditEntryDialog({ entry, onClose }) {
  const [date, setDate] = useState(entry.date);
  const [actual, setActual] = useState(entry.actual);
  const [reason, setReason] = useState(entry.reason ?? REASONS[0].id);
  const [note, setNote] = useState(entry.note ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const done = entry.status === STATUS.DONE;
  const save = () => {
    store.updateEntry(entry.id, done ? { date, actual: actual.trim() } : { date, reason, note: note.trim() });
    onClose();
  };
  if (confirmDelete) {
    return html`<${ConfirmDialog} title="Διαγραφή καταχώρισης"
      text="Η καταχώριση θα αφαιρεθεί από το ιστορικό. Ο προγραμματισμός δεν αλλάζει."
      onConfirm=${() => store.deleteEntry(entry.id)} onClose=${onClose} />`;
  }
  return html`
    <${Dialog} title=${done ? 'Επεξεργασία μαθήματος' : 'Μάθημα που δεν πραγματοποιήθηκε'} onClose=${onClose}>
      <label class="field">Ημερομηνία <input type="date" value=${date} onInput=${(e) => setDate(e.target.value)} /></label>
      ${done
        ? html`<label class="field">Τι έγινε <textarea value=${actual} onInput=${(e) => setActual(e.target.value)} /></label>`
        : html`
          <label class="field">Λόγος
            <select value=${reason} onChange=${(e) => setReason(e.target.value)}>
              ${REASONS.map((r) => html`<option value=${r.id}>${r.label}</option>`)}
            </select>
          </label>
          <label class="field">Σημείωση <input type="text" value=${note} onInput=${(e) => setNote(e.target.value)} /></label>`}
      ${entry.planned && html`<div class="notice info"><${Icon} name="info" /><span>Είχε προγραμματιστεί: ${entry.planned}</span></div>`}
      <div class="row">
        <button class="btn danger" onClick=${() => setConfirmDelete(true)}><${Icon} name="trash" /> Διαγραφή</button>
        <span class="grow"></span>
        <button class="btn" onClick=${onClose}>Άκυρο</button>
        <button class="btn primary" onClick=${save} disabled=${!date}>Αποθήκευση</button>
      </div>
    <//>`;
}

// ---- 2. Προγραμματισμός ----
function PlanColumn({ t, entries }) {
  const [text, setText] = useState(t.plan ?? '');
  const [saved, setSaved] = useState('');
  const timer = useRef(null);
  const focused = useRef(false);

  // Αλλαγή από έξω (π.χ. συγχρονισμός ή καταχώριση μαθήματος) ενώ δεν γράφετε.
  useEffect(() => {
    if (!focused.current) setText(t.plan ?? '');
  }, [t.plan]);
  useEffect(() => () => flush(), []);

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      store.setPlan(t.id, textRef.current);
    }
  }
  const textRef = useRef(text);
  textRef.current = text;

  const onInput = (e) => {
    setText(e.target.value);
    setSaved('');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      store.setPlan(t.id, e.target.value);
      setSaved('Αποθηκεύτηκε');
    }, 600);
  };

  // Αν τα τελευταία μαθήματα δεν έγιναν, ο προγραμματισμός «μεταφέρθηκε».
  const skipped = [];
  for (const e of entries) {
    if (e.status === STATUS.DONE) break;
    skipped.push(e);
  }

  return html`
    <section class="col plan" aria-labelledby="col-plan">
      <h2 id="col-plan"><span class="step">2</span> Προγραμματισμός</h2>
      <p class="hint">Τι θα κάνετε στο επόμενο μάθημα. Αποθηκεύεται αυτόματα.</p>
      ${skipped.length > 0 && html`
        <div class="notice skip">
          <${Icon} name="event_busy" />
          <span>${skipped.length === 1 ? 'Το τελευταίο μάθημα δεν έγινε' : `Τα τελευταία ${skipped.length} μαθήματα δεν έγιναν`}${' '}
            (${skipped.map((e) => `${formatDate(e.date)}: ${reasonLabel(e.reason)}`).join(' · ')}).${' '}
            Ο προγραμματισμός παραμένει.</span>
        </div>`}
      <textarea aria-label="Προγραμματισμός" placeholder="π.χ. Ασκήσεις 3–5 σελ. 42, επανάληψη στις εξισώσεις…"
        value=${text} onInput=${onInput}
        onFocus=${() => (focused.current = true)} onBlur=${() => { focused.current = false; flush(); }} />
      <div class="saved" aria-live="polite">${saved}</div>
    </section>`;
}

// ---- 3. Τι έκανα τελικά ----
function ActualColumn({ t }) {
  const draftKey = `draft:${t.id}`;
  const [date, setDate] = useState(today());
  // null = ακολουθεί τον προγραμματισμό, μέχρι να γράψετε κάτι διαφορετικό
  const [draft, setDraft] = useState(null);
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    meta.get(draftKey).then((d) => d != null && setDraft(d));
  }, [draftKey]);

  const text = draft ?? t.plan ?? '';

  const onInput = (e) => {
    setDraft(e.target.value);
    meta.set(draftKey, e.target.value);
  };

  const resetDraft = () => {
    setDraft(null);
    meta.del(draftKey);
  };

  const complete = async () => {
    setBusy(true);
    const undoInfo = await store.markDone(t.id, { date, actual: text });
    resetDraft();
    setBusy(false);
    toast('Το μάθημα καταχωρίστηκε. Γράψτε τον προγραμματισμό για την επόμενη φορά.', {
      action: 'Αναίρεση',
      onAction: () => store.undo(t.id, undoInfo),
    });
  };

  const skip = async () => {
    setBusy(true);
    const undoInfo = await store.markNotHeld(t.id, { date, reason, note });
    setSkipping(false);
    setReason(null);
    setNote('');
    setBusy(false);
    toast(`Καταγράφηκε: ${reasonLabel(reason)}. Ο προγραμματισμός μένει για το επόμενο μάθημα.`, {
      action: 'Αναίρεση',
      onAction: () => store.undo(t.id, undoInfo),
    });
  };

  return html`
    <section class="col actual" aria-labelledby="col-actual">
      <h2 id="col-actual"><span class="step">3</span> Τι έκανα τελικά</h2>
      <label class="field">Ημερομηνία μαθήματος
        <input type="date" value=${date} max=${today()} onInput=${(e) => setDate(e.target.value)} />
      </label>
      ${!skipping
        ? html`
          <textarea aria-label="Τι έκανα τελικά" placeholder="Τι έγινε τελικά στο μάθημα"
            value=${text} onInput=${onInput} />
          <div class="row">
            ${draft !== null && draft !== (t.plan ?? '') && html`
              <button class="link-btn" onClick=${resetDraft}>Ίδιο με τον προγραμματισμό</button>`}
          </div>
          <div class="row">
            <button class="btn done grow" disabled=${busy || !date} onClick=${complete}>
              <${Icon} name="check" /> Το μάθημα έγινε
            </button>
            <button class="btn skip grow" disabled=${busy} onClick=${() => setSkipping(true)}>
              <${Icon} name="event_busy" /> Δεν πραγματοποιήθηκε
            </button>
          </div>`
        : html`
          <div class="reasons" role="radiogroup" aria-label="Λόγος">
            <strong>Γιατί δεν πραγματοποιήθηκε;</strong>
            ${REASONS.map((r) => html`
              <label><input type="radio" name="reason" checked=${reason === r.id} onChange=${() => setReason(r.id)} /> ${r.label}</label>`)}
            <input type="text" placeholder="Σημείωση (προαιρετικά)" value=${note} onInput=${(e) => setNote(e.target.value)} />
          </div>
          <p class="hint" style="margin:0">Η στήλη «Την προηγούμενη φορά» δεν αλλάζει και ο προγραμματισμός μένει για το επόμενο μάθημα.</p>
          <div class="row">
            <button class="btn" onClick=${() => setSkipping(false)}>Άκυρο</button>
            <button class="btn primary grow" disabled=${busy || !reason || !date} onClick=${skip}>Καταχώριση</button>
          </div>`}
    </section>`;
}
