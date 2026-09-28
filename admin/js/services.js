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
  const submitBtn = document.getElementById('service-submit-btn');
  const cancelEditBtn = document.getElementById('cancel-service-edit-btn');
  const nameInput = document.getElementById('service_name');
  const nameBnInput = document.getElementById('service_name_bn');

  // null = the form is adding a new service. Set to a service's id (and
  // its current is_active) while editing, via startEdit() below.
  let editing = null;
  let servicesById = {};

  function startEdit(s) {
    editing = { id: s.id, is_active: s.is_active };
    nameInput.value = s.service_name;
    nameBnInput.value = s.service_name_bn || '';
    submitBtn.textContent = 'Save Changes';
    cancelEditBtn.classList.remove('hidden');
    formError.classList.add('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    nameInput.focus();
  }

  function stopEdit() {
    editing = null;
    form.reset();
    submitBtn.textContent = 'Add Service';
    cancelEditBtn.classList.add('hidden');
    formError.classList.add('hidden');
  }

  cancelEditBtn.addEventListener('click', stopEdit);

  async function loadServices() {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Loading…</td></tr>';
    try {
      const services = await api('/api/admin/services');
      servicesById = Object.fromEntries(services.map((s) => [s.id, s]));
      if (!services.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="muted">No services yet. Add one above.</td></tr>';
        return;
      }
      tbody.innerHTML = services.map(rowHtml).join('');
      attachRowHandlers();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Could not load services: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function rowHtml(s) {
    return `
      <tr data-id="${s.id}">
        <td>${escapeHtml(s.service_name)}</td>
        <td>${s.service_name_bn ? escapeHtml(s.service_name_bn) : '<span class="muted">—</span>'}</td>
        <td>
          <span class="status-dot ${s.is_active ? 'status-active' : 'status-inactive'}"></span>
          ${s.is_active ? 'Active' : 'Inactive'}
        </td>
        <td>
          <button class="btn btn-outline btn-sm edit-btn">Edit</button>
          <button class="btn btn-outline btn-sm toggle-btn">${s.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-danger btn-sm delete-btn">Delete</button>
        </td>
      </tr>
    `;
  }

  function attachRowHandlers() {
    tbody.querySelectorAll('tr').forEach((tr) => {
      const id = tr.dataset.id;
      tr.querySelector('.edit-btn').addEventListener('click', () => {
        const record = servicesById[id];
        if (record) startEdit(record);
      });
      tr.querySelector('.toggle-btn').addEventListener('click', async () => {
        const record = servicesById[id];
        try {
          await api(`/api/admin/services/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              service_name: record.service_name,
              service_name_bn: record.service_name_bn,
              is_active: !record.is_active
            })
          });
          if (editing && String(editing.id) === String(id)) stopEdit();
          loadServices();
        } catch (err) {
          alert(err.message);
        }
      });
      tr.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this service? This cannot be undone.')) return;
        try {
          await api(`/api/admin/services/${id}`, { method: 'DELETE' });
          if (editing && String(editing.id) === String(id)) stopEdit();
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
    const service_name = nameInput.value.trim();
    const service_name_bn = nameBnInput.value.trim();
    try {
      if (editing) {
        await api(`/api/admin/services/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ service_name, service_name_bn, is_active: editing.is_active })
        });
        stopEdit();
      } else {
        await api('/api/admin/services', {
          method: 'POST',
          body: JSON.stringify({ service_name, service_name_bn })
        });
        form.reset();
      }
      loadServices();
    } catch (err) {
      formError.textContent = err.message;
      formError.classList.remove('hidden');
    }
  });

  loadServices();
})();
