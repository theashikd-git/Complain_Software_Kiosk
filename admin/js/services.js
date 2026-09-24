(async function init() {
  const admin = await requireAuth();
  if (!admin) return;
  renderSidebar('services');

  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  const tbody = document.getElementById('services-tbody');
  const form = document.getElementById('service-form');
  const formError = document.getElementById('form-error');

  async function loadServices() {
    tbody.innerHTML = '<tr><td colspan="3" class="muted">Loading…</td></tr>';
    try {
      const services = await api('/api/admin/services');
      if (!services.length) {
        tbody.innerHTML = '<tr><td colspan="3" class="muted">No services yet. Add one above.</td></tr>';
        return;
      }
      tbody.innerHTML = services.map(rowHtml).join('');
      attachRowHandlers();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="3" class="muted">Could not load services: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function rowHtml(s) {
    return `
      <tr data-id="${s.id}">
        <td>${escapeHtml(s.service_name)}</td>
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
        const service_name = tr.children[0].textContent.trim();
        try {
          await api(`/api/admin/services/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ service_name, is_active: !isActive })
          });
          loadServices();
        } catch (err) {
          alert(err.message);
        }
      });
      tr.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this service? This cannot be undone.')) return;
        try {
          await api(`/api/admin/services/${id}`, { method: 'DELETE' });
          loadServices();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');
    const service_name = document.getElementById('service_name').value.trim();
    try {
      await api('/api/admin/services', {
        method: 'POST',
        body: JSON.stringify({ service_name })
      });
      form.reset();
      loadServices();
    } catch (err) {
      formError.textContent = err.message;
      formError.classList.remove('hidden');
    }
  });

  loadServices();
})();
