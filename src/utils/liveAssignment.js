// Shared logic for "who is actually on duty at a counter right now."
//
// Used by both the Counters page (admin/js/counters.js, via
// GET /api/admin/counters) and the complaint-submission flow
// (src/routes/public.js) so the two never disagree with each other.
//
// Design: rather than writing a "current employee" value onto
// counters.assigned_employee_id whenever a roster row is created (the old
// approach), this computes it fresh on every read by matching today's roster
// entries against the current wall-clock time against each shift's
// start_time/end_time. This is what makes it genuinely real-time — a roster
// entry for "Afternoon: Mr. Lipon" takes effect the moment the Afternoon
// shift's time window starts, with no separate sync step needed, and stops
// applying the moment that window ends.
//
// If no roster shift is currently active for a counter (a gap between
// shifts, or the admin just hasn't used the Roster page for that counter),
// this falls back to counters.assigned_employee_id, which stays available as
// a manual "default assignment" settable directly on the Counters page.
//
// Overnight shifts (e.g. Night 20:00–08:00, where start_time > end_time) are
// handled as two cases: the shift is active later today (today's date, time
// >= start_time) or it's active in the early hours of today but was entered
// under yesterday's date (yesterday's date, time < end_time).
// s.is_off = FALSE excludes pseudo-shifts like "Off Duty" (added for Excel
// roster imports, see migration_roster_import.sql) — they have no real
// working hours, so they should never count as someone being "on duty."
const LIVE_MATCH_SQL = `
  (
    s.is_off = FALSE
    AND (
      (s.start_time <= s.end_time AND ca.shift_date = CURRENT_DATE
        AND CURRENT_TIME BETWEEN s.start_time AND s.end_time)
      OR
      (s.start_time > s.end_time AND ca.shift_date = CURRENT_DATE
        AND CURRENT_TIME >= s.start_time)
      OR
      (s.start_time > s.end_time AND ca.shift_date = CURRENT_DATE - INTERVAL '1 day'
        AND CURRENT_TIME < s.end_time)
    )
  )
`;

// Returns { [counter_id]: { employeeId, isLive } } for the given counter ids.
// employeeId is null if nobody is assigned at all (no active roster match and
// no manual fallback). isLive is true when the value came from an
// active-right-now roster entry, false when it fell back to the counter's
// manually-set assigned_employee_id.
async function getEffectiveAssignments(db, counterIds) {
  if (!counterIds.length) return {};
  const { rows } = await db.query(
    `SELECT c.id AS counter_id,
            live.employee_id AS live_employee_id,
            c.assigned_employee_id AS manual_employee_id
     FROM counters c
     LEFT JOIN LATERAL (
       SELECT ca.employee_id
       FROM counter_assignments ca
       JOIN shifts s ON s.id = ca.shift_id
       WHERE ca.counter_id = c.id AND ${LIVE_MATCH_SQL}
       ORDER BY ca.id DESC
       LIMIT 1
     ) live ON true
     WHERE c.id = ANY($1::int[])`,
    [counterIds]
  );
  const map = {};
  rows.forEach((r) => {
    const isLive = r.live_employee_id !== null;
    map[r.counter_id] = {
      employeeId: isLive ? r.live_employee_id : r.manual_employee_id,
      isLive
    };
  });
  return map;
}

// Returns the single counter_assignments row currently "live" for one
// counter (the same row getEffectiveAssignments() would pick), or null if no
// roster shift covers the current time for that counter. Used when an admin
// edits the Counters page's "Assigned Employee (Now)" dropdown directly: if
// a roster shift is active right now, the edit updates *that* roster row (so
// the change is immediately visible and stays consistent with the Roster
// page); otherwise it falls through to updating the counter's manual
// default instead.
async function getLiveRosterRow(db, counterId) {
  const { rows } = await db.query(
    `SELECT ca.id, ca.employee_id
     FROM counter_assignments ca
     JOIN shifts s ON s.id = ca.shift_id
     WHERE ca.counter_id = $1 AND ${LIVE_MATCH_SQL}
     ORDER BY ca.id DESC
     LIMIT 1`,
    [counterId]
  );
  return rows[0] || null;
}

module.exports = { getEffectiveAssignments, getLiveRosterRow };
