// Οδηγίες: εγκατάσταση ανά συσκευή, πρώτα βήματα, συχνές ερωτήσεις.
import { html, useEffect, useState } from '../vendor/preact-htm.js';
import { APP_VERSION } from '../config.js';
import { detectDevice, getInstallState, onInstallChange, promptInstall } from '../install.js';
import { Icon } from './icons.js';
import { toast, useStore } from './common.js';
import { back, navigate } from '../router.js';

const APP_URL = 'https://dimispa.github.io/antzenta/';

const PLATFORM_LABEL = { ios: 'iPhone / iPad', android: 'Android', desktop: 'Υπολογιστής' };

export function HelpView() {
  const device = detectDevice();
  const [platform, setPlatform] = useState(device.platform);
  const install = useStore(onInstallChange, getInstallState);
  useEffect(() => {
    if (location.hash.includes('start')) document.getElementById('start')?.scrollIntoView();
  }, []);

  return html`
    <header class="topbar">
      <button class="icon-btn" aria-label="Πίσω" onClick=${() => back('/')}><${Icon} name="back" /></button>
      <h1>Οδηγίες</h1>
    </header>
    <main class="page help">
      <nav class="panel toc" aria-label="Περιεχόμενα">
        <a href="#/help" onClick=${(e) => { e.preventDefault(); document.getElementById('install').scrollIntoView({ behavior: 'smooth' }); }}>1. Εγκατάσταση</a>
        <a href="#/help" onClick=${(e) => { e.preventDefault(); document.getElementById('start').scrollIntoView({ behavior: 'smooth' }); }}>2. Πρώτα βήματα</a>
        <a href="#/help" onClick=${(e) => { e.preventDefault(); document.getElementById('daily').scrollIntoView({ behavior: 'smooth' }); }}>3. Καθημερινή χρήση</a>
        <a href="#/help" onClick=${(e) => { e.preventDefault(); document.getElementById('faq').scrollIntoView({ behavior: 'smooth' }); }}>4. Συχνές ερωτήσεις</a>
      </nav>

      <section class="panel" id="install">
        <h2>1. Εγκατάσταση στη συσκευή</h2>
        ${install.installed
          ? html`<div class="notice done-note"><${Icon} name="check" /><span>Η εφαρμογή είναι ήδη εγκατεστημένη σε αυτή τη συσκευή.</span></div>`
          : html`<p>Η εφαρμογή ανοίγει από τη διεύθυνση <b>${APP_URL}</b>. Με την εγκατάσταση αποκτά εικονίδιο στην
              αρχική οθόνη, ανοίγει σε πλήρη οθόνη σαν κανονική εφαρμογή και <b>δουλεύει χωρίς διαδίκτυο</b>.</p>`}
        ${!install.installed && install.canPrompt && html`
          <button class="btn primary big" onClick=${async () => {
            if (await promptInstall()) toast('Η εφαρμογή εγκαταστάθηκε. Θα τη βρείτε στην αρχική οθόνη.');
          }}><${Icon} name="download" /> Εγκατάσταση τώρα</button>`}

        <div class="segmented" role="tablist" aria-label="Συσκευή">
          ${['ios', 'android', 'desktop'].map((p) => html`
            <button role="tab" aria-selected=${platform === p} class=${platform === p ? 'on' : ''} onClick=${() => setPlatform(p)}>
              ${PLATFORM_LABEL[p]}${p === device.platform ? ' (αυτή)' : ''}
            </button>`)}
        </div>

        ${platform === 'ios' && html`
          ${device.platform === 'ios' && device.browser !== 'safari' && html`
            <div class="notice plan"><${Icon} name="info" />
              <span>Ανοίξατε την εφαρμογή σε άλλον browser. Στο iPhone η εγκατάσταση γίνεται πιο σίγουρα από το <b>Safari</b>:
                αντιγράψτε τη διεύθυνση και ανοίξτε την εκεί.</span></div>`}
          <ol class="steps">
            <li>Ανοίξτε το <b>Safari</b> και πηγαίνετε στο <b>${APP_URL}</b>.</li>
            <li>Πατήστε το κουμπί <b>Κοινοποίηση</b> <span class="key"><${Icon} name="iosShare" /></span>
              (κάτω στο κέντρο στο iPhone, πάνω δεξιά στο iPad).</li>
            <li>Κυλήστε προς τα κάτω και πατήστε <b>Προσθήκη στην οθόνη Αφετηρίας</b> <span class="key"><${Icon} name="addBox" /></span>.</li>
            <li>Πατήστε <b>Προσθήκη</b> (πάνω δεξιά). Το εικονίδιο «Ατζέντα» εμφανίζεται στην αρχική οθόνη.</li>
            <li>Από εδώ και πέρα ανοίγετε την εφαρμογή <b>από το εικονίδιο</b>, όχι από το Safari.</li>
          </ol>
          <p class="muted">Σημείωση: στο iPhone/iPad η εφαρμογή από το εικονίδιο έχει δικά της δεδομένα, χωριστά από το Safari.
            Γι' αυτό συνδεθείτε στο OneDrive <b>μέσα από την εγκατεστημένη εφαρμογή</b>.</p>`}

        ${platform === 'android' && html`
          <ol class="steps">
            <li>Ανοίξτε το <b>Chrome</b> και πηγαίνετε στο <b>${APP_URL}</b>.</li>
            <li>Αν εμφανιστεί κάτω το μήνυμα <b>«Εγκατάσταση εφαρμογής»</b> ή πιο πάνω το κουμπί <b>«Εγκατάσταση τώρα»</b>, πατήστε το.</li>
            <li>Αλλιώς πατήστε το μενού <span class="key"><${Icon} name="more" /></span> (πάνω δεξιά) →
              <b>Εγκατάσταση εφαρμογής</b> (ή <b>Προσθήκη στην αρχική οθόνη</b> → <b>Εγκατάσταση</b>).</li>
            <li>Επιβεβαιώστε με <b>Εγκατάσταση</b>. Η «Ατζέντα» εμφανίζεται στην αρχική οθόνη και στη λίστα εφαρμογών.</li>
          </ol>
          <p class="muted"><b>Samsung Internet:</b> μενού ≡ → <i>Προσθήκη σελίδας σε</i> → <i>Αρχική οθόνη</i>.
            <b>Xiaomi (HyperOS/MIUI):</b> αν το εικονίδιο δεν εμφανιστεί, επιτρέψτε στο Chrome την «Προσθήκη συντομεύσεων
            στην αρχική οθόνη» (Ρυθμίσεις → Εφαρμογές → Chrome → Άλλες άδειες).</p>`}

        ${platform === 'desktop' && html`
          <ol class="steps">
            <li>Ανοίξτε το <b>${APP_URL}</b> σε <b>Chrome</b> ή <b>Edge</b>.</li>
            <li>Πατήστε το κουμπί <b>«Εγκατάσταση τώρα»</b> πιο πάνω (αν εμφανίζεται) ή το εικονίδιο εγκατάστασης
              <span class="key"><${Icon} name="download" /></span> στη γραμμή διευθύνσεων (δεξιά).</li>
            <li>Επιβεβαιώστε με <b>Εγκατάσταση</b>. Η εφαρμογή ανοίγει σε δικό της παράθυρο και μπαίνει στο μενού Έναρξη
              (Windows) ή στις Εφαρμογές (Mac).</li>
          </ol>
          <p class="muted">Σε Safari (Mac): μενού <i>Αρχείο</i> → <i>Προσθήκη στο Dock</i>. Στον Firefox δεν υποστηρίζεται
            εγκατάσταση· η εφαρμογή δουλεύει κανονικά ως σελίδα.</p>`}
      </section>

      <section class="panel" id="start">
        <h2>2. Πρώτα βήματα (μία φορά)</h2>
        <ol class="steps">
          <li><b>Σύνδεση με OneDrive</b> — <a href="#/settings" onClick=${(e) => { e.preventDefault(); navigate('/settings'); }}>⚙ Ρυθμίσεις</a>${' '}
            → «Σύνδεση με OneDrive» → λογαριασμός Microsoft 365 → <i>Αποδοχή</i>. Χρειάζεται για το υλικό των μαθημάτων και για
            να βλέπετε τα ίδια δεδομένα σε όλες τις συσκευές. Κάντε τη σύνδεση <b>σε κάθε συσκευή</b>.</li>
          <li><b>Μαθητές</b> — στο myschool: <i>Αναφορές → Μαθητές → Λίστα μαθητών</i> → αποθήκευση ως Excel. Στην εφαρμογή:
            ⚙ Ρυθμίσεις → <i>Μαθητές → Εισαγωγή από myschool</i> → τσεκάρετε τα τμήματα που διδάσκετε. Αρκεί να γίνει σε μία
            συσκευή· οι άλλες τα παίρνουν με τον συγχρονισμό.</li>
          <li><b>Μαθήματα</b> — στην αρχική, επιλέξτε τμήμα (αριστερά) → <i>+ Μάθημα</i> για κάθε μάθημα που διδάσκετε εκεί.</li>
          <li><b>Υλικό</b> — μέσα σε ένα μάθημα → <i>Υλικό</i> → επιλέξτε τον φάκελο του μαθήματος στο OneDrive.</li>
          <li><b>Εξεταζόμενα μαθήματα</b> — Βαθμολόγιο → ⋮ → <i>Ρυθμίσεις βαθμολογίου</i> → «Εξεταζόμενο». Εκεί αλλάζετε και τα
            βάρη των κριτηρίων.</li>
        </ol>
      </section>

      <section class="panel" id="daily">
        <h2>3. Καθημερινή χρήση</h2>
        <h3>Μάθημα (τρεις στήλες)</h3>
        <ul>
          <li><b>1 · Την προηγούμενη φορά:</b> τι έγινε στο τελευταίο μάθημα που πραγματοποιήθηκε.</li>
          <li><b>2 · Προγραμματισμός:</b> γράψτε τι θα κάνετε· αποθηκεύεται αυτόματα.</li>
          <li><b>3 · Τι έκανα τελικά:</b> διορθώστε αν χρειάζεται και πατήστε <i>«Το μάθημα έγινε»</i> — η στήλη 1 ενημερώνεται.
            Αν δεν έγινε (έκτακτος σύλλογος, εκδρομή, άλλος εκπαιδευτικός…) πατήστε <i>«Δεν πραγματοποιήθηκε»</i> — ο
            προγραμματισμός μένει για την επόμενη φορά. Υπάρχει πάντα <i>«Αναίρεση»</i>.</li>
        </ul>
        <h3>Βαθμολόγιο</h3>
        <ul>
          <li><i>+ Εργασία / + Τεστ / + Διαγώνισμα</i> → βαθμοί με Enter από μαθητή σε μαθητή. Στις εργασίες ✓ εμπρόθεσμα,
            ⏱ εκπρόθεσμα, ✗ δεν παραδόθηκε.</li>
          <li><b>Αναλυτικά:</b> κάθε αξιολόγηση σε στήλη με Μ.Ο. ανά κατηγορία. <b>Διόρθωση</b>: γράψτε στο κελί·
            <b>διαγραφή</b>: σβήστε το κελί.</li>
          <li>Η συμμετοχή μπαίνει στη στήλη «Συμμ.» (ένας βαθμός ανά τετράμηνο). Οι γραπτές στον «Ετήσιο».</li>
          <li>Πατώντας το <b>όνομα ενός μαθητή</b> ανοίγει η καρτέλα του: όλοι οι βαθμοί του και παρατηρήσεις.</li>
          <li>⋮ → <i>Εξαγωγή σε Excel</i> για να περάσετε τους βαθμούς στο myschool.</li>
        </ul>
        <h3>Υλικό</h3>
        <ul>
          <li>Πατήστε ένα αρχείο για προβολή (και πλήρη οθόνη για τον πίνακα της τάξης).</li>
          <li>Το <span class="key"><${Icon} name="download" /></span> κρατά το αρχείο στη συσκευή για χρήση <b>χωρίς διαδίκτυο</b>.</li>
        </ul>
      </section>

      <section class="panel" id="faq">
        <h2>4. Συχνές ερωτήσεις</h2>
        <details><summary>Δουλεύει χωρίς διαδίκτυο;</summary>
          <p>Ναι. Όλα αποθηκεύονται στη συσκευή. Χωρίς διαδίκτυο δεν φαίνονται μόνο τα αρχεία του OneDrive που δεν έχετε
            αποθηκεύσει με το ⬇. Οι αλλαγές συγχρονίζονται μόλις βρεθεί σύνδεση.</p></details>
        <details><summary>Πού αποθηκεύονται οι μαθητές και οι βαθμοί; Τα βλέπει κάποιος άλλος;</summary>
          <p>Μόνο στις συσκευές σας και στο δικό σας OneDrive (φάκελος <i>Εφαρμογές → Ατζέντα Εκπαιδευτικού</i>).
            Δεν ανεβαίνουν πουθενά αλλού — ούτε στο GitHub, όπου βρίσκεται μόνο ο κώδικας της εφαρμογής.</p></details>
        <details><summary>Πώς παίρνω τη νέα έκδοση;</summary>
          <p>Αυτόματα: όταν ανοίξετε την εφαρμογή με διαδίκτυο, ενημερώνεται μόνη της. Αν βγει νέα έκδοση ενώ τη
            χρησιμοποιείτε, εμφανίζεται «Ανανέωση». Η έκδοση φαίνεται στο κάτω μέρος των Ρυθμίσεων.</p></details>
        <details><summary>Άλλαξα κινητό ή tablet. Θα χάσω τα δεδομένα;</summary>
          <p>Όχι, αν έχετε συνδεθεί στο OneDrive: εγκαταστήστε την εφαρμογή στη νέα συσκευή, συνδεθείτε, και τα δεδομένα
            έρχονται μόνα τους. Για επιπλέον ασφάλεια: Ρυθμίσεις → <i>Εξαγωγή αρχείου</i> κατά διαστήματα.</p></details>
        <details><summary>Αν απεγκαταστήσω την εφαρμογή;</summary>
          <p>Σβήνουν τα δεδομένα αυτής της συσκευής. Ό,τι έχει συγχρονιστεί στο OneDrive μένει και επιστρέφει με νέα
            εγκατάσταση και σύνδεση.</p></details>
        <details><summary>Εμφανίζεται «Χρειάζεται σύνδεση» ή σφάλμα συγχρονισμού.</summary>
          <p>Ρυθμίσεις → <i>Νέα σύνδεση</i> ή <i>Συγχρονισμός τώρα</i>. Αν επιμένει, στείλτε στιγμιότυπο με το μήνυμα.</p></details>
      </section>

      <p class="muted" style="text-align:center;font-size:.85rem">Ατζέντα Εκπαιδευτικού · έκδοση ${APP_VERSION}</p>
    </main>`;
}

/** Μήνυμα στην αρχική όσο η εφαρμογή δεν είναι εγκατεστημένη (κλείνει μόνιμα). */
export function InstallBanner() {
  const install = useStore(onInstallChange, getInstallState);
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem('atzenta.hideInstall') === '1';
    } catch {
      return false;
    }
  });
  if (install.installed || hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem('atzenta.hideInstall', '1');
    } catch {
      /* χωρίς αποθήκευση προτίμησης */
    }
  };
  return html`
    <div class="install-banner" role="note">
      <${Icon} name="download" />
      <span class="grow">Εγκαταστήστε την εφαρμογή για να ανοίγει από την αρχική οθόνη και χωρίς διαδίκτυο.</span>
      ${install.canPrompt
        ? html`<button class="btn small primary" onClick=${() => promptInstall()}>Εγκατάσταση</button>`
        : html`<button class="btn small primary" onClick=${() => navigate('/help')}>Οδηγίες</button>`}
      <button class="icon-btn" aria-label="Απόκρυψη" onClick=${dismiss}><${Icon} name="close" /></button>
    </div>`;
}
