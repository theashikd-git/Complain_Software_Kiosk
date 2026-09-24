// Staff console — a separate login from the admin panel, for the
// employees actually working the counters day to day. An employee logs
// in (employee_code + password), picks which counter they're working
// (for that login session only), then sees just their own counter's
// Now Serving number and waiting list with a single "Call Next" button.
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../config/db');
const requireStaff = require('../middleware/requireStaff');
const { callNextForCounter } = require('../utils/callNext');

// A session's staffCounterId only records which counter THIS session
// picked — it says nothing about whether that claim still holds. If
// another employee force-took-over the same counter since, this
// session's own claim is stale and must stop working immediately, or
// two people could call numbers for the same counter at once (exactly
// what the takeover warning is supposed to prevent). Called before any
// read/action scoped to "my counter"; clears the stale session field
// and returns null if the claim no longer belongs to this session.
async function getOwnedCounterOrNull(req) {
  const counterId = req.session.staffCounterId;
  if (!counterId) return null;
  const { rows } = await db.query(
    'SELECT id, counter_number, counter_name, active_employee_id FROM counters WHERE id = $1',
    [counterId]
  );
  const counter = rows[0];
  if (!counter || counter.active_employee_id !== req.session.staff.id) {
    delete req.session.staffCounterId;
    return null;
  }
  return counter;
}

