// Βαθμολόγιο ενός μαθήματος: πίνακας μαθητών ανά τετράμηνο (5 κριτήρια) και ετήσιος βαθμός.
import { html, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import {
  CRITERIA, DEFAULT_WEIGHTS, HOMEWORK_STATUS, KINDS, annualResult, assessmentsOf, formatGrade, indexGrades, markId,
  parseGrade, scoreId, studentsOf, termOf, termResult,
} from '../grading.js';
import { formatDate, today } from '../model.js';
import { Icon } from './icons.js';
import { ConfirmDialog, Dialog, Menu, toast, useStore } from './common.js';
import { navigate } from '../router.js';

export function GradebookView({ data, t, cls }) {
  const settings = store.gradingSettings();
  const term1End = settings.term1EndMonthDay;
  const [view, setView] = useState(() => String(termOf(today(), term1End)));
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);
  // Σύνοψη (5 κριτήρια) ή αναλυτικά (κάθε αξιολόγηση σε στήλη)· η επιλογή θυμάται ανά συσκευή.
  const [detail, setDetailState] = useState(() => {
    try {
      return localStorage.getItem('atzenta.gbDetail') !== '0';
    } catch {
      return true;
    }
  });
  const setDetail = (v) => {
    setDetailState(v);
    try {
      localStorage.setItem('atzenta.gbDetail', v ? '1' : '0');
    } catch {
      /* χωρίς αποθήκευση προτίμησης */
    }
  };

  const students = studentsOf(data, cls.id);
  const index = useMemo(() => indexGrades(data), [data.marks, data.scores]);
  const termAssessments = {
    1: assessmentsOf(data, t.id, 1, term1End),
    2: assessmentsOf(data, t.id, 2, term1End),
  };
  const results = useMemo(() => {
    const out = new Map();
    for (const s of students) {
      const r1 = termResult({ teaching: t, studentId: s.id, term: 1, assessments: termAssessments[1], index });
      const r2 = termResult({ teaching: t, studentId: s.id, term: 2, assessments: termAssessments[2], index });
      const finalExam = index.scores.get(scoreId(t.id, s.id, 'final'))?.value ?? null;
      out.set(s.id, { 1: r1, 2: r2, finalExam, annual: annualResult({ term1: r1.grade, term2: r2.grade, examined: t.examined, finalExam }) });
    }
    return out;
  }, [data, t]);

  const openAssessment = (a) => setDialog(html`<${AssessmentDialog} t=${t} students=${students} assessment=${a} onClose=${close} />`);
  const newAssessment = (kind) => {
    const a = store.addAssessment(t.id, { kind, title: '', date: today() });
    openAssessment(a);
  };

  if (students.length === 0) {
    return html`
      <div class="empty">
        <${Icon} name="school" />
        <h2>Δεν υπάρχουν μαθητές στο ${cls.name}</h2>
        <p>Περάστε τους μαθητές από τη λίστα του myschool (Ρυθμίσεις → Μαθητές) ή προσθέστε τους από το μενού του τμήματος.</p>
        <button class="btn primary" onClick=${() => navigate('/settings')}>Εισαγωγή από myschool</button>
      </div>`;
  }

  const term = view === 'annual' ? null : Number(view);
  const assessments = term ? termAssessments[term] : [];

  return html`
    <div class="gradebook">
      <div class="gb-toolbar">
        <div class="segmented" role="tablist" aria-label="Περίοδος">
          ${[['1', 'Α΄ τετράμηνο'], ['2', 'Β΄ τετράμηνο'], ['annual', 'Ετήσιος']].map(([k, label]) => html`
            <button role="tab" aria-selected=${view === k} class=${view === k ? 'on' : ''} onClick=${() => setView(k)}>${label}</button>`)}
        </div>
        ${term && html`
          <div class="segmented small" role="group" aria-label="Προβολή">
            <button class=${detail ? '' : 'on'} aria-pressed=${!detail} onClick=${() => setDetail(false)}>Σύνοψη</button>
            <button class=${detail ? 'on' : ''} aria-pressed=${detail} onClick=${() => setDetail(true)}>Αναλυτικά</button>
          </div>`}
        <span class="grow"></span>
        ${term && html`
          <button class="btn small" onClick=${() => newAssessment('homework')}><${Icon} name="add" /> Εργασία</button>
          <button class="btn small" onClick=${() => newAssessment('test')}><${Icon} name="add" /> Τεστ</button>
          <button class="btn small" onClick=${() => newAssessment('exam')}><${Icon} name="add" /> Διαγώνισμα</button>`}
        <${Menu} label="Επιλογές βαθμολογίου" items=${[
          { label: 'Ρυθμίσεις βαθμολογίου', icon: 'settings', onClick: () => setDialog(html`<${GradingSettingsDialog} t=${t} onClose=${close} />`) },
          { label: 'Εξαγωγή σε Excel (CSV)', icon: 'download', onClick: () => exportCsv({ t, cls, students, results, view }) },
        ]} />
      </div>

      ${term && html`
        <div class="chips">
          ${assessments.length === 0 && html`<span class="muted">Καμία αξιολόγηση ακόμη στο ${term === 1 ? 'Α΄' : 'Β΄'} τετράμηνο.</span>`}
          ${assessments.map((a) => {
            const graded = students.filter((s) => {
              const m = index.marks.get(markId(a.id, s.id));
              return m && (m.grade != null || m.status);
            }).length;
            return html`
              <button class=${`chip kind-${a.kind}`} onClick=${() => openAssessment(a)}>
                <b>${KINDS[a.kind].label}</b> ${formatDate(a.date)}${a.title ? ` · ${a.title}` : ''}
                <span class="muted"> ${graded}/${students.length}</span>
              </button>`;
          })}
        </div>`}

      <div class="table-wrap">
        ${term
          ? html`<${TermTable} t=${t} term=${term} students=${students} results=${results} assessments=${assessments}
              index=${index} detail=${detail} openAssessment=${openAssessment} />`
          : html`<${AnnualTable} t=${t} students=${students} results=${results} />`}
      </div>
      ${term && detail && assessments.length > 0 && html`
        <p class="muted" style="font-size:.85rem;margin:0">
          <b>Διόρθωση:</b> γράψτε τον νέο βαθμό στο κελί. <b>Διαγραφή βαθμού:</b> σβήστε το κελί.
          Ε = εργασία, Τ = τεστ, Δ = διαγώνισμα — πατήστε τον τίτλο της στήλης για όλη την αξιολόγηση.
          Στις εργασίες το ✓ / ⏱ / ✗ αλλάζει με πάτημα.
        </p>`}
      ${t.examined && view === 'annual' && html`
        <p class="muted" style="font-size:.85rem">Εξεταζόμενο μάθημα: Ετήσιος = (Μ.Ο. τετραμήνων + γραπτές εξετάσεις) / 2.</p>`}
    </div>
    ${dialog}`;
}

