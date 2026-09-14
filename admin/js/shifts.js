(async function init() {
  const admin = await requireAuth();
  if (!admin) return;
  renderSidebar('shifts');

  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  const tbody = document.getElementById('shifts-tbody');
  const form = document.getElementById('shift-form');
  const formError = document.getElementById('form-error');

  async function loadShifts() {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
    try {
      const shifts = await api('/api/admin/shifts');
      if (!shifts.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">No shifts yet. Add one above.</td></tr>';
        return;
      }
      tbody.innerHTML = shifts.map(rowHtml).join('');
      attachRowHandlers();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Could not load shifts: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function rowHtml(s) {
    return `
      <tr data-id="${s.id}" data-start="${s.start_time}" data-end="${s.end_time}">
        <td>${escapeHtml(s.shift_name)}</td>
        <td>${s.shift_code ? `<span class="badge">${escapeHtml(s.shift_code)}</span>` : '<span class="muted">—</span>'}</td>
        <td>${escapeHtml(formatClock(s.start_time))}</td>
        <td>${escapeHtml(formatClock(s.end_time))}</td>
        <td>
          <span class="status-dot ${s.is_active ? 'status-active' : 'status-inactive'}"></span>
          ${s.is_active ? 'Active' : 'Inactive'}
        </td>
        <td>
          <button class="btn btn-outline btn-sm toggle-btn">${s.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-danger btn-sm delete-btn">Delete</button>
        </td>
      </tr>
    `;
  }

  function attachRowHandlers() {
    tbody.querySelectorAll('tr').forEach((tr) => {
      const id = tr.dataset.id;
      tr.querySelector('.toggle-btn').addEventListener('click', async () => {
        const isActive = tr.querySelector('.status-active') !== null;
        const shift_name = tr.children[0].textContent.trim();
        try {
          await api(`/api/admin/shifts/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              shift_name,
              start_time: tr.dataset.start,
              end_time: tr.dataset.end,
              is_active: !isActive
            })
          });
          loadShifts();
        } catch (err) {
          alert(err.message);
        }
      });
      tr.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this shift? This cannot be undone.')) return;
        try {
          await api(`/api/admin/shifts/${id}`, { method: 'DELETE' });
          loadShifts();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');
    const shift_name = document.getElementById('shift_name').value.trim();
    const start_time = document.getElementById('start_time').value;
    const end_time = document.getElementById('end_time').value;
    const shift_code = document.getElementById('shift_code').value.trim();
    try {
      await api('/api/admin/shifts', {
        method: 'POST',
        body: JSON.stringify({ shift_name, start_time, end_time, shift_code })
      });
      form.reset();
      loadShifts();
    } catch (err) {
      formError.textContent = err.message;
      formError.classList.remove('hidden');
    }
  });

  loadShifts();
})();
