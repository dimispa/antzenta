// Μαθητές: εισαγωγή από τη λίστα του myschool και διαχείριση ανά τμήμα.
import { html, useRef, useState } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { readXlsx } from '../xlsx.js';
import { parseMyschoolStudents } from '../myschool.js';
import { alive } from '../model.js';
import { studentsOf } from '../grading.js';
import { Icon } from './icons.js';
import { ConfirmDialog, Dialog, toast, useStore } from './common.js';
import { navigate } from '../router.js';

const sameName = (a, b) => a.replace(/\s+/g, '').toLocaleUpperCase('el') === b.replace(/\s+/g, '').toLocaleUpperCase('el');

/** Ενότητα των Ρυθμίσεων: «Μαθητές — εισαγωγή από myschool». */
export function StudentsPanel({ data }) {
  const input = useRef(null);
  const [parsed, setParsed] = useState(null);
  const [busy, setBusy] = useState(false);
  const total = alive(data.students ?? []).length;

  const pick = async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const result = parseMyschoolStudents(await readXlsx(await file.arrayBuffer()));
      if (!result.sections.length) throw new Error('δεν βρέθηκαν τμήματα με μαθητές — είναι η «Λίστα μαθητών» του myschool;');
      setParsed(result);
    } catch (err) {
      toast(`Δεν διαβάστηκε το αρχείο: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  return html`
    <section class="panel">
      <h2>Μαθητές</h2>
      <p class="muted">
        Εισαγωγή από το myschool: <i>Αναφορές → Μαθητές → Λίστα μαθητών</i>, αποθήκευση ως Excel (.xlsx).
        Περνούν μόνο επώνυμο, όνομα και πατρώνυμο· τα στοιχεία επικοινωνίας κηδεμόνων αγνοούνται.
      </p>
      <div class="row">
        <button class="btn primary" disabled=${busy} onClick=${() => input.current.click()}>
          <${Icon} name="offline" /> ${busy ? 'Ανάγνωση…' : 'Εισαγωγή από myschool (.xlsx)'}
        </button>
        <span class="muted">${total} μαθητές στην εφαρμογή</span>
        <input ref=${input} type="file" hidden onChange=${pick}
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" />
      </div>
      ${parsed && html`<${ImportDialog} data=${data} parsed=${parsed} onClose=${() => setParsed(null)} />`}
    </section>`;
}

function ImportDialog({ data, parsed, onClose }) {
  const classes = alive(data.classes);
  // Προεπιλογή: τα τμήματα που υπάρχουν ήδη στην εφαρμογή (αυτά που διδάσκετε).
  const [chosen, setChosen] = useState(() => {
    const existing = parsed.sections.filter((s) => classes.some((c) => sameName(c.name, s.name))).map((s) => s.name);
    return new Set(existing);
  });
  const toggle = (name) =>
    setChosen((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  const count = parsed.sections.filter((s) => chosen.has(s.name)).reduce((n, s) => n + s.students.length, 0);

  const run = async () => {
    const r = await store.importStudents(parsed.sections.filter((s) => chosen.has(s.name)));
    const n = (count, one, many) => (count === 1 ? `1 ${one}` : `${count} ${many}`);
    toast(`Εισαγωγή: ${n(r.added, 'νέος μαθητής', 'νέοι μαθητές')}${r.updated ? `, ${r.updated} ενημερώθηκαν` : ''}`
      + `${r.classesCreated ? `, ${n(r.classesCreated, 'νέο τμήμα', 'νέα τμήματα')}` : ''}.`);
    onClose();
  };

  return html`
    <${Dialog} title="Εισαγωγή μαθητών" onClose=${onClose}>
      <p style="margin:0">Σχολικό έτος ${parsed.schoolYear || '—'}. Επιλέξτε τα τμήματα που διδάσκετε:</p>
      <ul class="check-list">
        ${parsed.sections.map((s) => {
          const exists = classes.some((c) => sameName(c.name, s.name));
          return html`
            <li key=${s.name}>
              <label>
                <input type="checkbox" checked=${chosen.has(s.name)} onChange=${() => toggle(s.name)} />
                <b>${s.name}</b>
                <span class="muted">${s.students.length === 1 ? '1 μαθητής' : `${s.students.length} μαθητές`}${exists ? '' : ' · νέο τμήμα'}</span>
              </label>
            </li>`;
        })}
      </ul>
      <p class="muted" style="margin:0;font-size:.85rem">
        Μαθητές που υπάρχουν ήδη στο τμήμα δεν διπλασιάζονται. Όσοι έφυγαν από το τμήμα αφαιρούνται με το χέρι
        (μενού τμήματος → Μαθητές).
      </p>
      <div class="row end">
        <button class="btn" onClick=${onClose}>Άκυρο</button>
        <button class="btn primary" disabled=${count === 0} onClick=${run}>Εισαγωγή ${count === 1 ? '1 μαθητή' : `${count} μαθητών`}</button>
      </div>
    <//>`;
}

/** Οι μαθητές ενός τμήματος: προσθήκη, διόρθωση, διαγραφή. */
export function StudentsDialog({ cls, onClose }) {
  const data = useStore(store.subscribe, store.getData);
  const students = studentsOf(data, cls.id);
  const [form, setForm] = useState({ surname: '', name: '', father: '' });
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const first = useRef(null);

  const add = (e) => {
    e.preventDefault();
    if (!form.surname.trim() || !form.name.trim()) return;
    store.addStudent(cls.id, form);
    setForm({ surname: '', name: '', father: '' });
    first.current?.focus();
  };

  if (deleting) {
    return html`<${ConfirmDialog} title="Διαγραφή μαθητή"
      text=${`Θα διαγραφεί ο/η ${deleting.surname} ${deleting.name} από το ${cls.name}, μαζί με τους βαθμούς του/της.`}
      onConfirm=${() => store.deleteStudent(deleting.id)} onClose=${() => setDeleting(null)} />`;
  }

  return html`
    <${Dialog} title=${`Μαθητές ${cls.name} (${students.length})`} onClose=${onClose}>
      <ul class="mark-list">
        ${students.map((s) => editing?.id === s.id
          ? html`
            <li key=${s.id}>
              <input type="text" value=${editing.surname} aria-label="Επώνυμο" onInput=${(e) => setEditing({ ...editing, surname: e.target.value })} />
              <input type="text" value=${editing.name} aria-label="Όνομα" onInput=${(e) => setEditing({ ...editing, name: e.target.value })} />
              <button class="icon-btn" aria-label="Αποθήκευση" onClick=${() => {
                store.updateStudent(s.id, { surname: editing.surname.trim(), name: editing.name.trim() });
                setEditing(null);
              }}><${Icon} name="check" /></button>
            </li>`
          : html`
            <li key=${s.id}>
              <span class="who"><span class="muted">${s.order ?? ''}</span>
                <button class="link-btn" title="Καρτέλα μαθητή" onClick=${() => { onClose(); navigate(`/s/${s.id}`); }}>${s.surname} ${s.name}</button>
                ${s.father && html`<small class="muted"> του ${s.father}</small>`}</span>
              <button class="icon-btn" aria-label=${`Διόρθωση ${s.surname}`} onClick=${() => setEditing({ ...s })}><${Icon} name="edit" /></button>
              <button class="icon-btn" aria-label=${`Διαγραφή ${s.surname}`} onClick=${() => setDeleting(s)}><${Icon} name="trash" /></button>
            </li>`)}
      </ul>
      <form class="row" onSubmit=${add}>
        <input ref=${first} type="text" class="grow" placeholder="Επώνυμο" value=${form.surname} style="flex:1 1 120px"
          onInput=${(e) => setForm({ ...form, surname: e.target.value })} />
        <input type="text" placeholder="Όνομα" value=${form.name} style="flex:1 1 100px"
          onInput=${(e) => setForm({ ...form, name: e.target.value })} />
        <button class="btn" type="submit" disabled=${!form.surname.trim() || !form.name.trim()}><${Icon} name="add" /> Προσθήκη</button>
      </form>
      <div class="row end"><button class="btn primary" onClick=${onClose}>Κλείσιμο</button></div>
    <//>`;
}