/** Ποια στήλη αντιστοιχεί σε ποιο είδος αξιολόγησης (στην αναλυτική προβολή). */
const KIND_OF = { homework: 'homework', tests: 'test', exams: 'exam' };
const SHORT = { homework: 'Ε', test: 'Τ', exam: 'Δ' };
const STATUS_ICON = { ontime: '✓', late: '⏱', missing: '✗' };
/** Πάτημα στο εικονίδιο παράδοσης: χωρίς → εμπρόθεσμα → εκπρόθεσμα → δεν παραδόθηκε → χωρίς */
const nextStatus = (status) => ({ ontime: 'late', late: 'missing', missing: null })[status] ?? (status ? null : 'ontime');

function TermTable({ t, term, students, results, assessments, index, detail, openAssessment }) {
  const weights = t.weights ?? DEFAULT_WEIGHTS;
  const active = CRITERIA.filter((c) => (weights[c.key] ?? 0) > 0);
  // Στην αναλυτική προβολή οι αξιολογήσεις με χρονολογική σειρά (η πρώτη αριστερά).
  const byKind = {};
  for (const kind of Object.keys(KINDS)) {
    byKind[kind] = assessments.filter((a) => a.kind === kind).sort((a, b) => a.date.localeCompare(b.date));
  }
  const avg = (values) => {
    const v = values.filter((x) => typeof x === 'number');
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const markOf = (a, s) => index.marks.get(markId(a.id, s.id));
  const termValues = (s) => results.get(s.id)[term].values;

  // Οι στήλες: [{ key, header, title, group, avgCol, cell(s), foot }]
  const columns = [];
  for (const c of active) {
    const kind = KIND_OF[c.key];
    if (detail && kind) {
      byKind[kind].forEach((a, i) => columns.push({
        key: a.id,
        group: i === 0,
        header: html`<button class="link-btn" onClick=${() => openAssessment(a)}>${SHORT[kind]}${i + 1}</button>`,
        title: `${KINDS[kind].label} ${i + 1} · ${formatDate(a.date)}${a.title ? ` · ${a.title}` : ''}`,
        cell: (s) => {
          const m = markOf(a, s);
          return html`<span class="cell-mark">
            ${kind === 'homework' && html`<button class=${`status-dot ${m?.status ?? 'none'}`} title="Παράδοση (πατήστε για αλλαγή)"
              aria-label=${`Παράδοση: ${m?.status ? HOMEWORK_STATUS[m.status].label : 'χωρίς'}`}
              onClick=${() => store.setMark(a.id, s.id, { status: nextStatus(m?.status) })}>${STATUS_ICON[m?.status] ?? '·'}</button>`}
            <${GradeInput} value=${m?.grade ?? null} label=${`${KINDS[kind].label} ${i + 1} ${s.surname}`}
              onCommit=${(v) => store.setMark(a.id, s.id, { grade: v })} />
          </span>`;
        },
        foot: avg(students.map((s) => markOf(a, s)?.grade)),
      }));
      columns.push({
        key: `avg-${c.key}`,
        group: byKind[kind].length === 0,
        avgCol: byKind[kind].length > 0,
        header: byKind[kind].length ? `Μ.Ο. ${c.short}` : c.short,
        title: `Μέσος όρος: ${c.label}`,
        cell: (s) => formatGrade(termValues(s)[c.key]),
        foot: avg(students.map((s) => termValues(s)[c.key])),
      });
      continue;
    }
    columns.push({
      key: c.key,
      group: detail,
      header: c.short,
      title: c.label,
      cell: (s) => {
        const r = results.get(s.id)[term];
        if (c.key === 'participation') {
          return html`<${GradeInput} value=${r.values.participation} label=${`Συμμετοχή ${s.surname}`}
            onCommit=${(v) => store.setScore(t.id, s.id, `participation${term}`, v)} />`;
        }
        return html`${formatGrade(r.values[c.key])}${c.key === 'consistency' && r.homeworkCount
          ? html`<small class="muted"> (${r.onTime}/${r.homeworkCount})</small>` : ''}`;
      },
      foot: avg(students.map((s) => termValues(s)[c.key])),
    });
  }
  const cls = (col) => `${col.group ? 'group' : ''} ${col.avgCol ? 'avg' : ''}`;

  return html`
    <table class=${`grades ${detail ? 'detail' : ''}`}>
      <thead>
        <tr>
          <th class="num">#</th>
          <th class="name">Μαθητής</th>
          ${columns.map((col) => html`<th key=${col.key} title=${col.title} class=${cls(col)}>${col.header}</th>`)}
          <th class="final">Βαθμός</th>
        </tr>
      </thead>
      <tbody>
        ${students.map((s) => html`
          <tr key=${s.id}>
            <td class="num">${s.order ?? ''}</td>
            <td class="name"><button class="link-btn" title=${`Καρτέλα: ${s.surname} ${s.name}`}
              onClick=${() => navigate(`/s/${s.id}`)}>${s.surname} ${s.name}</button></td>
            ${columns.map((col) => html`<td key=${col.key} class=${cls(col)}>${col.cell(s)}</td>`)}
            <td class="final"><b>${formatGrade(results.get(s.id)[term].grade)}</b></td>
          </tr>`)}
      </tbody>
      <tfoot>
        <tr>
          <td></td>
          <td class="name">Μέσος όρος τμήματος</td>
          ${columns.map((col) => html`<td key=${col.key} class=${cls(col)}>${formatGrade(col.foot)}</td>`)}
          <td class="final">${formatGrade(avg(students.map((s) => results.get(s.id)[term].grade)))}</td>
        </tr>
      </tfoot>
    </table>`;
}

function AnnualTable({ t, students, results }) {
  return html`
    <table class="grades">
      <thead>
        <tr>
          <th class="num">#</th><th class="name">Μαθητής</th><th>Α΄</th><th>Β΄</th><th>Μ.Ο.</th>
          ${t.examined && html`<th>Γραπτές</th>`}
          <th class="final">Ετήσιος</th>
        </tr>
      </thead>
      <tbody>
        ${students.map((s) => {
          const r = results.get(s.id);
          return html`
            <tr key=${s.id}>
              <td class="num">${s.order ?? ''}</td>
              <td class="name"><button class="link-btn" title=${`Καρτέλα: ${s.surname} ${s.name}`}
                onClick=${() => navigate(`/s/${s.id}`)}>${s.surname} ${s.name}</button></td>
              <td>${formatGrade(r[1].grade)}</td>
              <td>${formatGrade(r[2].grade)}</td>
              <td>${formatGrade(r.annual.termsAvg)}</td>
              ${t.examined && html`<td><${GradeInput} value=${r.finalExam} label=${`Γραπτές ${s.surname}`}
                  onCommit=${(v) => store.setScore(t.id, s.id, 'final', v)} /></td>`}
              <td class="final"><b>${r.annual.pendingExam ? html`<span class="muted" title="Λείπει ο βαθμός των γραπτών">…</span>` : formatGrade(r.annual.grade)}</b></td>
            </tr>`;
        })}
      </tbody>
    </table>`;
}

/** Πεδίο βαθμού 0–20 που αποθηκεύει όταν φεύγετε από αυτό ή πατάτε Enter. */
export function GradeInput({ value, label, onCommit, onEnter, inputRef }) {
  const [text, setText] = useState(value == null ? '' : String(value).replace('.', ','));
  const [invalid, setInvalid] = useState(false);
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : String(value).replace('.', ','));
  }, [value]);
  const commit = () => {
    const v = parseGrade(text);
    if (v === undefined) {
      setInvalid(true);
      return false;
    }
    setInvalid(false);
    if (v !== (value ?? null)) onCommit(v);
    return true;
  };
  return html`
    <input class=${`grade-input ${invalid ? 'invalid' : ''}`} ref=${inputRef} type="text" inputmode="decimal"
      value=${text} aria-label=${label} placeholder="—" maxlength="5"
      onInput=${(e) => { setText(e.target.value); setInvalid(false); }}
      onFocus=${(e) => { focused.current = true; e.target.select(); }}
      onBlur=${() => { focused.current = false; commit(); }}
      onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); if (commit()) onEnter?.(); } }} />`;
}

