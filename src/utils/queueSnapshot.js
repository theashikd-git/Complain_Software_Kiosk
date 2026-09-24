// Shared "what's happening at every counter right now" query, used by
// both the admin Queue (Now Serving) page and the public waiting-room
// display board — kept in one place so the two never drift apart on
// what counts as "active" or how tickets get grouped.
async function getQueueSnapshot(db) {
  const { rows } = await db.query(
    `SELECT c.id AS counter_id, c.counter_number, c.counter_name,
            qt.id AS ticket_id, qt.ticket_number, qt.status, s.service_name
     FROM counters c
     LEFT JOIN queue_tickets qt
       ON qt.counter_id = c.id AND qt.ticket_date = CURRENT_DATE AND qt.status IN ('waiting', 'serving')
     LEFT JOIN services s ON s.id = qt.service_id
     WHERE c.is_active = TRUE
     ORDER BY c.counter_number, qt.ticket_number`
  );

  const countersById = {};
  rows.forEach((row) => {
    if (!countersById[row.counter_id]) {
      countersById[row.counter_id] = {
        counter_id: row.counter_id,
        counter_number: row.counter_number,
        counter_name: row.counter_name,
        serving: null,
        waiting: []
      };
    }
    if (!row.ticket_id) return;
    const ticket = {
      ticket_id: row.ticket_id,
      ticket_number: row.ticket_number,
      display_number: `${row.ticket_number}`,
      service_name: row.service_name
    };
    if (row.status === 'serving') {
      countersById[row.counter_id].serving = ticket;
    } else {
      countersById[row.counter_id].waiting.push(ticket);
    }
  });

  return Object.values(countersById);
}

module.exports = { getQueueSnapshot };
