(async function init() {
  const admin = await requireAuth();
  if (!admin) return;
  renderSidebar('employees');

  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  const tbody = document.getElementById('employees-tbody');
  const form = document.getElementById('employee-form');
  const formError = document.getElementById('form-error');
  const submitBtn = document.getElementById('employee-submit-btn');
  const cancelEditBtn = document.getElementById('cancel-edit-btn');
  const employeeCodeInput = document.getElementById('employee_code');
  const fullNameInput = document.getElementById('full_name');
  const designationInput = document.getElementById('designation');
  const phoneInput = document.getElementById('phone');

  // null = the form is adding a new employee. Set to an employee's id (and
  // its current is_active) while editing, via startEdit() below.
  let editing = null;

  function startEdit(e) {
    editing = { id: e.id, is_active: e.is_active };
    employeeCodeInput.value = e.employee_code;
    fullNameInput.value = e.full_name;
    designationInput.value = e.designation || '';
    phoneInput.value = e.phone || '';
    submitBtn.textContent = 'Save Changes';
    cancelEditBtn.classList.remove('hidden');
    formError.classList.add('hidden');
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
    employeeCodeInput.focus();
  }

  function stopEdit() {
    editing = null;
    form.reset();
    submitBtn.textContent = 'Add Employee';
    cancelEditBtn.classList.add('hidden');
    formError.classList.add('hidden');
  }

  cancelEditBtn.addEventListener('click', stopEdit);

  // Keyed by id so the Edit button can hand startEdit() the full employee
  // record (including is_active) without re-parsing it back out of the DOM.
  let employeesById = {};

  async function loadEmployees() {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading…</td></tr>';
    try {
      const employees = await api('/api/admin/employees');
      employeesById = Object.fromEntries(employees.map((e) => [e.id, e]));
      if (!employees.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">No employees yet. Add one above.</td></tr>';
        return;
      }
      tbody.innerHTML = employees.map(rowHtml).join('');
      attachRowHandlers();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Could not load employees: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function rowHtml(e) {
    return `
      <tr data-id="${e.id}">
        <td>${escapeHtml(e.employee_code)}</td>
        <td>${escapeHtml(e.full_name)}</td>
        <td>${escapeHtml(e.designation || '—')}</td>
        <td>${escapeHtml(e.phone || '—')}</td>
        <td>
          <span class="status-dot ${e.is_active ? 'status-active' : 'status-inactive'}"></span>
          ${e.is_active ? 'Active' : 'Inactive'}
        </td>
        <td>
          <button class="btn btn-outline btn-sm edit-btn">Edit</button>
          <button class="btn btn-outline btn-sm toggle-btn">${e.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-danger btn-sm delete-btn">Delete</button>
        </td>
      </tr>
    `;
  }

  function attachRowHandlers() {
    tbody.querySelectorAll('tr').forEach((tr) => {
      const id = tr.dataset.id;
      tr.querySelector('.edit-btn').addEventListener('click', () => {
        const record = employeesById[id];
        if (record) startEdit(record);
      });
      tr.querySelector('.toggle-btn').addEventListener('click', async () => {
        const isActive = tr.querySelector('.status-active') !== null;
        try {
          await api(`/api/admin/employees/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              employee_code: tr.children[0].textContent.trim(),
              full_name: tr.children[1].textContent.trim(),
              designation: tr.children[2].textContent.trim(),
              phone: tr.children[3].textContent.trim(),
              is_active: !isActive
            })
          });
          // If the row being toggled is also the one currently open in the
          // edit form, back out of editing rather than leaving the form
          // holding a now-stale is_active value.
          if (editing && String(editing.id) === String(id)) stopEdit();
          loadEmployees();
        } catch (err) {
          alert(err.message);
        }
      });
      tr.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this employee? This cannot be undone.')) return;
        try {
          await api(`/api/admin/employees/${id}`, { method: 'DELETE' });
          if (editing && String(editing.id) === String(id)) stopEdit();
          loadEmployees();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');
    const employee_code = employeeCodeInput.value.trim();
    const full_name = fullNameInput.value.trim();
    const designation = designationInput.value.trim();
    const phone = phoneInput.value.trim();
    try {
      if (editing) {
        // Preserve the employee's current is_active — this form never
        // touches status, only Edit's own PUT here needs to resend it so
        // the general PUT route (which overwrites all five columns every
        // call) doesn't accidentally clear it.
        await api(`/api/admin/employees/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({ employee_code, full_name, designation, phone, is_active: editing.is_active })
        });
        stopEdit();
      } else {
        await api('/api/admin/employees', {
          method: 'POST',
          body: JSON.stringify({ employee_code, full_name, designation, phone })
        });
        form.reset();
      }
      loadEmployees();
    } catch (err) {
      formError.textContent = err.message;
      formError.classList.remove('hidden');
    }
  });

  loadEmployees();
})();
