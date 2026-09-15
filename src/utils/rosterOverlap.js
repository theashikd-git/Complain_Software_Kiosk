// Shared "is this employee double-booked at the same time" check, used by
// both creating a roster assignment (POST /api/admin/roster) and editing one
// (PUT /api/admin/roster/:id) — an employee must never end up covering two
// different counters during overlapping shift windows on the same day.
//
// Two shifts on the SAME shift_date "overlap" if their time-of-day windows
// intersect. Overnight shifts (start_time > end_time, e.g. Night 22:00–09:00)
// are handled by splitting them into two same-day intervals ("start..24:00"
// and "00:00..end") — the whole overnight shift is recorded under a single
// shift_date (the day it begins, see liveAssignment.js), so this is the
// right approximation for "does this employee have two things going at once
// on this date." An Off Duty (is_off) shift never occupies any time and
// never conflicts with anything.
function toMinutes(t) {
  const [h, m] = String(t).split(':').map(Number);
  return h * 60 + m;
}

function intervalsFor(shift) {
  if (shift.is_off) return [];
  const s = toMinutes(shift.start_time);
  const e = toMinutes(shift.end_time);
  if (s < e) return [[s, e]];
  return [
    [s, 24 * 60],
    [0, e]
  ]; // overnight — wraps past midnight
}

function rangesOverlap(a, b) {
  return a[0] < b[1] && b[0] < a[1];
}

function shiftsOverlap(shiftA, shiftB) {
  const a = intervalsFor(shiftA);
  const b = intervalsFor(shiftB);
  return a.some((ra) => b.some((rb) => rangesOverlap(ra, rb)));
}

// Looks for an existing roster row for `employeeId` on `shiftDate` whose
// shift's time window overlaps `targetShift` — excluding `excludeRowId` (the
// row being edited, if any) and excluding Off Duty rows. Returns the
// conflicting row (with counter/shift names for a friendly error message) or
// null if there's no conflict.
async function findOverlappingAssignment(db, { employeeId, shiftDate, targetShift, excludeRowId }) {
  const { rows } = await db.query(
    `SELECT ca.id, s.shift_name, s.start_time, s.end_time, s.is_off,
            c.counter_number, c.counter_name
     FROM counter_assignments ca
     JOIN shifts s ON s.id = ca.shift_id
     LEFT JOIN counters c ON c.id = ca.counter_id
     WHERE ca.employee_id = $1 AND ca.shift_date = $2 AND ca.id != COALESCE($3, -1)`,
    [employeeId, shiftDate, excludeRowId || null]
  );
  return rows.find((r) => shiftsOverlap(targetShift, r)) || null;
}

module.exports = { shiftsOverlap, findOverlappingAssignment };
