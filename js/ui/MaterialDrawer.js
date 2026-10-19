// Υλικό μαθήματος από το OneDrive: επιλογή φακέλου, περιήγηση, προβολή αρχείων και
// αποθήκευση επιλεγμένων αρχείων στη συσκευή για χρήση χωρίς διαδίκτυο.
import { html, useEffect, useRef, useState } from '../vendor/preact-htm.js';
import * as onedrive from '../onedrive.js';
import * as store from '../store.js';
import { files as fileStore, listings } from '../db.js';
import { Icon, fileIcon } from './icons.js';
import { toast, useStore } from './common.js';
import { navigate } from '../router.js';

const LARGE_FILE = 80 * 1024 * 1024;

export function MaterialDrawer({ t, onClose }) {
  const { configured, account } = useStore(onedrive.onChange, onedrive.getStatus);
  const [picking, setPicking] = useState(false);

  let body;
  if (!configured) {
    body = html`
      ${t.folder
        ? html`<${FileBrowser} t=${t} />`
        : html`<div class="notice info"><${Icon} name="info" />
            <span>Για να βλέπετε τα αρχεία μέσα στην εφαρμογή, ρυθμίστε τη σύνδεση με το OneDrive.</span></div>
          <button class="btn primary" onClick=${() => navigate('/settings')}>Ρυθμίσεις OneDrive</button>`}
      <${FolderLink} t=${t} />`;
  } else if (!account && !t.folder) {
    body = html`
      <p>Συνδεθείτε με τον λογαριασμό Microsoft όπου βρίσκεται το υλικό σας.</p>
      <button class="btn primary" onClick=${() => onedrive.login()}><${Icon} name="cloud" /> Σύνδεση με OneDrive</button>`;
  } else if (!t.folder || picking) {
    body = html`<${FolderPicker} t=${t} onDone=${() => setPicking(false)} onCancel=${t.folder ? () => setPicking(false) : null} />`;
  } else {
    body = html`<${FileBrowser} t=${t} onChangeFolder=${account ? () => setPicking(true) : null} />`;
  }

  return html`
    <aside class="drawer" aria-label="Υλικό μαθήματος">
      <div class="drawer-head">
        <h2>Υλικό${t.folder ? ` — ${t.folder.name}` : ''}</h2>
        <button class="icon-btn" aria-label="Κλείσιμο" onClick=${onClose}><${Icon} name="close" /></button>
      </div>
      <div class="drawer-body">${body}</div>
    </aside>`;
}

/**
 * Εναλλακτική χωρίς σύνδεση λογαριασμού: ο σύνδεσμος του φακέλου (OneDrive → Κοινή χρήση → Αντιγραφή συνδέσμου)
 * ανοίγει τον φάκελο στην εφαρμογή ή τη σελίδα του OneDrive.
 */
function FolderLink({ t }) {
  const [editing, setEditing] = useState(!t.folderLink);
  const [value, setValue] = useState(t.folderLink ?? '');
  const valid = /^https:\/\/(1drv\.ms|onedrive\.live\.com|[\w-]+\.sharepoint\.com|[\w.-]*onedrive\.com)\//i.test(value.trim());
  const save = () => {
    store.updateTeaching(t.id, { folderLink: value.trim() || null });
    setEditing(false);
  };
  return html`
    <div class="panel" style="padding:14px;box-shadow:none">
      <strong>Σύνδεσμος φακέλου</strong>
      ${editing
        ? html`
          <p class="muted" style="font-size:.85rem">Στο OneDrive: δεξί κλικ στον φάκελο → Κοινή χρήση → Αντιγραφή συνδέσμου, και επικολλήστε τον εδώ.</p>
          <input type="text" value=${value} placeholder="https://1drv.ms/f/…" onInput=${(e) => setValue(e.target.value)}
            spellcheck="false" autocapitalize="off" />
          ${value && !valid && html`<span class="muted" style="font-size:.85rem;color:var(--skip)">Δεν μοιάζει με σύνδεσμο OneDrive.</span>`}
          <div class="row end">
            ${t.folderLink && html`<button class="btn small" onClick=${() => setEditing(false)}>Άκυρο</button>`}
            <button class="btn small primary" disabled=${Boolean(value) && !valid} onClick=${save}>Αποθήκευση</button>
          </div>`
        : html`
          <a class="btn primary" href=${t.folderLink} target="_blank" rel="noopener"><${Icon} name="external" /> Άνοιγμα φακέλου στο OneDrive</a>
          <button class="link-btn" style="align-self:flex-start" onClick=${() => setEditing(true)}>Αλλαγή συνδέσμου</button>`}
    </div>`;
}