/** Καταχώριση μιας αξιολόγησης: τίτλος, ημερομηνία, βαθμός (και παράδοση για εργασίες) ανά μαθητή. */
function AssessmentDialog({ t, students, assessment, onClose }) {
  // Τα δεδομένα από το store (όχι από τη στιγμή που άνοιξε το παράθυρο), ώστε να φαίνεται κάθε βαθμός.
  const data = useStore(store.subscribe, store.getData);
  const a = data.assessments.find((x) => x.id === assessment.id && !x.deleted) ?? assessment;
  const [title, setTitle] = useState(a.title ?? '');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const inputs = useRef([]);
  const titleInput = useRef(null);
  // Νέα αξιολόγηση (χωρίς τίτλο): ο κέρσορας στον τίτλο· αλλιώς στον πρώτο βαθμό.
  useEffect(() => (a.title ? inputs.current[0] : titleInput.current)?.focus(), []);
  const index = useMemo(() => indexGrades(data), [data.marks]);
  const isHomework = a.kind === 'homework';
  const settings = store.gradingSettings();

  const grades = students.map((s) => index.marks.get(markId(a.id, s.id))?.grade).filter((g) => typeof g === 'number');
  const average = grades.length ? grades.reduce((x, y) => x + y, 0) / grades.length : null;

  const saveTitle = () => title.trim() !== (a.title ?? '') && store.updateAssessment(a.id, { title: title.trim() });
  const finish = () => {
    saveTitle();
    // Κενή αξιολόγηση (καμία βαθμολογία, χωρίς τίτλο) δεν κρατιέται.
    const touched = students.some((s) => index.marks.has(markId(a.id, s.id)));
    if (!touched && !title.trim()) store.deleteAssessment(a.id);
    onClose();
  };

  if (confirmDelete) {
    return html`<${ConfirmDialog} title=${`Διαγραφή: ${KINDS[a.kind].label}`}
      text="Θα διαγραφούν η αξιολόγηση και οι βαθμοί της." onConfirm=${() => store.deleteAssessment(a.id)} onClose=${onClose} />`;
  }

  return html`
    <${Dialog} title=${KINDS[a.kind].label} onClose=${finish}>
      <div class="row">
        <label class="field grow">Τίτλος
          <input ref=${titleInput} type="text" value=${title}
            onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); saveTitle(); inputs.current[0]?.focus(); } }}
            placeholder=${isHomework ? 'π.χ. Ασκήσεις σελ. 42' : 'π.χ. Εξισώσεις'}
            onInput=${(e) => setTitle(e.target.value)} onBlur=${saveTitle} />
        </label>
        <label class="field">Ημερομηνία
          <input type="date" value=${a.date} onChange=${(e) => e.target.value && store.updateAssessment(a.id, { date: e.target.value })} />
        </label>
      </div>
      <p class="muted" style="margin:0;font-size:.85rem">
        ${termOf(a.date, settings.term1EndMonthDay) === 1 ? 'Α΄' : 'Β΄'} τετράμηνο · Μ.Ο.: <b>${formatGrade(average)}</b> (${grades.length}/${students.length})
      </p>
      ${isHomework && html`
        <div class="row">
          <button class="btn small" onClick=${() => students.forEach((s) => {
            if (!index.marks.get(markId(a.id, s.id))?.status) store.setMark(a.id, s.id, { status: 'ontime' });
          })}><${Icon} name="check" /> Όσοι λείπουν: εμπρόθεσμα</button>
        </div>`}
      <ul class="mark-list">
        ${students.map((s, i) => {
          const m = index.marks.get(markId(a.id, s.id));
          return html`
            <li key=${s.id}>
              <span class="who"><span class="muted">${s.order ?? ''}</span> ${s.surname} ${s.name}</span>
              ${isHomework && html`
                <span class="status-group" role="group" aria-label="Παράδοση">
                  ${Object.entries(HOMEWORK_STATUS).map(([key, st]) => html`
                    <button class=${`status ${key} ${m?.status === key ? 'on' : ''}`} title=${st.label} aria-label=${st.label}
                      aria-pressed=${m?.status === key}
                      onClick=${() => store.setMark(a.id, s.id, { status: m?.status === key ? null : key })}>
                      ${key === 'ontime' ? '✓' : key === 'late' ? '⏱' : '✗'}
                    </button>`)}
                </span>`}
              <${GradeInput} value=${m?.grade ?? null} label=${`Βαθμός ${s.surname} ${s.name}`}
                inputRef=${(el) => (inputs.current[i] = el)}
                onEnter=${() => inputs.current[i + 1]?.focus()}
                onCommit=${(v) => store.setMark(a.id, s.id, { grade: v })} />
            </li>`;
        })}
      </ul>
      <div class="row">
        <button class="btn danger" onClick=${() => setConfirmDelete(true)}><${Icon} name="trash" /> Διαγραφή</button>
        <span class="grow"></span>
        <button class="btn primary" onClick=${finish}>Τέλος</button>
      </div>
    <//>`;
}

