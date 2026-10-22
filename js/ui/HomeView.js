// Αρχική: τα τμήματα σε στήλη αριστερά, τα μαθήματα του επιλεγμένου τμήματος δεξιά.
import { html, useState } from '../vendor/preact-htm.js';
import * as store from '../store.js';
import { COLORS, alive, formatDate, lastDone, relativeDays, teachingsOf } from '../model.js';
import { Icon } from './icons.js';
import { ConfirmDialog, Menu, SyncBadge, TeachingDialog, TextDialog } from './common.js';
import { navigate } from '../router.js';
import { StudentsDialog } from './StudentsUI.js';
import { studentsOf } from '../grading.js';

export function HomeView({ data, classId }) {
  const classes = alive(data.classes).sort((a, b) => a.order - b.order);
  const selected = classes.find((c) => c.id === classId) ?? classes[0] ?? null;
  const [dialog, setDialog] = useState(null);

  const addClass = () =>
    setDialog(html`<${TextDialog} title="Νέο τμήμα" label="Όνομα τμήματος" placeholder="π.χ. Α1"
      confirm="Προσθήκη" onSave=${(name) => navigate(`/c/${store.addClass(name).id}`)} onClose=${() => setDialog(null)} />`);

  return html`
    <header class="topbar">
      <h1>Ατζέντα Εκπαιδευτικού</h1>
      <${SyncBadge} onClick=${() => navigate('/settings')} />
      <button class="icon-btn" title="Ρυθμίσεις" aria-label="Ρυθμίσεις" onClick=${() => navigate('/settings')}>
        <${Icon} name="settings" />
      </button>
    </header>
    ${classes.length === 0
      ? html`<${Welcome} onAdd=${addClass} />`
      : html`
        <main class="home">
          <nav class="classes" aria-label="Τμήματα">
            <h2>Τμήματα</h2>
            ${classes.map((c) => html`
              <button class=${`class-item ${c.id === selected?.id ? 'active' : ''}`}
                  aria-current=${c.id === selected?.id ? 'true' : undefined}
                  onClick=${() => navigate(`/c/${c.id}`)}>
                <span>${c.name}</span>
                <span class="count">${teachingsOf(data.teachings, c.id).length}</span>
              </button>`)}
            <button class="btn small add" onClick=${addClass}><${Icon} name="add" /> Τμήμα</button>
          </nav>
          ${selected && html`<${ClassSubjects} data=${data} cls=${selected} classes=${classes} setDialog=${setDialog} />`}
        </main>`}
    ${dialog}`;
}

function ClassSubjects({ data, cls, classes, setDialog }) {
  const teachings = teachingsOf(data.teachings, cls.id);
  const close = () => setDialog(null);
  const index = classes.findIndex((c) => c.id === cls.id);

  const addSubject = () =>
    setDialog(html`<${TeachingDialog} title=${`Νέο μάθημα στο ${cls.name}`}
      initial=${{ color: COLORS[teachings.length % COLORS.length] }} onSave=${({ subject, color }) => store.addTeaching(cls.id, subject, color)} onClose=${close} />`);

  return html`
    <section class="subjects">
      <div class="subjects-head">
        <h2>${cls.name}</h2>
        <${Menu} label="Επιλογές τμήματος" items=${[
          { label: 'Μετονομασία', icon: 'edit', onClick: () => setDialog(html`<${TextDialog} title="Μετονομασία τμήματος"
              label="Όνομα τμήματος" initial=${cls.name} onSave=${(name) => store.renameClass(cls.id, name)} onClose=${close} />`) },
          { label: `Μαθητές (${studentsOf(data, cls.id).length})`, icon: 'school', onClick: () => setDialog(html`<${StudentsDialog}
              cls=${cls} onClose=${close} />`) },
          { label: 'Μετακίνηση πάνω', icon: 'up', disabled: index === 0, onClick: () => store.moveClass(cls.id, -1) },
          { label: 'Μετακίνηση κάτω', icon: 'down', disabled: index === classes.length - 1, onClick: () => store.moveClass(cls.id, 1) },
          { label: 'Διαγραφή', icon: 'trash', danger: true, onClick: () => setDialog(html`<${ConfirmDialog} title="Διαγραφή τμήματος"
              text=${`Θα διαγραφεί το τμήμα ${cls.name} με όλα τα μαθήματα και το ιστορικό τους.`}
              onConfirm=${() => { store.deleteClass(cls.id); navigate('/'); }} onClose=${close} />`) },
        ]} />
      </div>
      <div class="cards">
        ${teachings.map((t) => html`<${SubjectCard} key=${t.id} data=${data} t=${t} />`)}
        <button class="card add-card" onClick=${addSubject}><${Icon} name="add" /> Μάθημα</button>
      </div>
    </section>`;
}

function SubjectCard({ data, t }) {
  const last = lastDone(data.entries, t.id);
  return html`
    <button class="card" style=${`--accent:${t.color}`} onClick=${() => navigate(`/t/${t.id}`)}>
      <h3>${t.subject}
        ${(t.folder || t.folderLink) && html`<span class="folder-flag" title=${t.folder ? `Υλικό: ${t.folder.name}` : 'Υλικό στο OneDrive'}><${Icon} name="folder" /></span>`}
      </h3>
      <span class="line">
        <b>Τελευταίο: </b>
        ${last ? `${formatDate(last.date)} (${relativeDays(last.date)}) — ${last.actual || '…'}` : 'δεν έχει γίνει ακόμη μάθημα'}
      </span>
      <span class="line"><b>Επόμενο: </b>${t.plan?.trim() || 'δεν έχει προγραμματιστεί'}</span>
    </button>`;
}

function Welcome({ onAdd }) {
  return html`
    <main class="empty">
      <${Icon} name="school" />
      <h2>Καλώς ήρθατε</h2>
      <p>Ξεκινήστε προσθέτοντας ένα τμήμα (π.χ. Α1) και μετά τα μαθήματα που διδάσκετε σε αυτό.</p>
      <button class="btn primary" onClick=${onAdd}><${Icon} name="add" /> Νέο τμήμα</button>
    </main>`;
}
