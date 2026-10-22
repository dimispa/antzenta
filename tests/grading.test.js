// Tests βαθμολογίου (js/grading.js) και εισαγωγής μαθητών (js/xlsx.js + js/myschool.js).
import {
  annualResult, formatGrade, indexGrades, markId, parseGrade, schoolYearOf, scoreId, termOf, termResult, weightedMean,
} from '../js/grading.js';
import { readXlsx } from '../js/xlsx.js';
import { parseMyschoolStudents, studentKey } from '../js/myschool.js';

const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, error: e.message });
  }
}
function eq(actual, expected, msg = '') {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${msg} αναμενόταν ${b}, βρέθηκε ${a}`);
}
const close = (a, b, msg = '') => {
  if (Math.abs(a - b) > 1e-9) throw new Error(`${msg} αναμενόταν ${b}, βρέθηκε ${a}`);
};

await test('Τετράμηνο από ημερομηνία (Α΄ έως 20 Ιανουαρίου)', () => {
  eq(termOf('2026-10-21'), 1);
  eq(termOf('2027-01-20'), 1);
  eq(termOf('2027-01-21'), 2);
  eq(termOf('2027-05-20'), 2);
  eq(termOf('2027-01-17', '01-17'), 1);
  eq(termOf('2027-01-18', '01-17'), 2);
  eq(schoolYearOf('2027-03-01'), '2026-2027');
  eq(schoolYearOf('2026-09-11'), '2026-2027');
});

await test('Σταθμισμένος μέσος όρος: τα κριτήρια χωρίς βαθμό δεν μετράνε', () => {
  const v = { participation: 18, homework: 16, consistency: null, tests: 14, exams: null };
  close(weightedMean(v), 16);
  close(weightedMean(v, { participation: 1, homework: 1, consistency: 1, tests: 2, exams: 1 }), (18 + 16 + 28) / 4);
  eq(weightedMean({}), null);
});

// Ένα μάθημα με 2 εργασίες, 2 τεστ, 1 διαγώνισμα στο Α΄ τετράμηνο.
const teaching = { id: 't1', weights: { participation: 1, homework: 1, consistency: 1, tests: 1, exams: 1 } };
const assessments = [
  { id: 'h1', kind: 'homework', date: '2026-10-05' },
  { id: 'h2', kind: 'homework', date: '2026-11-05' },
  { id: 'q1', kind: 'test', date: '2026-10-20' },
  { id: 'q2', kind: 'test', date: '2026-12-01' },
  { id: 'x1', kind: 'exam', date: '2026-12-15' },
];
const data = {
  marks: [
    { id: markId('h1', 's1'), grade: 18, status: 'ontime' },
    { id: markId('h2', 's1'), grade: 14, status: 'late' },
    { id: markId('q1', 's1'), grade: 15 },
    { id: markId('q2', 's1'), grade: 17 },
    { id: markId('x1', 's1'), grade: 13 },
    { id: markId('h1', 's2'), status: 'missing' },
    { id: markId('h2', 's2'), grade: 12, status: 'ontime' },
  ],
  scores: [{ id: scoreId('t1', 's1', 'participation1'), value: 19 }],
};

await test('Βαθμός τετραμήνου: 5 κριτήρια με ίσο βάρος', () => {
  const r = termResult({ teaching, studentId: 's1', term: 1, assessments, index: indexGrades(data) });
  eq(r.values, { participation: 19, homework: 16, consistency: 15, tests: 16, exams: 13 });
  close(r.grade, (19 + 16 + 15 + 16 + 13) / 5);
  eq([r.onTime, r.homeworkCount], [1, 2]);
});

await test('Συνέπεια: μη παράδοση = 0, εμπρόθεσμη = 20· εργασία χωρίς βαθμό δεν μετρά στον Μ.Ο. εργασιών', () => {
  const r = termResult({ teaching, studentId: 's2', term: 1, assessments, index: indexGrades(data) });
  eq(r.values.consistency, 10);
  eq(r.values.homework, 12);
  eq(r.values.tests, null);
  close(r.grade, (12 + 10) / 2);
});

await test('Μαθητής χωρίς καμία βαθμολογία: χωρίς βαθμό', () => {
  const r = termResult({ teaching, studentId: 's9', term: 1, assessments, index: indexGrades(data) });
  eq(r.grade, null);
});

await test('Ετήσιος: Μ.Ο. τετραμήνων, ή (Μ.Ο. + γραπτές)/2 στα εξεταζόμενα', () => {
  eq(annualResult({ term1: 15, term2: 17, examined: false }).grade, 16);
  eq(annualResult({ term1: 15, term2: null, examined: false }).grade, 15);
  eq(annualResult({ term1: 15, term2: 17, examined: true, finalExam: 12 }).grade, 14);
  const pending = annualResult({ term1: 15, term2: 17, examined: true, finalExam: null });
  eq([pending.grade, pending.pendingExam, pending.termsAvg], [null, true, 16]);
});

await test('Βαθμοί: ανάγνωση «15,5» και εμφάνιση με ελληνική υποδιαστολή', () => {
  eq(parseGrade('15,5'), 15.5);
  eq(parseGrade(' 18 '), 18);
  eq(parseGrade(''), null);
  eq(parseGrade('21'), undefined);
  eq(parseGrade('abc'), undefined);
  eq(formatGrade(15.25), '15,3');
  eq(formatGrade(null), '—');
});

await test('Excel myschool: τμήματα, συνέχεια σε 2η σελίδα, μόνο ονόματα (όχι στοιχεία κηδεμόνων)', async () => {
  const buffer = await (await fetch('./fixtures/myschool-sample.xlsx')).arrayBuffer();
  const sheets = await readXlsx(buffer);
  eq(sheets.length, 4);
  const { schoolYear, sections } = parseMyschoolStudents(sheets);
  eq(schoolYear, '2026-2027');
  eq(sections.map((s) => [s.name, s.grade, s.students.length]), [['Α1', 'Α', 4], ['Β2', 'Β', 2], ['Γ10', 'Γ', 1]]);
  eq(sections[0].students[3], { order: 4, surname: 'ΔΕΛΤΑΚΗ (DELTAKI)', name: 'ΕΛΕΝΗ (ELENI)', father: 'ΑΝΤΡΕΑΣ (ANDREAS)' });
  eq(sections[0].students[2].father, '');
  eq(JSON.stringify(sections).includes('6900000000') || JSON.stringify(sections).includes('@'), false, 'στοιχεία κηδεμόνων:');
});

await test('Excel όπως το βγάζει το myschool (απόλυτες διαδρομές, t="n")', async () => {
  const buffer = await (await fetch('./fixtures/myschool-sample-myschoolstyle.xlsx')).arrayBuffer();
  const { sections } = parseMyschoolStudents(await readXlsx(buffer));
  eq(sections.map((s) => [s.name, s.students.length]), [['Α1', 4], ['Β2', 2], ['Γ10', 1]]);
  eq(sections[1].students[0].order, 1);
});

await test('Ίδιος μαθητής αναγνωρίζεται σε νέα εισαγωγή', () => {
  eq(studentKey({ surname: ' Αλφαδης ', name: 'Νικος', father: 'Γιωργος' }), studentKey({ surname: 'ΑΛΦΑΔΗΣ', name: 'ΝΙΚΟΣ', father: 'ΓΙΩΡΓΟΣ' }));
});

// ---- Εμφάνιση αποτελεσμάτων ----
const list = document.getElementById('results');
for (const r of results) {
  const li = document.createElement('li');
  li.className = r.ok ? 'pass' : 'fail';
  li.textContent = r.ok ? `✓ ${r.name}` : `✗ ${r.name} — ${r.error}`;
  list.append(li);
}
const failed = results.filter((r) => !r.ok).length;
document.getElementById('summary').textContent = failed ? `${failed} από ${results.length} απέτυχαν` : `Όλα τα ${results.length} tests πέρασαν`;
document.title = failed ? `ΑΠΟΤΥΧΙΑ (${failed})` : `OK (${results.length})`;