/** Βάρη κριτηρίων, εξεταζόμενο μάθημα, λήξη Α΄ τετραμήνου. */
function GradingSettingsDialog({ t, onClose }) {
  const [weights, setWeights] = useState({ ...DEFAULT_WEIGHTS, ...(t.weights ?? {}) });
  const [examined, setExamined] = useState(Boolean(t.examined));
  const settings = store.gradingSettings();
  const [m, d] = settings.term1EndMonthDay.split('-');
  const [term1End, setTerm1End] = useState(`2027-${m}-${d}`);
  const total = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0);

  const save = () => {
    store.updateTeaching(t.id, { weights, examined });
    const md = term1End.slice(5);
    if (md && md !== settings.term1EndMonthDay) store.updateGradingSettings({ term1EndMonthDay: md });
    toast('Οι ρυθμίσεις βαθμολογίου αποθηκεύτηκαν.');
    onClose();
  };

  return html`
    <${Dialog} title=${`Βαθμολόγιο — ${t.subject}`} onClose=${onClose}>
      <label class="row" style="gap:10px">
        <input type="checkbox" checked=${examined} onChange=${(e) => setExamined(e.target.checked)} style="width:20px;height:20px" />
        <span>Εξεταζόμενο μάθημα (γραπτές εξετάσεις Μαΐου-Ιουνίου)</span>
      </label>
      <div class="field">Βάρος κάθε κριτηρίου στον βαθμό τετραμήνου (0 = δεν μετράει)
        <table class="grades compact">
          <tbody>
            ${CRITERIA.map((c) => html`
              <tr>
                <td class="name">${c.label}</td>
                <td><input class="grade-input" type="number" min="0" max="10" step="1" value=${weights[c.key]}
                  aria-label=${`Βάρος: ${c.label}`}
                  onInput=${(e) => setWeights({ ...weights, [c.key]: Math.max(0, Number(e.target.value) || 0) })} /></td>
                <td class="muted">${total ? `${Math.round((weights[c.key] / total) * 100)}%` : ''}</td>
              </tr>`)}
          </tbody>
        </table>
      </div>
      <label class="field">Λήξη Α΄ τετραμήνου (ισχύει για όλα τα μαθήματα, κάθε χρονιά)
        <input type="date" value=${term1End} onInput=${(e) => setTerm1End(e.target.value)} />
      </label>
      <div class="row end">
        <button class="btn" onClick=${onClose}>Άκυρο</button>
        <button class="btn primary" disabled=${total === 0} onClick=${save}>Αποθήκευση</button>
      </div>
    <//>`;
}

