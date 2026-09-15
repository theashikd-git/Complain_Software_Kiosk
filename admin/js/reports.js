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
  const sectionInput = document.getElementById('section');
  const tbody = document.getElementById('report-tbody');

  // Default range: last 7 days
  const today = new Date();
  const weekAgo = new Date();
  weekAgo.setDate(today.getDate() - 6);
  fromInput.value = weekAgo.toISOString().slice(0, 10);
  toInput.value = today.toISOString().slice(0, 10);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await runReport();
  });

  async function runReport() {
    tbody.innerHTML = '<tr><td colspan="6" class="muted">Loading\u2026</td></tr>';
    const params = new URLSearchParams();
    if (fromInput.value) params.set('from', fromInput.value);
    if (toInput.value) params.set('to', toInput.value);
    if (sectionInput.value) params.set('section', sectionInput.value);

    try {
      const { summary, results } = await api(`/api/admin/reports?${params.toString()}`);
      document.getElementById('summary-satisfied').textContent = summary.satisfied;
      document.getElementById('summary-complain').textContent = summary.complain;
      document.getElementById('summary-avg-rating').textContent =
        summary.avg_rating != null ? `${summary.avg_rating} \u2605` : '\u2013';

      if (!results.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted">No results for this filter.</td></tr>';
        return;
      }

      tbody.innerHTML = results.map(rowHtml).join('');
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Could not load report: ${escapeHtml(err.message)}</td></tr>`;
    }
  }

  function rowHtml(r) {
    const typeLabel = r.submission_type === 'satisfied'
      ? '<span class="pill" style="background:#e2f5ec;color:#12805a;">Satisfied</span>'
      : '<span class="pill" style="background:#fceae7;color:#bf3327;">Complain</span>';

    let ratingOrId = '\u2014';
    if (r.submission_type === 'satisfied') {
      ratingOrId = r.rating != null ? `${'\u2605'.repeat(r.rating)}${'\u2606'.repeat(5 - r.rating)}` : '\u2014';
    } else {
      ratingOrId = (r.id_type && r.id_value) ? `${escapeHtml(r.id_type)}: ${escapeHtml(r.id_value)}` : 'Not provided';
    }

    const counterLabel = (r.counters && r.counters.length) ? escapeHtml(r.counters.join(', ')) : '\u2014';
    const employeeLabel = (r.employees && r.employees.length) ? escapeHtml(r.employees.join(', ')) : '\u2014';

    let details = '\u2014';
    if (r.submission_type === 'complain') {
      details = r.complaint_text ? escapeHtml(r.complaint_text) : '';
      if (r.voice_file_path) {
        details += `${details ? '<br>' : ''}<audio controls src="${escapeHtml(r.voice_file_path)}" style="height:30px;margin-top:4px;"></audio>`;
      }
      // Neither text nor voice: the patient tapped Complain but never
      // finished the form (or hasn't yet). Label it explicitly rather than
      // leaving the cell blank, so staff can tell "abandoned complaint"
      // apart from a rendering glitch.
      if (!details) {
        details = '<span class="muted">Unspecified \u2014 no details submitted</span>';
      }
    }

    return `
      <tr>
        <td>${formatTime(r.submitted_at)}</td>
        <td>${typeLabel}</td>
        <td>${ratingOrId}</td>
        <td>${counterLabel}</td>
        <td>${employeeLabel}</td>
        <td>${details}</td>
      </tr>
    `;
  }

  runReport();
})();
