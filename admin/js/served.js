(async function init() {
  const admin = await requireAuth();
  if (!admin) return;
  renderSidebar('reports');

  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  const form = document.getElementById('filter-form');
  const fromInput = document.getElementById('from');
  const toInput = document.getElementById('to');
  const searchInput = document.getElementById('search');
  const tbody = document.getElementById('served-tbody');

  // Default range: this month so far
  const today = new Date();
  fromInput.value = new Date(today.getFullYear(), today.getMonth(), 1).toLocaleDateString('en-CA');
  toInput.value = today.toLocaleDateString('en-CA');

  let data = { total: 0, rows: [] };
  let sortKey = 'served';
  let sortDir = 'desc';

  function rangeParams() {
    const params = new URLSearchParams();
    if (fromInput.value) params.set('from', fromInput.value);
    if (toInput.value) params.set('to', toInput.value);
    return params.toString();
  }

  // "Not recorded" always stays last, whatever the sort — it isn't a
  // person, so it shouldn't jump around among the real employees.
  function visibleRows() {
    const q = searchInput.value.trim().toLowerCase();
    const recorded = data.rows.filter((r) => r.employee_id != null);
    const unrecorded = data.rows.filter((r) => r.employee_id == null);
    const matches = q
      ? recorded.filter((r) => r.full_name.toLowerCase().includes(q) || r.employee_code.toLowerCase().includes(q))
      : recorded;
    const dir = sortDir === 'asc' ? 1 : -1;
    matches.sort((a, b) => {
      if (sortKey === 'served') return (a.served - b.served) * dir;
      const av = sortKey === 'code' ? a.employee_code : a.full_name;
      const bv = sortKey === 'code' ? b.employee_code : b.full_name;
      return av.localeCompare(bv, undefined, { numeric: true }) * dir;
    });
    return { matches, unrecorded: q ? [] : unrecorded };
  }

  function render() {
    const { matches, unrecorded } = visibleRows();
    document.getElementById('total-served').textContent = data.total;
    document.getElementById('total-employees').textContent = data.rows.filter((r) => r.employee_id != null).length;

    const all = [...matches, ...unrecorded];
    if (!all.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="muted">No patients served for this filter.</td></tr>';
      return;
    }
    tbody.innerHTML = all.map((r) => {
      const pct = data.total ? Math.round((r.served / data.total) * 100) : 0;
      const recorded = r.employee_id != null;
      return `
        <tr>
          <td${recorded ? '' : ' class="muted"'}>${recorded ? escapeHtml(r.full_name) : 'Not recorded (admin or older data)'}</td>
          <td class="muted">${recorded ? escapeHtml(r.employee_code) : '\u2013'}</td>
          <td><strong>${r.served}</strong></td>
          <td><div class="share-bar"><div class="share-fill${recorded ? '' : ' unrecorded'}" style="width: ${pct}%"></div></div></td>
        </tr>
      `;
    }).join('');
  }

  function updateSortIndicators() {
    document.querySelectorAll('th.sortable').forEach((th) => {
      const active = th.dataset.sort === sortKey;
      th.dataset.dir = active ? sortDir : '';
    });
  }

  async function load() {
    tbody.innerHTML = '<tr><td colspan="4" class="muted">Loading\u2026</td></tr>';
    try {
      data = await api(`/api/admin/served-report?${rangeParams()}`);
      render();
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="4" class="muted">Could not load the report: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    load();
  });
  searchInput.addEventListener('input', render);

  document.querySelectorAll('th.sortable').forEach((th) => {
    th.addEventListener('click', () => {
      const key = th.dataset.sort;
      if (sortKey === key) {
        sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        sortKey = key;
        sortDir = key === 'served' ? 'desc' : 'asc';
      }
      updateSortIndicators();
      render();
    });
  });

  document.getElementById('export-btn').addEventListener('click', () => {
    window.location.href = `/api/admin/served-report/export?${rangeParams()}`;
  });

  updateSortIndicators();
  load();
})();
