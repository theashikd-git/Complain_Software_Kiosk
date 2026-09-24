(async function init() {
  const me = await requireStaffAuth();
  if (!me) return;

  // No counter chosen this session (fresh login, or it was cleared
  // because the counter no longer exists) — go pick one first.
  if (!me.counter) {
    window.location.href = '/staff/select-counter.html';
    return;
  }

  const POLL_INTERVAL_MS = 4000;

  if (me.no_roster_duty) {
    document.getElementById('roster-notice').classList.remove('hidden');
  }

  document.getElementById('counter-label').textContent =
    `${me.counter.counter_number} — ${me.counter.counter_name}`;
  document.getElementById('staff-name').textContent = me.staff.full_name;

  document.getElementById('logout-btn').addEventListener('click', staffLogout);

  const servingNumberEl = document.getElementById('serving-number');
  const servingServiceEl = document.getElementById('serving-service');
  const callNextBtn = document.getElementById('call-next-btn');
  const waitingCountEl = document.getElementById('waiting-count');
  const waitingListEl = document.getElementById('waiting-list');
  const toastEl = document.getElementById('toast');

  let toastTimer = null;
  function showToast(message) {
    toastEl.textContent = message;
    toastEl.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2500);
  }

  function render(data) {
    if (data.serving) {
      servingNumberEl.textContent = data.serving.ticket_number;
      servingNumberEl.classList.remove('is-empty');
      servingServiceEl.textContent = data.serving.service_name;
    } else {
      servingNumberEl.textContent = 'None yet';
      servingNumberEl.classList.add('is-empty');
      servingServiceEl.textContent = '';
    }

    waitingCountEl.textContent = `${data.waiting.length} waiting`;
    // Serial number only — no patient name or service, same
    // no-identifying-detail rule as the public waiting-room display.
    waitingListEl.innerHTML = data.waiting.length
      ? data.waiting
          .map(
            (t, i) => `<li><span class="position">${i + 1}</span><span class="serial">${escapeHtml(t.ticket_number)}</span></li>`
          )
          .join('')
      : '<li class="waiting-empty">No one waiting</li>';

    // Stays enabled while someone is still being served, even with nobody
    // waiting, so staff can finish the last person; it disables only once
    // both are empty.
    callNextBtn.disabled = data.waiting.length === 0 && !data.serving;
  }

  async function loadQueue() {
    try {
      const data = await api('/api/staff/queue');
      render(data);
    } catch (err) {
      if (err.status === 401) {
        window.location.href = '/staff/login.html';
        return;
      }
      if (err.status === 409) {
        window.location.href = '/staff/select-counter.html';
        return;
      }
      showToast(`Could not refresh the queue: ${err.message}`);
    }
  }

  callNextBtn.addEventListener('click', async () => {
    callNextBtn.disabled = true;
    try {
      const result = await api('/api/staff/call-next', { method: 'POST' });
      if (result.next_ticket) {
        showToast(`Called serial ${result.next_ticket.ticket_number}`);
      } else {
        showToast('Finished. No one waiting.');
      }
      await loadQueue();
    } catch (err) {
      showToast(`Could not call next: ${err.message}`);
      callNextBtn.disabled = false;
    }
  });

  loadQueue();
  setInterval(loadQueue, POLL_INTERVAL_MS);
})();
