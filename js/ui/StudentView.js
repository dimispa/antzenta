// Καρτέλα μαθητή: σύνοψη της εικόνας του σε όλα τα μαθήματα που του διδάσκετε.
import { html, useEffect, useMemo, useRef, useState } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import {
  CRITERIA, DEFAULT_WEIGHTS, HOMEWORK_STATUS, KINDS, annualResult, assessmentsOf, formatGrade, indexGrades, markId,
  scoreId, termResult,
} from '../grading.js';
import { formatDate, teachingsOf } from '../model.js';
import { Icon } from './icons.js';
import { GradeInput } from './GradebookView.js';
import { back, navigate } from '../router.js';

export function StudentView({ data, studentId }) {
  const s = (data.students ?? []).find((x) => x.id === studentId && !x.deleted);
  const cls = s && data.classes.find((c) => c.id === s.classId);
  const index = useMemo(() => indexGrades(data), [data.marks, data.scores]);

  if (!s) {
    return html`
      <header class="topbar">
        <button class="icon-btn" aria-label="Πίσω" onClick=${() => navigate('/', { replace: true })}><${Icon} name="back" /></button>
        <h1>Δεν βρέθηκε ο μαθητής</h1>
      </header>`;
  }

  const teachings = teachingsOf(data.teachings, s.classId);
  const term1End = store.gradingSettings().term1EndMonthDay;

  return html`
    <header class="topbar">
      <button class="icon-btn" aria-label="Πίσω" onClick=${() => back(`/c/${s.classId}`)}><${Icon} name="back" /></button>
      <h1>${s.surname} ${s.name}
        <span class="sub">Τμήμα ${cls?.name ?? ''}${s.father ? ` · του ${s.father}` : ''}</span>
      </h1>
    </header>
    <main class="page wide">
      <${Notes} student=${s} />
      ${teachings.length === 0 && html`<p class="muted">Δεν έχετε μαθήματα σε αυτό το τμήμα.</p>`}
      ${teachings.map((t) => html`<${SubjectSummary} key=${t.id} data=${data} t=${t} s=${s} index=${index} term1End=${term1End} />`)}
    </main>`;
}

/** Ελεύθερες παρατηρήσεις για τον μαθητή (αποθηκεύονται καθώς γράφετε). */
function Notes({ student }) {
  const [text, setText] = useState(student.notes ?? '');
  const [saved, setSaved] = useState('');
  const timer = useRef(null);
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => () => {
    if (timer.current) {
      clearTimeout(timer.current);
      store.updateStudent(student.id, { notes: latest.current });
    }
  }, []);
  const onInput = (e) => {
    setText(e.target.value);
    setSaved('');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      store.updateStudent(student.id, { notes: latest.current });
      setSaved('Αποθηκεύτηκε');
    }, 700);
  };
  return html`
    <section class="panel">
      <h2>Παρατηρήσεις</h2>
      <textarea aria-label="Παρατηρήσεις για τον μαθητή" placeholder="π.χ. συμμετέχει ενεργά· χρειάζεται βοήθεια στις εξισώσεις…"
        style="min-height:90px" value=${text} onInput=${onInput} />
      <div class="saved" aria-live="polite">${saved}</div>
    </section>`;
}