/** Φόρτωση λίστας φακέλου: από OneDrive όταν υπάρχει σύνδεση, αλλιώς η τελευταία αποθηκευμένη. */
function useListing(folderId, reloadKey) {
  const [state, setState] = useState({ items: null, cached: false, error: null, fetchedAt: null });
  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, items: null, error: null }));
    (async () => {
      const cached = await listings.get(folderId);
      if (cached && !cancelled) setState({ items: cached.items, cached: true, error: null, fetchedAt: cached.fetchedAt });
      if (!navigator.onLine || !onedrive.getAccount()) {
        if (!cached && !cancelled) setState({ items: [], cached: true, error: 'Δεν υπάρχει αποθηκευμένη λίστα για αυτόν τον φάκελο.', fetchedAt: null });
        return;
      }
      try {
        const items = await onedrive.listChildren(folderId);
        const fetchedAt = Date.now();
        await listings.set(folderId, { items, fetchedAt });
        if (!cancelled) setState({ items, cached: false, error: null, fetchedAt });
        refreshPinned(items);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof onedrive.LoginRequiredError) {
          setState((s) => ({ ...s, items: s.items ?? [], error: 'login' }));
        } else {
          setState((s) => ({ ...s, items: s.items ?? [], cached: true, error: e.message }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [folderId, reloadKey]);
  return state;
}

/** Τα αρχεία που αποθηκεύτηκαν για εκτός σύνδεσης ενημερώνονται αν άλλαξαν στο OneDrive. */
async function refreshPinned(items) {
  for (const it of items) {
    if (it.isFolder) continue;
    const saved = await fileStore.get(it.id);
    if (saved && saved.modified !== it.modified) {
      try {
        const blob = await onedrive.download(it.id);
        await fileStore.set(it.id, { ...saved, blob, size: it.size, modified: it.modified, savedAt: Date.now() });
      } catch {
        /* θα ξαναδοκιμάσει την επόμενη φορά */
      }
    }
  }
}

function usePinned() {
  const [pinned, setPinned] = useState(new Set());
  const reload = () => fileStore.keys().then((k) => setPinned(new Set(k)));
  useEffect(() => { reload(); }, []);
  return [pinned, reload];
}

function FileBrowser({ t, onChangeFolder }) {
  const [path, setPath] = useState([{ id: t.folder.id, name: t.folder.name }]);
  const [reloadKey, setReloadKey] = useState(0);
  const [pinned, reloadPinned] = usePinned();
  const [busy, setBusy] = useState(new Set());
  const [viewing, setViewing] = useState(null);
  const current = path[path.length - 1];
  const { items, cached, error, fetchedAt } = useListing(current.id, reloadKey);

  useEffect(() => setPath([{ id: t.folder.id, name: t.folder.name }]), [t.folder.id]);

  const togglePin = async (it) => {
    if (pinned.has(it.id)) {
      await fileStore.del(it.id);
      reloadPinned();
      return;
    }
    if (!navigator.onLine) return toast('Χρειάζεται σύνδεση για να αποθηκευτεί το αρχείο.');
    if (it.size > LARGE_FILE && !confirm(`Το αρχείο είναι ${formatSize(it.size)}. Να αποθηκευτεί στη συσκευή;`)) return;
    setBusy((b) => new Set(b).add(it.id));
    try {
      const blob = await onedrive.download(it.id);
      await fileStore.set(it.id, { blob, name: it.name, mime: it.mime, size: it.size, modified: it.modified, savedAt: Date.now() });
      toast(`Το «${it.name}» είναι διαθέσιμο και χωρίς διαδίκτυο.`);
    } catch (e) {
      toast(`Δεν αποθηκεύτηκε: ${e.message}`);
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(it.id); return n; });
      reloadPinned();
    }
  };

  return html`
    <div class="crumbs">
      ${path.map((p, i) => html`
        ${i > 0 && '›'}
        <button onClick=${() => setPath(path.slice(0, i + 1))} disabled=${i === path.length - 1}>${p.name}</button>`)}
      <span class="grow"></span>
      ${navigator.onLine && onedrive.getAccount() && html`
        <button class="icon-btn" aria-label="Ανανέωση" onClick=${() => setReloadKey((k) => k + 1)}><${Icon} name="sync" /></button>`}
    </div>
    ${error === 'login'
      ? html`<div class="notice skip"><${Icon} name="warning" /><span>Η σύνδεση με το OneDrive έληξε.</span></div>
          <button class="btn primary" onClick=${() => onedrive.login()}>Νέα σύνδεση</button>`
      : error
        ? html`<div class="notice skip"><${Icon} name="warning" /><span>${error}</span></div>`
        : cached && html`<div class="notice plan"><${Icon} name="cloudOff" />
            <span>Χωρίς σύνδεση: εμφανίζεται η λίστα της ${new Date(fetchedAt).toLocaleDateString('el-GR')}.
              Ανοίγουν μόνο τα αρχεία με <b>✓</b>.</span></div>`}
    ${items === null
      ? html`<p class="muted">Φόρτωση…</p>`
      : items.length === 0 && !error
        ? html`<p class="muted">Ο φάκελος είναι άδειος.</p>`
        : html`
          <ul class="files">
            ${items.map((it) => {
              const ic = fileIcon(it);
              const isPinned = pinned.has(it.id);
              const available = it.isFolder || isPinned || (navigator.onLine && onedrive.getAccount());
              return html`
                <li key=${it.id} class=${available ? '' : 'unavailable'}>
                  <button class="open" onClick=${() => it.isFolder ? setPath([...path, { id: it.id, name: it.name }]) : setViewing(it)}>
                    <span style=${`color:${ic.color}`}><${Icon} name=${ic.name} /></span>
                    <span style="min-width:0">
                      <span class="name">${it.name}</span>
                      <span class="info">${it.isFolder ? `${it.childCount} στοιχεία` : `${formatSize(it.size)} · ${formatModified(it.modified)}`}</span>
                    </span>
                  </button>
                  ${!it.isFolder && html`
                    <button class=${`icon-btn pin ${isPinned ? 'on' : ''}`} disabled=${busy.has(it.id)}
                        title=${isPinned ? 'Αποθηκευμένο στη συσκευή — πατήστε για αφαίρεση' : 'Αποθήκευση για χρήση χωρίς διαδίκτυο'}
                        aria-label=${isPinned ? 'Αφαίρεση από τη συσκευή' : 'Αποθήκευση για χρήση χωρίς διαδίκτυο'}
                        onClick=${() => togglePin(it)}>
                      <${Icon} name=${busy.has(it.id) ? 'sync' : isPinned ? 'downloadDone' : 'download'} class=${busy.has(it.id) ? 'spin' : ''} />
                    </button>`}
                </li>`;
            })}
          </ul>`}
    ${onChangeFolder && html`<button class="link-btn" style="align-self:flex-start" onClick=${onChangeFolder}>Αλλαγή φακέλου…</button>`}
    ${viewing && html`<${Viewer} item=${viewing} onClose=${() => setViewing(null)} />`}`;
}

function FolderPicker({ t, onDone, onCancel }) {
  const [path, setPath] = useState([{ id: 'root', name: 'OneDrive' }]);
  const current = path[path.length - 1];
  const { items, error } = useListing(current.id, 0);
  const folders = (items ?? []).filter((it) => it.isFolder);

  const choose = async () => {
    let folder = { id: current.id, name: current.name, webUrl: null, path: '/' };
    if (current.id !== 'root') {
      const it = await onedrive.getItem(current.id);
      folder = { id: it.id, name: it.name, webUrl: it.webUrl, path: it.path };
    }
    await store.updateTeaching(t.id, { folder });
    toast(`Ο φάκελος «${folder.name}» συνδέθηκε με το μάθημα.`);
    onDone();
  };

  return html`
    <p style="margin:0">Επιλέξτε τον φάκελο του OneDrive με το υλικό του μαθήματος <b>${t.subject}</b>.</p>
    <div class="crumbs">
      ${path.map((p, i) => html`${i > 0 && '›'}
        <button onClick=${() => setPath(path.slice(0, i + 1))} disabled=${i === path.length - 1}>${p.name}</button>`)}
    </div>
    ${error === 'login'
      ? html`<button class="btn primary" onClick=${() => onedrive.login()}>Νέα σύνδεση με OneDrive</button>`
      : error && html`<div class="notice skip"><${Icon} name="warning" /><span>${error}</span></div>`}
    ${items === null
      ? html`<p class="muted">Φόρτωση…</p>`
      : html`
        <ul class="files">
          ${folders.length === 0 && html`<li class="muted" style="padding:8px">Δεν υπάρχουν υποφάκελοι.</li>`}
          ${folders.map((f) => html`
            <li key=${f.id}><button class="open" onClick=${() => setPath([...path, { id: f.id, name: f.name }])}>
              <span style="color:#f2b233"><${Icon} name="folder" /></span>
              <span class="name">${f.name}</span>
            </button></li>`)}
        </ul>`}
    <div class="row">
      ${onCancel && html`<button class="btn" onClick=${onCancel}>Άκυρο</button>`}
      <button class="btn primary grow" onClick=${choose} disabled=${!navigator.onLine}>
        <${Icon} name="check" /> Χρήση του «${current.name}»
      </button>
    </div>`;
}

// ---- Προβολή αρχείου ----

function kindOf(item) {
  const ext = item.name.split('.').pop().toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) return 'image';
  if (['mp4', 'webm', 'mov', 'm4v'].includes(ext)) return 'video';
  if (['mp3', 'm4a', 'wav', 'ogg'].includes(ext)) return 'audio';
  if (['txt', 'md', 'csv'].includes(ext)) return 'text';
  if (ext === 'pdf') return 'pdf';
  if (['doc', 'docx', 'ppt', 'pptx', 'pps', 'ppsx', 'xls', 'xlsx', 'odt', 'odp', 'ods', 'rtf'].includes(ext)) return 'office';
  return 'other';
}

