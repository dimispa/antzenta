// Ανάγνωση της «Λίστας μαθητών» του myschool (rptList_mathites_*.xlsx).
// Κάθε φύλλο είναι μία σελίδα: επικεφαλίδα «Τμήμα: Α1», γραμμή τίτλων («Επώνυμο μαθητή» …)
// και οι μαθητές. Ένα τμήμα μπορεί να συνεχίζεται σε επόμενο φύλλο.
//
// Κρατάμε ΜΟΝΟ επώνυμο, όνομα και πατρώνυμο — τα στοιχεία επικοινωνίας κηδεμόνων αγνοούνται.

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();

function firstValueAfter(cells, index) {
  for (let i = index + 1; i < cells.length; i++) if (clean(cells[i])) return clean(cells[i]);
  return '';
}

/**
 * sheets: [{ rows }] (από readXlsx)
 * → { schoolYear, sections: [{ name, grade, students: [{ order, surname, name, father }] }] }
 */
export function parseMyschoolStudents(sheets) {
  const sections = new Map();
  let schoolYear = '';

  for (const { rows } of sheets) {
    let section = null;
    let grade = '';
    let cols = null;
    for (const cells of rows) {
      const first = clean(cells[0]);
      if (/^Σχολικό έτος/.test(first)) schoolYear = firstValueAfter(cells, 0) || schoolYear;
      if (/^Τμήμα\s*:?/.test(first)) {
        section = first.replace(/^Τμήμα\s*:?\s*/, '') || firstValueAfter(cells, 0);
        continue;
      }
      if (/^Τάξη/.test(first)) {
        grade = first.replace(/^Τάξη[^:]*:?\s*/, '') || firstValueAfter(cells, 0);
        continue;
      }
      const header = cells.findIndex((c) => /^Επώνυμο/.test(clean(c)));
      if (header >= 0) {
        cols = { surname: header, name: -1, father: -1 };
        cells.forEach((c, i) => {
          const t = clean(c);
          if (/^Όνομα μαθητ/.test(t)) cols.name = i;
          else if (/^Όνομα πατ/.test(t)) cols.father = i;
        });
        continue;
      }
      if (!section || !cols || typeof cells[0] !== 'number') continue;
      const surname = clean(cells[cols.surname]);
      const name = cols.name >= 0 ? clean(cells[cols.name]) : '';
      if (!surname) continue;
      if (!sections.has(section)) sections.set(section, { name: section, grade, students: [] });
      sections.get(section).students.push({
        order: cells[0],
        surname,
        name,
        father: cols.father >= 0 ? clean(cells[cols.father]) : '',
      });
    }
  }
  const list = [...sections.values()].sort((a, b) => a.name.localeCompare(b.name, 'el', { numeric: true }));
  return { schoolYear, sections: list };
}

/** Κλειδί σύγκρισης μαθητή (για να μη διπλασιάζονται σε νέα εισαγωγή). */
export function studentKey(s) {
  return [s.surname, s.name, s.father ?? ''].map((x) => clean(x).toLocaleUpperCase('el')).join('|');
}