function SubjectSummary({ data, t, s, index, term1End }) {
  const weights = t.weights ?? DEFAULT_WEIGHTS;
  const terms = [1, 2].map((term) => {
    const assessments = assessmentsOf(data, t.id, term, term1End);
    return { term, assessments, result: termResult({ teaching: t, studentId: s.id, term, assessments, index }) };
  });
  const finalExam = index.scores.get(scoreId(t.id, s.id, 'final'))?.value ?? null;
  const annual = annualResult({ term1: terms[0].result.grade, term2: terms[1].result.grade, examined: t.examined, finalExam });

  return html`
    <section class="panel subject-summary" style=${`--accent:${t.color}`}>
      <div class="row">
        <h2 class="grow"><span style=${`color:${t.color}`}>●</span> ${t.subject}</h2>
        <button class="btn small" onClick=${() => navigate(`/t/${t.id}/grades`)}>Βαθμολόγιο</button>
      </div>
      <div class="grade-boxes">
        <div><span>Α΄ τετράμηνο</span><b>${formatGrade(terms[0].result.grade)}</b></div>
        <div><span>Β΄ τετράμηνο</span><b>${formatGrade(terms[1].result.grade)}</b></div>
        ${t.examined && html`<div><span>Γραπτές</span><b>${formatGrade(finalExam)}</b></div>`}
        <div class="final"><span>Ετήσιος</span><b>${annual.pendingExam ? '…' : formatGrade(annual.grade)}</b></div>
      </div>
      ${terms.map(({ term, assessments, result }) => {
        const hasData = assessments.length > 0 || result.values.participation != null;
        if (!hasData) return null;
        return html`
          <details open=${term === terms.findLast((x) => x.assessments.length || x.result.values.participation != null)?.term}>
            <summary><b>${term === 1 ? 'Α΄' : 'Β΄'} τετράμηνο</b> — βαθμός ${formatGrade(result.grade)}</summary>
            <table class="grades compact">
              <tbody>
                ${CRITERIA.filter((c) => (weights[c.key] ?? 0) > 0).map((c) => html`
                  <tr>
                    <td class="name">${c.label}</td>
                    <td>${c.key === 'participation'
                      ? html`<${GradeInput} value=${result.values.participation} label=${`Συμμετοχή ${term === 1 ? 'Α΄' : 'Β΄'}`}
                          onCommit=${(v) => store.setScore(t.id, s.id, `participation${term}`, v)} />`
                      : formatGrade(result.values[c.key])}
                      ${c.key === 'consistency' && result.homeworkCount
                        ? html`<small class="muted"> (${result.onTime}/${result.homeworkCount} εμπρόθεσμες)</small>` : ''}
                    </td>
                  </tr>`)}
              </tbody>
            </table>
            ${Object.keys(KINDS).map((kind) => {
              const list = assessments.filter((a) => a.kind === kind).sort((a, b) => a.date.localeCompare(b.date));
              if (!list.length) return null;
              const grades = list.map((a) => index.marks.get(markId(a.id, s.id))?.grade).filter((g) => typeof g === 'number');
              const avg = grades.length ? grades.reduce((x, y) => x + y, 0) / grades.length : null;
              return html`
                <h3 class="kind-title">${KINDS[kind].plural} <span class="muted">· Μ.Ο. ${formatGrade(avg)}</span></h3>
                <ul class="mark-list">
                  ${list.map((a, i) => {
                    const m = index.marks.get(markId(a.id, s.id));
                    return html`
                      <li key=${a.id}>
                        <span class="who">${i + 1}. ${formatDate(a.date)}${a.title ? ` · ${a.title}` : ''}</span>
                        ${kind === 'homework' && html`
                          <span class="status-group" role="group" aria-label="Παράδοση">
                            ${Object.entries(HOMEWORK_STATUS).map(([key, st]) => html`
                              <button class=${`status ${key} ${m?.status === key ? 'on' : ''}`} title=${st.label} aria-label=${st.label}
                                aria-pressed=${m?.status === key}
                                onClick=${() => store.setMark(a.id, s.id, { status: m?.status === key ? null : key })}>
                                ${key === 'ontime' ? '✓' : key === 'late' ? '⏱' : '✗'}
                              </button>`)}
                          </span>`}
                        <${GradeInput} value=${m?.grade ?? null} label=${`${KINDS[kind].label} ${i + 1}`}
                          onCommit=${(v) => store.setMark(a.id, s.id, { grade: v })} />
                      </li>`;
                  })}
                </ul>`;
            })}
          </details>`;
      })}
      ${t.examined && html`
        <div class="row">
          <span class="grow">Γραπτές εξετάσεις</span>
          <${GradeInput} value=${finalExam} label="Γραπτές εξετάσεις" onCommit=${(v) => store.setScore(t.id, s.id, 'final', v)} />
        </div>`}
    </section>`;
}
