(async function init() {
  const me = await requireStaffAuth();
  if (!me) return;

  document.getElementById('staff-greeting').textContent =
    `Welcome, ${me.staff.full_name} — which counter are you working today?`;

  // A counter chosen earlier this same login session is still valid —
  // go straight to the console instead of asking again. A fresh login
  // always clears this (see POST /api/staff/login), so staff genuinely
  // do pick again next time they log in.
  if (me.counter) {
    window.location.href = '/staff/console.html';
    return;
  }

  const listEl = document.getElementById('counter-list');
  const errorBox = document.getElementById('select-error');

  function optionHtml(c) {
    const occupiedTag = c.active_employee_id
      ? `<span class="occupied-tag">In use — ${escapeHtml(c.active_employee_name)}</span>`
      : '';
    return `
      <button type="button" class="counter-option" data-id="${c.id}">
        <span>
          <span class="name">${escapeHtml(c.counter_number)} — ${escapeHtml(c.counter_name)}</span>
        </span>
        ${occupiedTag}
      </button>
    `;
  }

  async function selectCounter(counterId, force) {
    errorBox.classList.add('hidden');
    try {
      await api('/api/staff/select-counter', {
        method: 'POST',
        body: JSON.stringify({ counter_id: counterId, force: Boolean(force) })
      });
      window.location.href = '/staff/console.html';
    } catch (err) {
      if (err.status === 409 && err.body && err.body.error === 'occupied') {
        const takeOver = confirm(
          `This counter is currently active with ${err.body.occupied_by}. Take it over anyway?`
        );
        if (takeOver) return selectCounter(counterId, true);
        return;
      }
      errorBox.textContent = err.message;
      errorBox.classList.remove('hidden');
    }
  }

  async function loadCounters() {
    try {
      const counters = await api('/api/staff/counters');
      if (!counters.length) {
        listEl.innerHTML = '<p class="sub">No counters are set up yet. Please ask an admin.</p>';
        return;
      }
      listEl.innerHTML = counters.map(optionHtml).join('');
      listEl.querySelectorAll('.counter-option').forEach((btn) => {
        btn.addEventListener('click', () => selectCounter(Number(btn.dataset.id), false));
      });
    } catch (err) {
      listEl.innerHTML = `<p class="sub">Could not load counters: ${escapeHtml(err.message)}</p>`;
    }
  }

  loadCounters();
})();
