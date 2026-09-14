(async function init() {
  const admin = await requireAuth();
  if (!admin) return;
  renderSidebar('roster');

  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  const shiftDateInput = document.getElementById('shift_date');
  const counterSelect = document.getElementById('counter_select');
  const shiftSelect = document.getElementById('shift_id');
  const employeeChecklist = document.getElementById('employee-checklist');
  const form = document.getElementById('roster-form');
  const formError = document.getElementById('form-error');
  const rosterTbody = document.getElementById('roster-tbody');
  const rosterViewTitle = document.getElementById('roster-view-title');
  const viewDailyBtn = document.getElementById('view-daily-btn');
  const viewUnassignedBtn = document.getElementById('view-unassigned-btn');

  const importForm = document.getElementById('import-form');
  const importFileInput = document.getElementById('import-file');
  const importMonthSelect = document.getElementById('import-month');
  const importYearInput = document.getElementById('import-year');
  const importError = document.getElementById('import-error');
  const importResult = document.getElementById('import-result');
  const sheetPicker = document.getElementById('import-sheet-picker');
  const sheetSelect = document.getElementById('import-sheet-select');
  const sheetConfirmBtn = document.getElementById('import-sheet-confirm');

  shiftDateInput.value = todayStr();
  const now = new Date();
  importMonthSelect.value = String(now.getMonth() + 1);
  importYearInput.value = String(now.getFullYear());

  let counters = [];
  let employees = [];
  let shifts = [];
  let viewMode = 'daily'; // 'daily' | 'unassigned'
  let currentImportFile = null;
  let rosterRowsById = {}; // id -> full row object from the last loadRoster(), for the Edit form

  // Local-timezone "today", not todayStr()'s UTC-based one (see common.js) —
  // editability is a same-day/future-day decision and should follow the
  // admin PC's own clock, not get shifted a day by a UTC round-trip. The
  // backend is the real authority (checks the DB's CURRENT_DATE, matching
  // qserver's actual OS timezone) — this is only the frontend's UI gate for
  // which rows even show an Edit button.
  function localTodayStr() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
  }

  function setView(mode) {
    viewMode = mode;
    viewDailyBtn.classList.toggle('btn-primary', mode === 'daily');
    viewDailyBtn.classList.toggle('btn-outline', mode !== 'daily');
    viewUnassignedBtn.classList.toggle('btn-primary', mode === 'unassigned');
    viewUnassignedBtn.classList.toggle('btn-outline', mode !== 'unassigned');
    // Note: shiftDateInput lives in the "Assign Selected Employees" form
    // above and stays visible in both views — it's also that form's Date
    // field, not just a filter control, so it must never be hidden.
    rosterViewTitle.innerHTML =
      mode === 'daily'
        ? 'Roster for <span id="roster-date-label"></span>'
        : 'All roster entries (every date)';
    loadRoster();
  }

  async function apiUpload(path, formData) {
    const res = await fetch(path, { method: 'POST', body: formData });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  }

  async function loadOptions() {
    [counters, employees, shifts] = await Promise.all([
      api('/api/admin/counters'),
      api('/api/admin/employees'),
      api('/api/admin/shifts')
    ]);

    counterSelect.innerHTML = counters
      .filter((c) => c.is_active)
      .map((c) => `<option value="${c.id}">${escapeHtml(c.counter_number)} — ${escapeHtml(c.counter_name)}</option>`)
      .join('');

    const activeShifts = shifts.filter((s) => s.is_active);
    if (!activeShifts.length) {
      shiftSelect.innerHTML = '<option value="">No shifts set up yet</option>';
    } else {
      shiftSelect.innerHTML = activeShifts
        .map(
          (s) =>
            `<option value="${s.id}">${escapeHtml(s.shift_name)} (${escapeHtml(formatClock(s.start_time))}–${escapeHtml(formatClock(s.end_time))})</option>`
        )
        .join('');
    }

    employeeChecklist.innerHTML = employees
      .filter((e) => e.is_active)
      .map(
        (e) => `
        <label>
          <input type="checkbox" value="${e.id}">
          ${escapeHtml(e.full_name)}
        </label>`
      )
      .join('');
  }

  function counterOptionsHtml(selectedId) {
    return (
      `<option value="">— choose —</option>` +
      counters
        .filter((c) => c.is_active)
        .map(
          (c) =>
            `<option value="${c.id}"${String(c.id) === String(selectedId) ? ' selected' : ''}>${escapeHtml(c.counter_number)} — ${escapeHtml(c.counter_name)}</option>`
        )
        .join('')
    );
  }

  function shiftOptionsHtml(selectedId) {
    return shifts
      .filter((s) => s.is_active)
      .map(
        (s) =>
          `<option value="${s.id}"${String(s.id) === String(selectedId) ? ' selected' : ''}>${escapeHtml(s.shift_name)} (${escapeHtml(formatClock(s.start_time))}–${escapeHtml(formatClock(s.end_time))})</option>`
      )
      .join('');
  }

  function employeeOptionsHtml(selectedId) {
    return employees
      .filter((e) => e.is_active)
      .map(
        (e) =>
          `<option value="${e.id}"${String(e.id) === String(selectedId) ? ' selected' : ''}>${escapeHtml(e.full_name)}</option>`
      )
      .join('');
  }

  function counterCellHtml(r) {
    if (r.is_off) return '<span class="muted">—</span>';
    if (r.counter_id) {
      return `${escapeHtml(r.counter_number)} — ${escapeHtml(r.counter_name)}`;
    }
    return `
      <div style="display:flex; gap:6px; align-items:center;">
        <select class="assign-counter-select" data-id="${r.id}" style="padding:6px 8px; border-radius:8px; border:1.5px solid var(--border); font-size:12.5px;">
          ${counterOptionsHtml()}
        </select>
        <button class="btn btn-primary btn-sm assign-counter-btn" data-id="${r.id}">Assign</button>
      </div>
    `;
  }

  // Edit is only offered for today-or-future rows — a past assignment is a
  // record of what actually happened and shouldn't be rewritten. This is a
  // UI convenience only; the server independently re-checks the date on
  // every save, so this gate can't be bypassed by calling the API directly.
  function isEditable(r) {
    return r.shift_date >= localTodayStr();
  }

  function rowHtml(r) {
    rosterRowsById[r.id] = r;
    return `
      <tr data-id="${r.id}">
        <td>${escapeHtml(r.shift_date)}</td>
        <td>${counterCellHtml(r)}</td>
        <td>${escapeHtml(r.shift_name)}${r.is_off ? '' : ` (${escapeHtml(formatClock(r.start_time))}–${escapeHtml(formatClock(r.end_time))})`}</td>
        <td>${escapeHtml(r.employee_name)} (${escapeHtml(r.employee_code)})</td>
        <td>
          <button class="btn btn-outline btn-sm view-daily-btn" data-date="${escapeHtml(r.shift_date)}">View Daily</button>
          ${isEditable(r) ? `<button class="btn btn-outline btn-sm edit-row-btn">Edit</button>` : ''}
          <button class="btn btn-danger btn-sm remove-btn">Remove</button>
        </td>
      </tr>`;
  }

  // The same row, swapped into edit mode: Counter/Shift/Employee become
  // dropdowns pre-filled with the row's current values, Edit/Remove become
  // Save/Cancel. Mirrors the existing inline "Assign" control's style
  // (counterCellHtml above) rather than introducing a modal/popup, matching
  // this admin panel's existing pattern for in-row editing.
  function editRowHtml(r) {
    const selectStyle = 'padding:6px 8px; border-radius:8px; border:1.5px solid var(--border); font-size:12.5px; width:100%;';
    return `
      <tr data-id="${r.id}" class="roster-row-editing">
        <td>${escapeHtml(r.shift_date)}</td>
        <td><select class="edit-counter-select" style="${selectStyle}">${counterOptionsHtml(r.counter_id)}</select></td>
        <td><select class="edit-shift-select" style="${selectStyle}">${shiftOptionsHtml(r.shift_id)}</select></td>
        <td><select class="edit-employee-select" style="${selectStyle}">${employeeOptionsHtml(r.employee_id)}</select></td>
        <td>
          <button class="btn btn-primary btn-sm save-edit-btn">Save</button>
          <button class="btn btn-outline btn-sm cancel-edit-btn">Cancel</button>
        </td>
      </tr>`;
  }

  async function loadRoster() {
    if (viewMode === 'daily') {
      const date = shiftDateInput.value;
      const label = document.getElementById('roster-date-label');
      if (label) label.textContent = date;
    }
    rosterTbody.innerHTML = '<tr><td colspan="5" class="muted">Loading…</td></tr>';
    rosterRowsById = {};
    const countSummary = document.getElementById('roster-count-summary');
    if (countSummary) countSummary.textContent = '';
    try {
      const url = viewMode === 'unassigned' ? '/api/admin/roster?unassigned=1' : `/api/admin/roster?date=${shiftDateInput.value}`;
      const rows = await api(url);
      if (countSummary) {
        const employeeCount = new Set(rows.map((r) => r.employee_id)).size;
        let text = rows.length
          ? `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'} across ${employeeCount} employee${employeeCount === 1 ? '' : 's'}`
          : '';
        if (rows.length && viewMode === 'unassigned') {
          // This view now shows every entry, assigned or not (see loadRoster's
          // unassigned=1 request) — call out how many still need a counter so
          // that's still scannable at a glance without it meaning "hidden."
          const needCounterCount = rows.filter((r) => !r.is_off && !r.counter_id).length;
          text += ` · ${needCounterCount} still need${needCounterCount === 1 ? 's' : ''} a counter`;
        }
        countSummary.textContent = text;
      }
      if (!rows.length) {
        rosterTbody.innerHTML = `<tr><td colspan="5" class="muted">${
          viewMode === 'unassigned' ? 'No roster entries yet.' : 'No assignments for this date yet.'
        }</td></tr>`;
        return;
      }
      rosterTbody.innerHTML = rows.map(rowHtml).join('');
      attachRowHandlers();
    } catch (err) {
      rosterTbody.innerHTML = `<tr><td colspan="5" class="muted">Could not load roster: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  // `root` scopes which rows get handlers bound: the full tbody after a
  // fresh loadRoster() (default), or just a single freshly-swapped-in <tr>
  // after an Edit/Cancel toggle. Scoping matters — re-running this over the
  // whole tbody after swapping just one row's HTML would re-attach a SECOND
  // set of listeners to every other row's still-in-DOM buttons (their nodes
  // were never replaced, so their original listeners are still live too),
  // making every click on them fire twice, three times, etc. the more edits
  // happen in a session.
  function attachRowHandlers(root = rosterTbody) {
    root.querySelectorAll('.remove-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.closest('tr').dataset.id;
        if (!confirm('Remove this assignment?')) return;
        try {
          await api(`/api/admin/roster/${id}`, { method: 'DELETE' });
          loadRoster();
        } catch (err) {
          alert(err.message);
        }
      });
    });
    root.querySelectorAll('.view-daily-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        shiftDateInput.value = btn.dataset.date;
        setView('daily');
      });
    });
    root.querySelectorAll('.edit-row-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const r = rosterRowsById[id];
        if (!r) return;
        tr.outerHTML = editRowHtml(r);
        attachRowHandlers(rosterTbody.querySelector(`tr[data-id="${id}"]`));
      });
    });
    root.querySelectorAll('.cancel-edit-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const r = rosterRowsById[id];
        if (!r) return;
        tr.outerHTML = rowHtml(r);
        attachRowHandlers(rosterTbody.querySelector(`tr[data-id="${id}"]`));
      });
    });
    root.querySelectorAll('.save-edit-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const tr = btn.closest('tr');
        const id = tr.dataset.id;
        const counter_id = tr.querySelector('.edit-counter-select').value || null;
        const shift_id = tr.querySelector('.edit-shift-select').value;
        const employee_id = tr.querySelector('.edit-employee-select').value;
        btn.disabled = true;
        try {
          await api(`/api/admin/roster/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ counter_id, shift_id, employee_id })
          });
          // A full reload rather than an in-place patch — Save can change
          // three interdependent fields at once (shift time range display,
          // employee name/code, counter text), so re-fetching from the
          // server is simpler and more reliably correct than reconstructing
          // all of that client-side. Now that "All Entries" no longer
          // filters any row out (see the roster history in the project
          // notes), a full reload can't make the edited row vanish either.
          loadRoster();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
        }
      });
    });
    root.querySelectorAll('.assign-counter-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const select = root.querySelector(`.assign-counter-select[data-id="${id}"]`) || rosterTbody.querySelector(`.assign-counter-select[data-id="${id}"]`);
        if (!select.value) {
          alert('Choose a counter first.');
          return;
        }
        try {
          await api(`/api/admin/roster/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ counter_id: select.value })
          });
          // Update this row in place rather than doing a full loadRoster()
          // reload — purely so the assignment shows up instantly with no
          // network round trip. (The backend's unassigned=1 query no longer
          // filters out already-assigned rows — see roster.js's GET / — so
          // even a full reload would keep this row visible now too; this is
          // just the faster path.) "View Daily" on the row is there if the
          // admin wants to see it in that date's Daily view as well.
          const counter = counters.find((c) => String(c.id) === String(select.value));
          const row = btn.closest('tr');
          const counterCell = row ? row.children[1] : null;
          if (counter && counterCell) {
            counterCell.innerHTML = `${escapeHtml(counter.counter_number)} — ${escapeHtml(counter.counter_name)}`;
          }
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  viewDailyBtn.addEventListener('click', () => setView('daily'));
  viewUnassignedBtn.addEventListener('click', () => setView('unassigned'));
  shiftDateInput.addEventListener('change', loadRoster);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.classList.add('hidden');

    const selectedEmployeeIds = Array.from(
      employeeChecklist.querySelectorAll('input[type="checkbox"]:checked')
    ).map((cb) => cb.value);

    if (!selectedEmployeeIds.length) {
      formError.textContent = 'Select at least one employee.';
      formError.classList.remove('hidden');
      return;
    }

    if (!shiftSelect.value) {
      formError.textContent = 'Set up at least one shift on the Shifts page first.';
      formError.classList.remove('hidden');
      return;
    }

    const counter_id = counterSelect.value;
    const shift_date = shiftDateInput.value;
    const shift_id = shiftSelect.value;

    // Assign each selected employee to this counter/shift one at a time.
    const errors = [];
    for (const employee_id of selectedEmployeeIds) {
      try {
        await api('/api/admin/roster', {
          method: 'POST',
          body: JSON.stringify({ counter_id, employee_id, shift_date, shift_id })
        });
      } catch (err) {
        errors.push(err.message);
      }
    }

    if (errors.length) {
      formError.textContent = errors.join(' ');
      formError.classList.remove('hidden');
    }

    employeeChecklist.querySelectorAll('input[type="checkbox"]').forEach((cb) => (cb.checked = false));
    loadRoster();
  });

  // ---- Excel import ----

  async function runImport(sheetName) {
    importError.classList.add('hidden');
    importResult.style.display = 'none';

    if (!currentImportFile) {
      importError.textContent = 'Choose an Excel file first.';
      importError.classList.remove('hidden');
      return;
    }

    const fd = new FormData();
    fd.append('file', currentImportFile);
    fd.append('month', importMonthSelect.value);
    fd.append('year', importYearInput.value);
    if (sheetName) fd.append('sheetName', sheetName);

    try {
      const data = await apiUpload('/api/admin/roster/import', fd);

      if (data.needsSheetSelection) {
        sheetSelect.innerHTML = data.sheets.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
        sheetPicker.classList.remove('hidden');
        return;
      }

      sheetPicker.classList.add('hidden');

      let msg = `Imported ${data.imported} shift${data.imported === 1 ? '' : 's'} from "${data.sheetName}".`;
      if (data.unmatchedEmployees && data.unmatchedEmployees.length) {
        msg += ` No matching employee for: ${data.unmatchedEmployees.join(', ')}.`;
      }
      if (data.skippedInvalidDays && data.skippedInvalidDays.length) {
        msg += ` ${data.skippedInvalidDays.length} day(s) skipped (outside the chosen month).`;
      }
      if (data.warnings && data.warnings.length) {
        msg += ` ${data.warnings.length} unrecognized code warning(s).`;
      }
      if (data.multipleShiftsWarnings && data.multipleShiftsWarnings.length) {
        // An employee can legitimately work more than one shift a day now
        // (see migration_multi_shift.sql), but it can also mean a corrected
        // re-import added a new shift alongside an old, now-wrong one
        // instead of replacing it — so call these out by name rather than
        // just a count, so the admin can quickly check whether each one is
        // intentional or needs the stale entry removed on the Roster table.
        msg += ` Note — now has more than one shift on file: ${data.multipleShiftsWarnings.join('; ')}.`;
      }
      importResult.textContent = msg;
      importResult.style.display = 'block';
      setView('unassigned');
    } catch (err) {
      importError.textContent = err.message;
      importError.classList.remove('hidden');
    }
  }

  importForm.addEventListener('submit', (e) => {
    e.preventDefault();
    sheetPicker.classList.add('hidden');
    currentImportFile = importFileInput.files[0] || null;
    runImport();
  });

  sheetConfirmBtn.addEventListener('click', () => runImport(sheetSelect.value));

  await loadOptions();
  setView('daily');
})();
