async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

// Redirects to login if there's no staff session at all. Returns
// { staff, counter } on success (counter is null if none chosen yet).
async function requireStaffAuth() {
  try {
    return await api('/api/staff/me');
  } catch (err) {
    window.location.href = '/staff/login.html';
    return null;
  }
}

async function staffLogout() {
  await api('/api/staff/logout', { method: 'POST' });
  window.location.href = '/staff/login.html';
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str == null ? '' : str;
  return div.innerHTML;
}
