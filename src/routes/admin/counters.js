const express = require('express');
const router = express.Router();
const db = require('../../config/db');
const { getEffectiveAssignments, getLiveRosterRow } = require('../../utils/liveAssignment');

// GET /api/admin/counters — list all counters (including inactive, for
// management). "assigned_employee_name"/"current_employee_id" reflect who is
// on duty RIGHT NOW: if a roster shift covering the current time is active
// for a counter, that employee wins; otherwise it falls back to the
// counter's manually-set assigned_employee_id. "assigned_employee_source"
// tells the frontend which one it got ('roster' or 'manual') so it can
// label it accordingly.
router.get('/', async (req, res) => {
  try {
    const { rows: counters } = await db.query('SELECT * FROM counters ORDER BY counter_number');
    const assignments = await getEffectiveAssignments(db, counters.map((c) => c.id));

    const employeeIds = [...new Set(Object.values(assignments).map((a) => a.employeeId).filter(Boolean))];
    let namesById = {};
    if (employeeIds.length) {
      const { rows: emps } = await db.query(
        'SELECT id, full_name FROM employees WHERE id = ANY($1::int[])',
        [employeeIds]
      );
      namesById = Object.fromEntries(emps.map((e) => [e.id, e.full_name]));
    }

    const result = counters.map((c) => {
      const a = assignments[c.id] || { employeeId: c.assigned_employee_id, isLive: false };
      return {
        ...c,
        current_employee_id: a.employeeId || null,
        assigned_employee_name: a.employeeId ? namesById[a.employeeId] || null : null,
        assigned_employee_source: a.employeeId ? (a.isLive ? 'roster' : 'manual') : null
      };
    });

    res.json(result);
  } catch (err) {
    console.error('Error fetching counters:', err);
    res.status(500).json({ error: 'Could not load counters.' });
  }
});

// PUT /api/admin/counters/:id/now — change who's assigned to a counter
// RIGHT NOW, from the single dropdown on the Counters page. This is smart
// about *where* that change needs to be written so it actually takes
// effect immediately and stays consistent with the Roster:
//   - If a roster shift is currently active for this counter, the edit
//     updates that specific counter_assignments row's employee — so the
//     Roster page reflects the same change, and the new employee is who
//     gets frozen onto any complaint filed for the rest of that shift.
//   - If no roster shift is currently active, the edit just sets the
//     counter's manual default (counters.assigned_employee_id), same as
//     before — it'll keep applying until a roster shift becomes active.
router.put('/:id/now', async (req, res) => {
  try {
    const { employee_id } = req.body;
    if (!employee_id) {
      return res.status(400).json({ error: 'Please choose an employee.' });
    }
    const counterId = req.params.id;
    const liveRow = await getLiveRosterRow(db, counterId);
    if (liveRow) {
      await db.query('UPDATE counter_assignments SET employee_id = $1 WHERE id = $2', [employee_id, liveRow.id]);
      return res.json({ success: true, source: 'roster' });
    }
    await db.query('UPDATE counters SET assigned_employee_id = $1 WHERE id = $2', [employee_id, counterId]);
    res.json({ success: true, source: 'manual' });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'That employee is already rostered on this counter for the active shift.' });
    }
    console.error('Error updating current employee:', err);
    res.status(500).json({ error: 'Could not update the assigned employee.' });
  }
});

// POST /api/admin/counters — create a counter. assigned_employee_id is
// optional (a counter can be created before anyone is assigned to it).
router.post('/', async (req, res) => {
  try {
    const { counter_number, counter_name, assigned_employee_id } = req.body;
    if (!counter_number || !counter_name) {
      return res.status(400).json({ error: 'Counter number and name are required.' });
    }
    const { rows } = await db.query(
      'INSERT INTO counters (counter_number, counter_name, assigned_employee_id) VALUES ($1, $2, $3) RETURNING id',
      [counter_number.trim(), counter_name.trim(), assigned_employee_id || null]
    );
    res.status(201).json({ id: rows[0].id, counter_number, counter_name, assigned_employee_id: assigned_employee_id || null });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'A counter with this number already exists.' });
    }
    console.error('Error creating counter:', err);
    res.status(500).json({ error: 'Could not create counter.' });
  }
});

// PUT /api/admin/counters/:id — edit a counter (name, number, active status,
// and/or its manual default employee). "assigned_employee_id" is only
// touched when the request body actually includes that key — e.g. the
// Counters page's Activate/Deactivate button intentionally omits it, so
// toggling status can never accidentally wipe out the counter's manual
// default. (Changing who's assigned *right now* goes through the dedicated
// PUT /:id/now route above instead, which knows whether to touch the
// roster or this manual default.)
router.put('/:id', async (req, res) => {
  try {
    const { counter_number, counter_name, is_active, assigned_employee_id } = req.body;
    if (Object.prototype.hasOwnProperty.call(req.body, 'assigned_employee_id')) {
      await db.query(
        'UPDATE counters SET counter_number = $1, counter_name = $2, is_active = $3, assigned_employee_id = $4 WHERE id = $5',
        [counter_number, counter_name, is_active, assigned_employee_id || null, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE counters SET counter_number = $1, counter_name = $2, is_active = $3 WHERE id = $4',
        [counter_number, counter_name, is_active, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating counter:', err);
    res.status(500).json({ error: 'Could not update counter.' });
  }
});

// DELETE /api/admin/counters/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM counters WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting counter:', err);
    res.status(500).json({ error: 'Could not delete counter. It may still have submissions or assignments linked to it.' });
  }
});

module.exports = router;
