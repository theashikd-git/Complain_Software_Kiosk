const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../../config/db');

// GET /api/admin/employees — password_hash is never sent to the
// browser; has_password just tells the frontend whether this employee
// can log into the staff console yet, without exposing the hash itself.
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, employee_code, full_name, designation, phone, is_active, created_at,
              (password_hash IS NOT NULL) AS has_password
       FROM employees ORDER BY full_name`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ error: 'Could not load employees.' });
  }
});

// POST /api/admin/employees — create an employee. password is optional:
// an employee can exist (e.g. for counter assignment/reporting) without
// ever being able to log into the staff console.
router.post('/', async (req, res) => {
  try {
    const { employee_code, full_name, designation, phone, password } = req.body;
    if (!employee_code || !full_name) {
      return res.status(400).json({ error: 'Employee code and name are required.' });
    }
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;
    const { rows } = await db.query(
      'INSERT INTO employees (employee_code, full_name, designation, phone, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [employee_code.trim(), full_name.trim(), designation?.trim() || null, phone?.trim() || null, passwordHash]
    );
    res.status(201).json({ id: rows[0].id, employee_code, full_name, designation, phone, has_password: Boolean(passwordHash) });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'An employee with this code already exists.' });
    }
    console.error('Error creating employee:', err);
    res.status(500).json({ error: 'Could not create employee.' });
  }
});

// PUT /api/admin/employees/:id — password is only ever touched when the
// request actually includes a non-empty one, so editing a name/phone/etc.
// (or leaving the password field blank on the edit form) never wipes out
// an employee's existing staff-console password.
router.put('/:id', async (req, res) => {
  try {
    const { employee_code, full_name, designation, phone, is_active, password } = req.body;
    if (password) {
      const passwordHash = await bcrypt.hash(password, 10);
      await db.query(
        'UPDATE employees SET employee_code = $1, full_name = $2, designation = $3, phone = $4, is_active = $5, password_hash = $6 WHERE id = $7',
        [employee_code, full_name, designation, phone, is_active, passwordHash, req.params.id]
      );
    } else {
      await db.query(
        'UPDATE employees SET employee_code = $1, full_name = $2, designation = $3, phone = $4, is_active = $5 WHERE id = $6',
        [employee_code, full_name, designation, phone, is_active, req.params.id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Error updating employee:', err);
    res.status(500).json({ error: 'Could not update employee.' });
  }
});

// DELETE /api/admin/employees/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting employee:', err);
    res.status(500).json({ error: 'Could not delete employee. They may still have shift assignments linked to them.' });
  }
});

module.exports = router;
