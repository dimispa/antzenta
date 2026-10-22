// Βαθμολόγιο: καθαρές συναρτήσεις υπολογισμού (χωρίς IndexedDB/DOM, ελέγχονται με tests).
//
// Δεδομένα:
//   students    { id, classId, surname, name, father, order }
//   assessments { id, teachingId, kind: 'homework'|'test'|'exam', title, date }
//   marks       { id: `${assessmentId}:${studentId}`, assessmentId, studentId, grade, status }
//               status μόνο για εργασίες: 'ontime' | 'late' | 'missing'
//   scores      { id: `${teachingId}:${studentId}:${key}`, teachingId, studentId, key, value }
//               key: 'participation1' | 'participation2' | 'final'
//   settings    { id: 'grading', term1EndMonthDay: '01-20' }
//
// Βαθμός τετραμήνου = σταθμισμένος μέσος όρος των κριτηρίων που έχουν βαθμό.
// Ετήσιος = Μ.Ο. τετραμήνων· αν το μάθημα είναι εξεταζόμενο: (Μ.Ο. τετραμήνων + γραπτές) / 2.

export const CRITERIA = [
  { key: 'participation', label: 'Παρουσία & συμμετοχή', short: 'Συμμ.' },
  { key: 'homework', label: 'Εργασίες', short: 'Εργ.' },
  { key: 'consistency', label: 'Συνέπεια (εμπρόθεσμες εργασίες)', short: 'Συν.' },
  { key: 'tests', label: 'Τεστ', short: 'Τεστ' },
  { key: 'exams', label: 'Διαγωνίσματα', short: 'Διαγ.' },
];

export const DEFAULT_WEIGHTS = { participation: 1, homework: 1, consistency: 1, tests: 1, exams: 1 };

export const KINDS = {
  homework: { label: 'Εργασία', plural: 'Εργασίες' },
  test: { label: 'Τεστ', plural: 'Τεστ' },
  exam: { label: 'Διαγώνισμα', plural: 'Διαγωνίσματα' },
};

/** Πόσο μετράει κάθε κατάσταση παράδοσης εργασίας στη «Συνέπεια». */
export const HOMEWORK_STATUS = {
  ontime: { label: 'Εμπρόθεσμα', value: 1 },
  late: { label: 'Εκπρόθεσμα', value: 0.5 },
  missing: { label: 'Δεν παραδόθηκε', value: 0 },
};

export const DEFAULT_TERM1_END = '01-20';

export function markId(assessmentId, studentId) {
  return `${assessmentId}:${studentId}`;
}

export function scoreId(teachingId, studentId, key) {
  return `${teachingId}:${studentId}:${key}`;
}

/**
 * Σε ποιο τετράμηνο ανήκει μια ημερομηνία. Η σχολική χρονιά ξεκινά τον Σεπτέμβριο·
 * το Α΄ τετράμηνο λήγει την [term1EndMonthDay] (π.χ. '01-20') του επόμενου έτους.
 */
export function termOf(dateIso, term1EndMonthDay = DEFAULT_TERM1_END) {
  const [y, m] = dateIso.split('-').map(Number);
  const endYear = m >= 9 ? y + 1 : y;
  return dateIso <= `${endYear}-${term1EndMonthDay}` ? 1 : 2;
}