const isDesktop = () => window.matchMedia('(pointer: fine) and (min-width: 900px)').matches;

function Viewer({ item, onClose }) {
  const [view, setView] = useState({ state: 'loading' });
  const root = useRef(null);
  const kind = kindOf(item);

  useEffect(() => {
    let url = null;
    let cancelled = false;
    (async () => {
      const saved = await fileStore.get(item.id);
      const online = navigator.onLine && onedrive.getAccount();
      try {
        // Έγγραφα Office (και PDF σε κινητά): η προεπισκόπηση του OneDrive τα δείχνει παντού.
        if (online && (kind === 'office' || (kind === 'pdf' && !isDesktop()))) {
          const preview = await onedrive.previewUrl(item.id).catch(() => null);
          if (preview && !cancelled) return setView({ state: 'iframe', src: preview, blob: saved?.blob ?? null });
        }
        let blob = saved?.blob ?? null;
        if (!blob && online && kind !== 'office' && kind !== 'other') blob = await onedrive.download(item.id);
        if (cancelled) return;
        if (!blob) {
          return setView({ state: 'message', text: online
            ? 'Αυτός ο τύπος αρχείου δεν προβάλλεται μέσα στην εφαρμογή.'
            : 'Το αρχείο δεν είναι αποθηκευμένο για χρήση χωρίς διαδίκτυο.' });
        }
        url = URL.createObjectURL(kind === 'pdf' ? new Blob([blob], { type: 'application/pdf' }) : blob);
        if (kind === 'text') return setView({ state: 'text', text: await blob.text(), url });
        if (kind === 'pdf' && isDesktop()) return setView({ state: 'iframe', src: url, blob });
        if (['image', 'video', 'audio'].includes(kind)) return setView({ state: kind, url });
        setView({ state: 'open', url });
      } catch (e) {
        if (!cancelled) setView({ state: 'message', text: `Δεν άνοιξε το αρχείο: ${e.message}` });
      }
    })();
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [item.id]);

  const canFullscreen = Boolean(document.fullscreenEnabled);
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : root.current?.requestFullscreen());

  let body;
  switch (view.state) {
    case 'loading': body = html`<div class="viewer-msg">Άνοιγμα…</div>`; break;
    case 'iframe': body = html`<iframe src=${view.src} title=${item.name} allow="fullscreen" />`; break;
    case 'image': body = html`<img src=${view.url} alt=${item.name} />`; break;
    case 'video': body = html`<video src=${view.url} controls autoplay />`; break;
    case 'audio': body = html`<audio src=${view.url} controls autoplay />`; break;
    case 'text': body = html`<pre>${view.text}</pre>`; break;
    case 'open':
      body = html`<div class="viewer-msg">
        <p>Το αρχείο ανοίγει με την εφαρμογή της συσκευής σας.</p>
        <a class="btn primary" href=${view.url} target="_blank" rel="noopener" download=${kind === 'pdf' ? undefined : item.name}>
          <${Icon} name="external" /> Άνοιγμα «${item.name}»</a>
      </div>`;
      break;
    default:
      body = html`<div class="viewer-msg"><p>${view.text}</p>
        ${navigator.onLine && item.webUrl && html`<a class="btn primary" href=${item.webUrl} target="_blank" rel="noopener">
          <${Icon} name="external" /> Άνοιγμα στο OneDrive</a>`}</div>`;
  }

  return html`
    <div class="viewer" ref=${root} role="dialog" aria-label=${item.name}>
      <header class="topbar">
        <button class="icon-btn" aria-label="Κλείσιμο" onClick=${onClose}><${Icon} name="close" /></button>
        <h1>${item.name}</h1>
        ${canFullscreen && html`<button class="icon-btn" aria-label="Πλήρης οθόνη" onClick=${fullscreen}><${Icon} name="fullscreen" /></button>`}
        ${navigator.onLine && item.webUrl && html`<a class="icon-btn" href=${item.webUrl} target="_blank" rel="noopener" title="Άνοιγμα στο OneDrive"><${Icon} name="external" /></a>`}
      </header>
      <div class="viewer-body">${body}</div>
    </div>`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}

function formatModified(iso) {
  return iso ? new Date(iso).toLocaleDateString('el-GR') : '';
}
