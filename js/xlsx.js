// Ελάχιστος αναγνώστης αρχείων .xlsx στον browser, χωρίς εξωτερική βιβλιοθήκη:
// το .xlsx είναι αρχείο ZIP με φύλλα XML. Αποσυμπίεση με DecompressionStream('deflate-raw')
// (Chrome 80+, Safari 16.4+, Firefox 113+) και ανάγνωση XML με DOMParser.
//
// readXlsx(arrayBuffer) → [{ name, rows: [[τιμή, …], …] }]  (κάθε γραμμή με τις στήλες στη θέση τους)

const td = new TextDecoder('utf-8');

/** Τα αρχεία του ZIP: Map<όνομα, async () => Uint8Array>. */
function unzip(buffer) {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  // Τέλος κεντρικού καταλόγου: υπογραφή 0x06054b50, ψάχνουμε από το τέλος.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Δεν είναι έγκυρο αρχείο Excel (.xlsx)');
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const entries = new Map();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== 0x02014b50) throw new Error('Κατεστραμμένο αρχείο Excel');
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = td.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, async () => {
      const lNameLen = view.getUint16(localOffset + 26, true);
      const lExtraLen = view.getUint16(localOffset + 28, true);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = bytes.subarray(start, start + compSize);
      if (method === 0) return data;
      if (method !== 8) throw new Error(`Μη υποστηριζόμενη συμπίεση (${method})`);
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

async function readXml(entries, name) {
  const get = entries.get(name);
  if (!get) return null;
  return new DOMParser().parseFromString(td.decode(await get()), 'application/xml');
}

// Τα στοιχεία XML έχουν namespace· τα βρίσκουμε με το «τοπικό» τους όνομα.
const all = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
const textOf = (node) => all(node, 't').map((t) => t.textContent).join('');

/** «AB12» → 27 (στήλη, από 0) */
function columnIndex(ref) {
  let col = 0;
  for (const ch of ref.replace(/\d+/g, '')) col = col * 26 + (ch.charCodeAt(0) - 64);
  return col - 1;
}

export async function readXlsx(buffer) {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('Ο browser δεν υποστηρίζει ανάγνωση Excel. Ενημερώστε τον (Safari 16.4+, Chrome 80+).');
  }
  const entries = unzip(buffer);
  const shared = await readXml(entries, 'xl/sharedStrings.xml');
  const strings = shared ? all(shared, 'si').map(textOf) : [];

  const workbook = await readXml(entries, 'xl/workbook.xml');
  const rels = await readXml(entries, 'xl/_rels/workbook.xml.rels');
  if (!workbook || !rels) throw new Error('Δεν είναι έγκυρο αρχείο Excel (.xlsx)');
  const targets = new Map(all(rels, 'Relationship').map((r) => [r.getAttribute('Id'), r.getAttribute('Target')]));

  const sheets = [];
  for (const sheet of all(workbook, 'sheet')) {
    const rid = sheet.getAttribute('r:id') ?? sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    let target = targets.get(rid) ?? '';
    target = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const xml = await readXml(entries, target);
    if (!xml) continue;
    const rows = [];
    for (const row of all(xml, 'row')) {
      const r = Number(row.getAttribute('r')) - 1;
      const cells = [];
      for (const c of all(row, 'c')) {
        const ref = c.getAttribute('r');
        const type = c.getAttribute('t');
        const v = all(c, 'v')[0]?.textContent;
        let value = null;
        if (type === 's') value = strings[Number(v)] ?? '';
        else if (type === 'inlineStr') value = textOf(c);
        else if (type === 'str' || type === 'b' || type === 'e') value = v ?? '';
        else if (v != null && v !== '') value = Number(v);
        if (value !== null && value !== '') cells[ref ? columnIndex(ref) : cells.length] = value;
      }
      rows[Number.isFinite(r) ? r : rows.length] = cells;
    }
    sheets.push({ name: sheet.getAttribute('name'), rows: Array.from(rows, (r) => r ?? []) });
  }
  return sheets;
}