/** Η σχολική χρονιά μιας ημερομηνίας, π.χ. '2026-2027'. */
export function schoolYearOf(dateIso) {
  const [y, m] = dateIso.split('-').map(Number);
  const start = m >= 9 ? y : y - 1;
  return `${start}-${start + 1}`;
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function mean(values) {
  const nums = values.filter(isNum);
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
}

/** Σταθμισμένος μέσος όρος· τα κριτήρια χωρίς βαθμό αγνοούνται (το βάρος τους μοιράζεται στα υπόλοιπα). */
export function weightedMean(values, weights = DEFAULT_WEIGHTS) {
  let sum = 0;
  let total = 0;
  for (const c of CRITERIA) {
    const v = values[c.key];
    const w = weights?.[c.key] ?? 0;
    if (isNum(v) && w > 0) {
      sum += v * w;
      total += w;
    }
  }
  return total > 0 ? sum / total : null;
}

/**
 * Ευρετήριο για γρήγορους υπολογισμούς σε όλο το τμήμα:
 * marks ανά βαθμολογία και scores ανά id.
 */
export function indexGrades(data) {
  const marks = new Map();
  for (const m of data.marks ?? []) if (!m.deleted) marks.set(m.id, m);
  const scores = new Map();
  for (const s of data.scores ?? []) if (!s.deleted) scores.set(s.id, s);
  return { marks, scores };
}

/** Οι αξιολογήσεις ενός μαθήματος σε ένα τετράμηνο (πιο πρόσφατη πρώτη). */
export function assessmentsOf(data, teachingId, term, term1End = DEFAULT_TERM1_END) {
  return (data.assessments ?? [])
    .filter((a) => !a.deleted && a.teachingId === teachingId && (term == null || termOf(a.date, term1End) === term))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

/**
 * Ο βαθμός ενός μαθητή σε ένα τετράμηνο, με την ανάλυση ανά κριτήριο.
 * [assessments]: οι αξιολογήσεις του μαθήματος στο τετράμηνο.
 */
export function termResult({ teaching, studentId, term, assessments, index }) {
  const byKind = { homework: [], test: [], exam: [] };
  for (const a of assessments) byKind[a.kind]?.push(a);
  const markOf = (a) => index.marks.get(markId(a.id, studentId));

  const homeworkMarks = byKind.homework.map(markOf);
  const statuses = homeworkMarks.map((m) => m?.status).filter((s) => s in HOMEWORK_STATUS);
  const consistency = statuses.length
    ? (statuses.reduce((sum, s) => sum + HOMEWORK_STATUS[s].value, 0) / statuses.length) * 20
    : null;

  const values = {
    participation: index.scores.get(scoreId(teaching.id, studentId, `participation${term}`))?.value ?? null,
    homework: mean(homeworkMarks.map((m) => m?.grade)),
    consistency,
    tests: mean(byKind.test.map((a) => markOf(a)?.grade)),
    exams: mean(byKind.exam.map((a) => markOf(a)?.grade)),
  };
  return {
    values,
    onTime: statuses.filter((s) => s === 'ontime').length,
    homeworkCount: byKind.homework.length,
    grade: weightedMean(values, teaching.weights ?? DEFAULT_WEIGHTS),
  };
}

/** Ετήσιος βαθμός. */
export function annualResult({ term1, term2, examined, finalExam }) {
  const termsAvg = mean([term1, term2]);
  if (!examined) return { termsAvg, grade: termsAvg };
  if (!isNum(finalExam)) return { termsAvg, grade: null, pendingExam: termsAvg != null };
  if (termsAvg == null) return { termsAvg, grade: null };
  return { termsAvg, grade: (termsAvg + finalExam) / 2 };
}

/** Εμφάνιση βαθμού: ένα δεκαδικό, ελληνική υποδιαστολή. */
export function formatGrade(value) {
  if (!isNum(value)) return '—';
  return (Math.round(value * 10) / 10).toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

/** Ανάγνωση βαθμού από πεδίο: δέχεται «15,5» ή «15.5», 0–20. undefined = μη έγκυρο. */
export function parseGrade(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (t === '') return null;
  const v = Number(t);
  if (!Number.isFinite(v) || v < 0 || v > 20) return undefined;
  return Math.round(v * 100) / 100;
}

/** Ταξινόμηση μαθητών: Α/Α του myschool, μετά αλφαβητικά. */
export function byStudentOrder(a, b) {
  return (a.order ?? 999) - (b.order ?? 999) || a.surname.localeCompare(b.surname, 'el') || a.name.localeCompare(b.name, 'el');
}

export function studentsOf(data, classId) {
  return (data.students ?? []).filter((s) => !s.deleted && s.classId === classId).sort(byStudentOrder);
}
