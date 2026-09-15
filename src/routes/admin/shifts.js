const express = require('express');
const router = express.Router();
const db = require('../../config/db');

// GET /api/admin/shifts — list all shifts (including inactive, for management)
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM shifts ORDER BY start_time');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching shifts:', err);
    res.status(500).json({ error: 'Could not load shifts.' });
  }
});

// POST /api/admin/shifts — create a shift
router.post('/', async (req, res) => {
  try {
    const { shift_name, start_time, end_time, shift_code } = req.body;
    if (!shift_name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Shift name, start time, and end time are required.' });
    }
    const code = shift_code ? shift_code.trim().toUpperCase() : null;
    const { rows } = await db.query(
      'INSERT INTO shifts (shift_name, start_time, end_time, shift_code) VALUES ($1, $2, $3, $4) RETURNING id',
      [shift_name.trim(), start_time, end_time, code]
    );
    res.status(201).json({ id: rows[0].id, shift_name: shift_name.trim(), start_time, end_time, shift_code: code });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'A shift with this name or code already exists.' });
    }
    console.error('Error creating shift:', err);
    res.status(500).json({ error: 'Could not create shift.' });
  }
});

// PUT /api/admin/shifts/:id — edit a shift (name, times, active status).
// shift_code is only touched when the caller explicitly includes it in the
// request body — the Active/Inactive toggle on the Shifts page doesn't send
// it, so toggling status can never accidentally wipe out a shift's code
// (this route used to overwrite every column unconditionally; see the
// Employees/Counters PUT routes for the same fix applied earlier).
router.put('/:id', async (req, res) => {
  try {
    const { shift_name, start_time, end_time, is_active } = req.body;
    if (Object.prototype.hasOwnProperty.call(req.body, 'shift_code')) {
      const code = req.body.shift_code ? req.body.shift_code.trim().toUpperCase() : null;
      await db.query(
        'UPDATE shifts SET shift_name = $1, start_time = $2, end_time = $3, is_active = $4, shift_code = $5 WHERE id = $6',
        [shift_name, start_time, end_time, is_active, code, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE shifts SET shift_name = $1, start_time = $2, end_time = $3, is_active = $4 WHERE id = $5',
        [shift_name, start_time, end_time, is_active, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'A shift with this name or code already exists.' });
    }
    console.error('Error updating shift:', err);
    res.status(500).json({ error: 'Could not update shift.' });
  }
});

// DELETE /api/admin/shifts/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM shifts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting shift:', err);
    res.status(500).json({ error: 'Could not delete shift. It may still be used in the roster — deactivate it instead, or remove those roster entries first.' });
  }
});

module.exports = router;
