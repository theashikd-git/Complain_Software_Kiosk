// Shared helpers used by every admin page.

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

// Every protected page calls this first. Redirects to login if the
// session isn't valid, and returns the admin object if it is.
async function requireAuth() {
  try {
    const data = await api('/api/admin/me');
    return data.admin;
  } catch (err) {
    window.location.href = '/admin/login.html';
    return null;
  }
}

async function logout() {
  await api('/api/admin/logout', { method: 'POST' });
  window.location.href = '/admin/login.html';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

// Formats a Postgres TIME value ("08:00:00" or "08:00") as "8:00 AM".
function formatClock(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

// Renders the sidebar nav and highlights the current page.
function renderSidebar(activePage) {
  const items = [
    { key: 'dashboard', label: 'Dashboard', href: '/admin/dashboard.html' },
    { key: 'counters', label: 'Counters', href: '/admin/counters.html' },
    { key: 'employees', label: 'Employees', href: '/admin/employees.html' },
    { key: 'shifts', label: 'Shifts', href: '/admin/shifts.html' },
    { key: 'roster', label: 'Roster', href: '/admin/roster.html' },
    { key: 'reports', label: 'Reports', href: '/admin/reports.html' }
  ];
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;
  nav.innerHTML = items
    .map(
      (it) =>
        `<a href="${it.href}" class="${it.key === activePage ? 'active' : ''}">${it.label}</a>`
    )
    .join('');
}