/** CSV για Excel (διαχωριστικό «;», UTF-8 με BOM ώστε να φαίνονται σωστά τα ελληνικά). */
function exportCsv({ t, cls, students, results, view }) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const g = (v) => (typeof v === 'number' ? (Math.round(v * 10) / 10).toString().replace('.', ',') : '');
  let header;
  let rows;
  if (view === 'annual') {
    header = ['Α/Α', 'Επώνυμο', 'Όνομα', 'Α΄ τετράμηνο', 'Β΄ τετράμηνο', 'Μ.Ο. τετραμήνων', ...(t.examined ? ['Γραπτές'] : []), 'Ετήσιος'];
    rows = students.map((s) => {
      const r = results.get(s.id);
      return [s.order, s.surname, s.name, g(r[1].grade), g(r[2].grade), g(r.annual.termsAvg), ...(t.examined ? [g(r.finalExam)] : []), g(r.annual.grade)];
    });
  } else {
    const term = Number(view);
    header = ['Α/Α', 'Επώνυμο', 'Όνομα', ...CRITERIA.map((c) => c.label), 'Βαθμός τετραμήνου'];
    rows = students.map((s) => {
      const r = results.get(s.id)[term];
      return [s.order, s.surname, s.name, ...CRITERIA.map((c) => g(r.values[c.key])), g(r.grade)];
    });
  }
  const csv = '﻿' + [header, ...rows].map((r) => r.map(q).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const period = view === 'annual' ? 'ετήσιος' : `${view === '1' ? 'Α' : 'Β'}-τετράμηνο`;
  a.download = `βαθμολογία-${cls.name}-${t.subject}-${period}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
