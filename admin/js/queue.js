(async function init() {
  const admin = await requireAuth();
  if (!admin) return;
  renderSidebar('queue');

  document.getElementById('logout-btn').addEventListener('click', (e) => {
    e.preventDefault();
    logout();
  });

  const grid = document.getElementById('queue-grid');

  function cardHtml(c) {
    const serving = c.serving
      ? `<div class="queue-now-number">${escapeHtml(c.serving.display_number)}</div><div class="queue-now-service">${escapeHtml(c.serving.service_name)}</div>`
      : `<div class="queue-now-number muted">—</div><div class="queue-now-service">Nobody currently being served</div>`;

    const waitingItems = c.waiting.length
      ? c.waiting
          .map(
            (t) => `<li><span>${escapeHtml(t.display_number)}</span><span class="svc">${escapeHtml(t.service_name)}</span></li>`
          )
          .join('')
      : '<li class="muted">Nobody waiting</li>';

    return `
      <div class="queue-card" data-counter-id="${c.counter_id}">
        <h3>${escapeHtml(c.counter_number)} — ${escapeHtml(c.counter_name)}</h3>
        <p class="counter-sub">${c.waiting.length} waiting</p>
        <div class="queue-now-serving">Now serving</div>
        ${serving}
        <div class="queue-waiting-label">Waiting</div>
        <ul class="queue-waiting-list">${waitingItems}</ul>
        <button class="btn btn-primary btn-sm call-next-btn">Call Next</button>
      </div>
    `;
  }

  async function loadQueue() {
    try {
      const counters = await api('/api/admin/queue');
      if (!counters.length) {
        grid.innerHTML = '<p class="muted">No active counters yet — add one on the Counters page.</p>';
        return;
      }
      grid.innerHTML = counters.map(cardHtml).join('');
      attachHandlers();
    } catch (err) {
      grid.innerHTML = `<p class="muted">Could not load the queue: ${escapeHtml(err.message)}</p>`;
    }
  }

  function attachHandlers() {
    grid.querySelectorAll('.queue-card').forEach((card) => {
      const counterId = card.dataset.counterId;
      card.querySelector('.call-next-btn').addEventListener('click', async () => {
        try {
          await api(`/api/admin/queue/${counterId}/call-next`, { method: 'POST' });
          loadQueue();
        } catch (err) {
          alert(err.message);
        }
      });
    });
  }

  document.getElementById('refresh-btn').addEventListener('click', loadQueue);

  loadQueue();
})();
