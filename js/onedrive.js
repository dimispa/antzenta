// Σύνδεση με OneDrive (λογαριασμός Microsoft) μέσω MSAL και Microsoft Graph.
// Χρησιμοποιείται για: (α) τους φακέλους υλικού κάθε μαθήματος, (β) τον συγχρονισμό των δεδομένων.

const GRAPH = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['Files.ReadWrite', 'User.Read'];
const DATA_FILE = 'atzenta-data.json';

let pca = null;
let account = null;
/** Το id του φακέλου της εφαρμογής στο OneDrive (βλ. dataPath). */
let appFolderId = null;
const listeners = new Set();

export class NotSignedInError extends Error {
  constructor() {
    super('Δεν έχει γίνει σύνδεση με OneDrive');
  }
}

export class LoginRequiredError extends Error {
  constructor() {
    super('Χρειάζεται νέα σύνδεση με OneDrive');
  }
}

export class GraphError extends Error {
  constructor(status, body, action = '') {
    let code = '';
    let detail = '';
    try {
      const err = JSON.parse(body).error;
      code = err?.code ?? '';
      detail = err?.message ?? '';
    } catch {
      /* όχι JSON */
    }
    super(`OneDrive${action ? ` (${action})` : ''}: σφάλμα ${status}${code ? ` ${code}` : ''}${detail ? ` — ${detail}` : ''}`);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

/** Η διεύθυνση επιστροφής που πρέπει να δηλωθεί στην εγγραφή της εφαρμογής στη Microsoft. */
export function redirectUri() {
  return location.origin + location.pathname.replace(/index\.html$/, '');
}

/** Κατάσταση για την οθόνη: { configured, account } — νέο αντικείμενο σε κάθε αλλαγή. */
let status = { configured: false, account: null };

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getStatus() {
  return status;
}

function setAccount(a) {
  account = a ?? null;
  appFolderId = null;
  status = { configured: pca !== null, account };
  for (const fn of listeners) fn(status);
}

export function getAccount() {
  return account;
}

export function isConfigured() {
  return pca !== null;
}

/**
 * Ξεκινά το MSAL. Αν η σελίδα φορτώθηκε μετά από σύνδεση (redirect), ολοκληρώνει τη σύνδεση.
 * Δουλεύει και χωρίς διαδίκτυο: απλώς διαβάζει τον λογαριασμό από την προσωρινή μνήμη.
 */
export async function init(clientId) {
  pca = null;
  if (!clientId || !window.msal) {
    setAccount(null);
    return null;
  }
  const instance = new window.msal.PublicClientApplication({
    auth: {
      clientId,
      authority: 'https://login.microsoftonline.com/common',
      redirectUri: redirectUri(),
      postLogoutRedirectUri: redirectUri(),
      navigateToLoginRequestUrl: false,
    },
    cache: { cacheLocation: 'localStorage' },
  });
  await instance.initialize();
  const result = await instance.handleRedirectPromise();
  pca = instance;
  const a = result?.account ?? instance.getActiveAccount() ?? instance.getAllAccounts()[0] ?? null;
  if (a) instance.setActiveAccount(a);
  setAccount(a);
  return a;
}

/** Μεταφέρει στη σελίδα σύνδεσης της Microsoft (και επιστρέφει εδώ). */
export async function login() {
  if (!pca) throw new NotSignedInError();
  await pca.loginRedirect({ scopes: SCOPES, prompt: 'select_account' });
}

/** Αποσύνδεση μόνο από αυτή την εφαρμογή (ο λογαριασμός Microsoft μένει συνδεδεμένος αλλού). */
export async function logout() {
  if (!pca || !account) return;
  await pca.logoutRedirect({ account, onRedirectNavigate: () => false });
  setAccount(null);
}

async function token() {
  if (!pca || !account) throw new NotSignedInError();
  try {
    const r = await pca.acquireTokenSilent({ scopes: SCOPES, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof window.msal.InteractionRequiredAuthError) throw new LoginRequiredError();
    throw e;
  }
}

async function graph(path, options = {}) {
  const t = await token();
  const res = await fetch(path.startsWith('http') ? path : GRAPH + path, {
    ...options,
    headers: { Authorization: `Bearer ${t}`, ...(options.headers ?? {}) },
  });
  if (!res.ok && !(options.accept ?? []).includes(res.status)) {
    throw new GraphError(res.status, await res.text().catch(() => ''), options.action);
  }
  return res;
}

async function graphJson(path, options) {
  return (await graph(path, options)).json();
}

// ---- Φάκελοι και αρχεία ----

const ITEM_FIELDS = 'id,name,size,folder,file,lastModifiedDateTime,webUrl,parentReference';

/** Τα περιεχόμενα ενός φακέλου (ή του αρχικού φακέλου με folderId = 'root'). */
export async function listChildren(folderId) {
  const base = folderId === 'root' ? '/me/drive/root' : `/me/drive/items/${encodeURIComponent(folderId)}`;
  let url = `${base}/children?$select=${ITEM_FIELDS}&$top=200`;
  const items = [];
  while (url) {
    const page = await graphJson(url, { action: 'λίστα αρχείων' });
    items.push(...page.value);
    url = page['@odata.nextLink'] ?? null;
  }
  return items.map(simplify).sort((a, b) => (b.isFolder - a.isFolder) || a.name.localeCompare(b.name, 'el'));
}

export async function getItem(itemId) {
  return simplify(await graphJson(`/me/drive/items/${encodeURIComponent(itemId)}?$select=${ITEM_FIELDS}`));
}

function simplify(it) {
  return {
    id: it.id,
    name: it.name,
    isFolder: Boolean(it.folder),
    childCount: it.folder?.childCount ?? 0,
    size: it.size ?? 0,
    mime: it.file?.mimeType ?? '',
    modified: it.lastModifiedDateTime,
    webUrl: it.webUrl,
    path: it.parentReference?.path ? `${decodeURIComponent(it.parentReference.path.replace(/^\/drive\/root:?/, ''))}/${it.name}` : `/${it.name}`,
  };
}

/** Κατεβάζει το περιεχόμενο ενός αρχείου (για προβολή ή αποθήκευση εκτός σύνδεσης). */
export async function download(itemId) {
  // Το /content κάνει ανακατεύθυνση που μπλοκάρεται από CORS· η downloadUrl είναι ήδη εξουσιοδοτημένη.
  const meta = await graphJson(`/me/drive/items/${encodeURIComponent(itemId)}?$select=id,@microsoft.graph.downloadUrl`);
  const res = await fetch(meta['@microsoft.graph.downloadUrl']);
  if (!res.ok) throw new GraphError(res.status, '');
  return res.blob();
}

/** Διεύθυνση προεπισκόπησης για έγγραφα Office (Word, PowerPoint, Excel) — μόνο με σύνδεση. */
export async function previewUrl(itemId) {
  const r = await graphJson(`/me/drive/items/${encodeURIComponent(itemId)}/preview`, { method: 'POST' });
  return r.getUrl ?? null;
}

export async function profile() {
  return graphJson('/me?$select=displayName,userPrincipalName,mail');
}

// ---- Αρχείο δεδομένων συγχρονισμού (στον ειδικό φάκελο της εφαρμογής στο OneDrive) ----
// Ο φάκελος είναι «OneDrive/Εφαρμογές/Ατζέντα Εκπαιδευτικού». Τον ζητάμε πρώτα ρητά, γιατί σε νέο
// λογαριασμό δεν υπάρχει ακόμη και το OneDrive τον δημιουργεί μόνο έτσι — αλλιώς η εγγραφή αρχείου
// μέσα του αποτυγχάνει με 404.


async function dataPath() {
  if (!appFolderId) {
    appFolderId = (await graphJson('/me/drive/special/approot?$select=id', { action: 'φάκελος εφαρμογής' })).id;
  }
  return `/me/drive/items/${encodeURIComponent(appFolderId)}:/${DATA_FILE}:`;
}

/** { data, etag } ή null αν δεν υπάρχει ακόμη αρχείο. */
export async function readDataFile() {
  const path = await dataPath();
  const res = await graph(`${path}?$select=id,eTag,@microsoft.graph.downloadUrl`, { accept: [404], action: 'ανάγνωση δεδομένων' });
  if (res.status === 404) return null;
  const meta = await res.json();
  const content = await fetch(meta['@microsoft.graph.downloadUrl'], { cache: 'no-store' });
  if (!content.ok) throw new GraphError(content.status, '', 'λήψη δεδομένων');
  return { data: await content.json(), etag: meta.eTag };
}

/**
 * Ανεβάζει τα δεδομένα. Με [etag] αποτυγχάνει (412) αν άλλη συσκευή έγραψε στο μεταξύ·
 * χωρίς etag αποτυγχάνει (409) αν το αρχείο δημιουργήθηκε στο μεταξύ.
 * Επιστρέφει { ok, etag } ή { conflict: true }.
 */
export async function writeDataFile(data, etag) {
  const path = await dataPath();
  const url = etag ? `${path}/content` : `${path}/content?@microsoft.graph.conflictBehavior=fail`;
  const res = await graph(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...(etag ? { 'If-Match': etag } : {}) },
    body: JSON.stringify(data),
    accept: [409, 412],
    action: 'αποθήκευση δεδομένων',
  });
  if (res.status === 409 || res.status === 412) return { conflict: true };
  return { ok: true, etag: (await res.json()).eTag };
}
