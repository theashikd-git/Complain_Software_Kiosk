(async function init() {
  const admin = await requireAuth();
  if (!admin) return;
  renderSidebar('dashboard');

  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  const dateInput = document.getElementById('complaint-date');
  dateInput.value = todayStr();
  document.getElementById('date-label').textContent = new Date().toLocaleDateString(undefined, {
    weekday: 'long', month: 'long', day: 'numeric'
  });

  dateInput.addEventListener('change', () => loadAll(dateInput.value));

  await loadAll(dateInput.value);

  async function loadAll(date) {
    await Promise.all([loadSummary(date), loadComplaints(date)]);
  }

  async function loadSummary(date) {
    try {
      const summary = await api(`/api/admin/dashboard/summary?date=${date}`);
      document.getElementById('stat-satisfied').textContent = summary.satisfied;
      document.getElementById('stat-complain').textContent = summary.complain;
      document.getElementById('stat-avg-rating').textContent =
        summary.avg_rating != null ? `${summary.avg_rating} \u2605` : '\u2013';
    } catch (err) {
      console.error(err);
    }
  }

  async function loadComplaints(date) {
    const list = document.getElementById('complaint-list');
    list.innerHTML = '<div class="empty-state">Loading\u2026</div>';
    try {
      const complaints = await api(`/api/admin/dashboard/complaints?date=${date}`);
      if (!complaints.length) {
        list.innerHTML = '<div class="empty-state">No complaints for this date.</div>';
        return;
      }
      list.innerHTML = complaints.map(renderComplaintCard).join('');
    } catch (err) {
      list.innerHTML = `<div class="empty-state">Could not load complaints: ${escapeHtml(err.message)}</div>`;
    }
  }

  function renderComplaintCard(c) {
    const voiceHtml = c.voice_file_path
      ? `<audio controls src="${escapeHtml(c.voice_file_path)}"></audio>`
      : '';

    const textHtml = c.complaint_text
      ? `<div class="text">${escapeHtml(c.complaint_text)}</div>`
      : '';

    const idLabel = c.id_type && c.id_value
      ? `${escapeHtml(c.id_type)}: ${escapeHtml(c.id_value)}`
      : 'Identification not provided';

    // One pill per counter named, followed by that counter's rostered staff.
    const counterPills = (c.counters || []).length
      ? c.counters.map((ct) => {
          const employeePills = ct.assigned_employees.length
            ? ct.assigned_employees.map((n) => `<span class="pill pill-employee">${escapeHtml(n)}</span>`).join('')
            : '<span class="pill pill-employee">No one rostered</span>';
          return `<span class="pill pill-counter">Counter ${escapeHtml(ct.counter_number)} \u00B7 ${escapeHtml(ct.counter_name)}</span>${employeePills}`;
        }).join('')
      : '<span class="pill pill-employee">No counter selected</span>';

    return `
      <div class="complaint-card">
        <div class="row1">
          <span class="idinfo">${idLabel}</span>
          <span class="time">${formatTime(c.submitted_at)}</span>
        </div>
        ${textHtml}
        ${voiceHtml}
        <div class="meta">
          ${counterPills}
        </div>
      </div>
    `;
  }
})();
