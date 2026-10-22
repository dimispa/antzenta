// Πλοήγηση με #hash: #/ (αρχική), #/c/<τμήμα>, #/t/<μάθημα>[/grades], #/settings
const listeners = new Set();

export function currentRoute() {
  const path = location.hash.replace(/^#/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'c') return { name: 'home', classId: parts[1] };
  if (parts[0] === 't') return { name: 'lesson', teachingId: parts[1], tab: parts[2] === 'grades' ? 'grades' : 'lesson' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'home' };
}

// Το «βάθος» μέσα στην εφαρμογή, ώστε το «Πίσω» να μη βγαίνει έξω από αυτή
// όταν ανοίξατε κατευθείαν μια σελίδα (π.χ. από σελιδοδείκτη).
const depth = () => history.state?.depth ?? 0;

export function navigate(path, { replace = false } = {}) {
  const url = `#${path}`;
  if (replace) history.replaceState({ depth: depth() }, '', url);
  else history.pushState({ depth: depth() + 1 }, '', url);
  emit();
}

export function back(fallback = '/') {
  if (depth() > 0) history.back();
  else navigate(fallback, { replace: true });
}

export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  for (const fn of listeners) fn(currentRoute());
}

window.addEventListener('popstate', emit);
window.addEventListener('hashchange', emit);
