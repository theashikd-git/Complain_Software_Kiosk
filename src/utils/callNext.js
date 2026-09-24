// Shared "call next" logic — marks whichever ticket is currently
// "serving" at a counter as served, then promotes the oldest still-
// "waiting" ticket (by ticket_number) to "serving". Used by both the
// admin Queue page and the staff console, so the two can never drift
// apart on what "calling next" actually does.
async function callNextForCounter(db, counterId, servedByEmployeeId = null) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE queue_tickets SET status = 'served', served_at = CURRENT_TIMESTAMP, served_by_employee_id = $2
       WHERE counter_id = $1 AND ticket_date = CURRENT_DATE AND status = 'serving'`,
      [counterId, servedByEmployeeId]
    );

    const { rows: nextRows } = await client.query(
      `SELECT id FROM queue_tickets
       WHERE counter_id = $1 AND ticket_date = CURRENT_DATE AND status = 'waiting'
       ORDER BY ticket_number ASC
       LIMIT 1
       FOR UPDATE`,
      [counterId]
    );

    let nextTicket = null;
    if (nextRows.length) {
      const { rows: updated } = await client.query(
        `UPDATE queue_tickets SET status = 'serving', called_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id AS ticket_id, ticket_number, service_id`,
        [nextRows[0].id]
      );
      nextTicket = updated[0];
    }

    await client.query('COMMIT');
    return nextTicket;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { callNextForCounter };