// POST /api/staff/login — employee_code doubles as the login id, so
// there's no separate username field for staff.
router.post('/login', async (req, res) => {
  try {
    const { employee_code, password } = req.body;
    if (!employee_code || !password) {
      return res.status(400).json({ error: 'Employee code and password are required.' });
    }

    const { rows } = await db.query(
      'SELECT id, employee_code, full_name, password_hash, is_active FROM employees WHERE employee_code = $1',
      [employee_code]
    );
    const employee = rows[0];

    // Same generic error whether the code doesn't exist, the account has
    // no password set yet, or the password is wrong — avoids telling an
    // attacker (or a confused staff member) which part is the problem.
    if (!employee || !employee.is_active || !employee.password_hash || !(await bcrypt.compare(password, employee.password_hash))) {
      return res.status(401).json({ error: 'Invalid employee code or password.' });
    }

    req.session.staff = {
      id: employee.id,
      employee_code: employee.employee_code,
      full_name: employee.full_name
    };
    // A fresh login always starts without a counter chosen yet, even if
    // this same session object somehow carried one from before.
    delete req.session.staffCounterId;

    res.json({ success: true, staff: req.session.staff });
  } catch (err) {
    console.error('Staff login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/staff/logout — frees the counter this employee was working
// (if any) so the next person can pick it up without a takeover warning.
router.post('/logout', async (req, res) => {
  try {
    if (req.session && req.session.staff && req.session.staffCounterId) {
      await db.query(
        'UPDATE counters SET active_employee_id = NULL, active_login_at = NULL WHERE id = $1 AND active_employee_id = $2',
        [req.session.staffCounterId, req.session.staff.id]
      );
    }
  } catch (err) {
    console.error('Error freeing counter on staff logout:', err);
    // Still log the session out even if this failed — a stuck "active"
    // flag can be taken over by the next login anyway (see select-counter).
  }
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/staff/me — used by the staff frontend to check session state
// and whether a counter has already been chosen this session.
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.staff) {
    return res.status(401).json({ error: 'Not logged in.' });
  }
  const counter = await getOwnedCounterOrNull(req);
  res.json({ staff: req.session.staff, counter, no_roster_duty: Boolean(counter && req.session.staffNoRosterDuty) });
});

// GET /api/staff/counters — list active counters for the picker screen,
// including who (if anyone) is currently logged in and working each one,
// so the frontend can warn before letting a second person take it over.
router.get('/counters', requireStaff, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.counter_number, c.counter_name,
              c.active_employee_id, e.full_name AS active_employee_name
       FROM counters c
       LEFT JOIN employees e ON e.id = c.active_employee_id
       WHERE c.is_active = TRUE
       ORDER BY c.counter_number`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching counters for staff:', err);
    res.status(500).json({ error: 'Could not load counters.' });
  }
});

// POST /api/staff/select-counter — claim a counter for this login
// session. If another employee is already active there, this refuses
// with 409 unless { force: true } is sent, which the frontend does only
// after the staff member confirms a takeover warning.
router.post('/select-counter', requireStaff, async (req, res) => {
  try {
    const counterId = Number(req.body.counter_id);
    const force = req.body.force === true;
    if (!Number.isInteger(counterId) || counterId <= 0) {
      return res.status(400).json({ error: 'Please choose a counter.' });
    }

    const { rows } = await db.query(
      `SELECT c.id, c.counter_number, c.counter_name, c.is_active,
              c.active_employee_id, e.full_name AS active_employee_name
       FROM counters c
       LEFT JOIN employees e ON e.id = c.active_employee_id
       WHERE c.id = $1`,
      [counterId]
    );
    const counter = rows[0];
    if (!counter || !counter.is_active) {
      return res.status(404).json({ error: 'That counter is not available.' });
    }

    const occupiedBySomeoneElse = counter.active_employee_id && counter.active_employee_id !== req.session.staff.id;
    if (occupiedBySomeoneElse && !force) {
      return res.status(409).json({
        error: 'occupied',
        occupied_by: counter.active_employee_name
      });
    }

    // Picking a counter also makes this employee that counter's assigned
    // employee (shown on the admin Counters page), replacing whoever was
    // there before, and an employee can only hold one counter at a time —
    // so any other counter still pointing at them is released first.
    // Logout deliberately leaves assigned_employee_id alone: the name
    // stays until the next employee logs in at that counter.
    // The name stays after logout only until the end of this employee's
    // rostered shift (latest end among today's/an overnight shift's still
    // running or upcoming, non-off shifts). No such shift = no roster duty,
    // so it expires the moment they log out, and they're told so.
    const { rows: shiftRows } = await db.query(
      `SELECT MAX(ca.shift_date + s.end_time
                  + CASE WHEN s.end_time <= s.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END) AS ends_at
       FROM counter_assignments ca
       JOIN shifts s ON s.id = ca.shift_id
       WHERE ca.employee_id = $1 AND s.is_off = FALSE
         AND ca.shift_date BETWEEN CURRENT_DATE - 1 AND CURRENT_DATE
         AND (ca.shift_date + s.end_time
              + CASE WHEN s.end_time <= s.start_time THEN INTERVAL '1 day' ELSE INTERVAL '0' END) > LOCALTIMESTAMP`,
      [req.session.staff.id]
    );
    const assignedUntil = shiftRows[0].ends_at; // null when no roster duty
    req.session.staffNoRosterDuty = !assignedUntil;

    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE counters SET assigned_employee_id = NULL WHERE assigned_employee_id = $1 AND id <> $2`,
        [req.session.staff.id, counterId]
      );
      await client.query(
        `UPDATE counters SET active_employee_id = NULL, active_login_at = NULL WHERE active_employee_id = $1 AND id <> $2`,
        [req.session.staff.id, counterId]
      );
      await client.query(
        `UPDATE counters
         SET active_employee_id = $1, active_login_at = CURRENT_TIMESTAMP, assigned_employee_id = $1,
             assigned_until = COALESCE($3::timestamp, LOCALTIMESTAMP)
         WHERE id = $2`,
        [req.session.staff.id, counterId, assignedUntil]
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    req.session.staffCounterId = counterId;

    res.json({
      success: true,
      counter: { id: counter.id, counter_number: counter.counter_number, counter_name: counter.counter_name }
    });
  } catch (err) {
    console.error('Error selecting counter:', err);
    res.status(500).json({ error: 'Could not select that counter.' });
  }
});

// GET /api/staff/queue — this session's counter only: its current Now
// Serving ticket (or null) and its waiting list, oldest first. No
// patient-identifying detail, same as the public display — just the
// serial number and service name.
router.get('/queue', requireStaff, async (req, res) => {
  try {
    const counter = await getOwnedCounterOrNull(req);
    if (!counter) {
      return res.status(409).json({ error: 'No counter selected.' });
    }

    const { rows } = await db.query(
      `SELECT qt.id AS ticket_id, qt.ticket_number, qt.status, s.service_name
       FROM queue_tickets qt
       JOIN services s ON s.id = qt.service_id
       WHERE qt.counter_id = $1 AND qt.ticket_date = CURRENT_DATE AND qt.status IN ('waiting', 'serving')
       ORDER BY qt.ticket_number ASC`,
      [counter.id]
    );

    const serving = rows.find((r) => r.status === 'serving') || null;
    const waiting = rows.filter((r) => r.status === 'waiting');

    res.json({ counter: { id: counter.id, counter_number: counter.counter_number, counter_name: counter.counter_name }, serving, waiting });
  } catch (err) {
    console.error('Error fetching staff queue:', err);
    res.status(500).json({ error: 'Could not load the queue.' });
  }
});

// POST /api/staff/call-next — always acts on this session's own
// selected counter (never a counter id from the request body), so an
// employee can only ever call numbers for the counter they're logged
// into. Triggers the exact same status change the admin Queue page's
// call-next does, which is what the public display's own poll-driven
// chime/voice/flash reacts to — no separate announcement plumbing
// needed here.
router.post('/call-next', requireStaff, async (req, res) => {
  try {
    const counter = await getOwnedCounterOrNull(req);
    if (!counter) {
      return res.status(409).json({ error: 'No counter selected.' });
    }
    const nextTicket = await callNextForCounter(db, counter.id, req.session.staff.id);
    res.json({ success: true, next_ticket: nextTicket });
  } catch (err) {
    console.error('Error calling next ticket (staff):', err);
    res.status(500).json({ error: 'Could not call the next ticket.' });
  }
});

module.exports = router;
