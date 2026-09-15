(async function init() {
  const admin = await requireAuth();
  if (!admin) return;
  renderSidebar('counters');

  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  const tbody = document.getElementById('counters-tbody');
  const form = document.getElementById('counter-form');
  const formError = document.getElementById('form-error');
  const assignedEmployeeSelect = document.getElementById('assigned_employee_id');
  const counterNumberSuggestions = document.getElementById('counter-number-suggestions');
  const counterNameSuggestions = document.getElementById('counter-name-suggestions');

  let employees = [];

  // Counter number/name stay free-text (so admins can still type a brand
  // new one), but autocomplete/suggest from whatever's already been used —
  // typing into either field shows a native browser dropdown of existing
  // values, cutting down on typos and near-duplicate counters.
  function populateSuggestions(counters) {
    const numbers = [...new Set(counters.map((c) => c.counter_number))];
    const names = [...new Set(counters.map((c) => c.counter_name))];
    counterNumberSuggestions.innerHTML = numbers
      .map((n) => `<option value="${escapeHtml(n)}"></option>`)
      .join('');
    counterNameSuggestions.innerHTML = names
      .map((n) => `<option value="${escapeHtml(n)}"></option>`)
      .join('');
  }

  // Builds the <option> list for an "assigned employee" dropdown, marking
  // whichever id is currently selected (if any).
  function employeeOptionsHtml(selectedId) {
    const opts = employees.map((emp) =>
      `<option value="${emp.id}" ${String(emp.id) === String(selectedId) ? 'selected' : ''}>${escapeHtml(emp.full_name)}</option>`
    ).join('');
    return '<option value="">— Unassigned —</option>' + opts;
  }

  async function loadEmployeesForDropdown() {
    try {
      employees = await api('/api/admin/employees');
    } catch (err) {
      employees = [];
    }
    assignedEmployeeSelect.innerHTML = employeeOptionsHtml('');
  }

  async function loadCounters() {
    tbody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
    try {
      const counters = await api('/api/admin/counters');
      populateSuggestions(counters);
      if (!counters.length) {
        tbody.innerHTML = '<tr><td colspan="5" class="muted">No counters yet. Add one above.</td></tr>';
        return;
      }
      tbody.innerHTML = counters.map(rowHtml).join('');
      attachRowHandlers();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Could not load counters: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // "Assigned Employee (Now)" is a single dropdown showing/editing who's
  // responsible for this counter right now. Its value is c.current_employee_id
  // — the live roster match if a shift is currently active, otherwise the
  // counter's manual default. Picking a different employee here saves
  // immediately via PUT /api/admin/counters/:id/now, which is smart about
  // *where* to write the change (see that route's comment): if a roster
  // shift is active, it updates that shift's roster row so the Roster page
  // stays in sync; otherwise it just sets the manual default. The badge next
  // to the name shows which one is currently in effect.
  function badgeHtml(source) {
    return source === 'roster'
      ? '<span class="badge">Live · Roster</span>'
      : '<span class="badge muted">Default</span>';
  }

  function rowHtml(c) {
    return `
      <tr data-id="${c.id}">
        <td>${escapeHtml(c.counter_number)}</td>
        <td>${escapeHtml(c.counter_name)}</td>
        <td>
          <select class="assigned-employee-select">${employeeOptionsHtml(c.current_employee_id)}</select>
          <span class="now-badge">${badgeHtml(c.assigned_employee_source)}</span>
        </td>
        <td>
          <span class="status-dot ${c.is_active ? 'status-active' : 'status-inactive'}"></span>
          ${c.is_active ? 'Active' : 'Inactive'}
        </td>
        <td>
          <button class="btn btn-outline btn-sm toggle-btn">${c.is_active ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-danger btn-sm delete-btn">Delete</button>
        </td>
      </tr>
    `;
  }

  function attachRowHandlers() {
    tbody.querySelectorAll('tr').forEach((tr) => {
      const id = tr.dataset.id;
      const counterNumber = () => tr.children[0].textContent.trim();
      const counterName = () => tr.children[1].textContent.trim();

      // Reassigning the employee saves immediately — no separate save
      // button, matching the toggle/delete pattern already used on this
      // page. Uses the dedicated "/now" endpoint (not the general counter
      // PUT) so the backend can decide whether this should update the
      // active roster row or the manual default.
      tr.querySelector('.assigned-employee-select').addEventListener('change', async (e) => {
        const employeeId = e.target.value || null;
        if (!employeeId) {
          alert('Choose an employee — clearing the current assignment isn\'t supported here. Remove the roster entry from the Roster page, or clear the counter\'s default there instead, if you need it unassigned.');
          loadCounters();
          return;
        }
        try {
          await api(`/api/admin/counters/${id}/now`, {
            method: 'PUT',
            body: JSON.stringify({ employee_id: employeeId })
          });
          loadCounters();
        } catch (err) {
          alert(err.message);
          loadCounters();
        }
      });

      tr.querySelector('.toggle-btn').addEventListener('click', async () => {
        const isActive = tr.querySelector('.status-active') !== null;
        try {
          await api(`/api/admin/counters/${id}`, {
            method: 'PUT',
            body: JSON.stringify({
              counter_number: counterNumber(),
              counter_name: counterName(),
              is_active: !isActive
            })
          });
          loadCounters();
        } catch (err) {
          alert(err.message);
        }
      });
      tr.querySelector('.delete-btn').addEventListener('click', async () => {
        if (!confirm('Delete this counter? This cannot be undone.')) return;
        try {
          await api(`/api/admin/counters/${id}`, { method: 'DELETE' });
          loadCounters();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');
    const counter_number = document.getElementById('counter_number').value.trim();
    const counter_name = document.getElementById('counter_name').value.trim();
    const assigned_employee_id = assignedEmployeeSelect.value || null;
    try {
      await api('/api/admin/counters', {
        method: 'POST',
        body: JSON.stringify({ counter_number, counter_name, assigned_employee_id })
      });
      form.reset();
      assignedEmployeeSelect.value = '';
      loadCounters();
    } catch (err) {
      formError.textContent = err.message;
      formError.classList.remove('hidden');
    }
  });

  await loadEmployeesForDropdown();
  loadCounters();
})();
