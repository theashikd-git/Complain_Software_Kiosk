const express = require('express');
const router = express.Router();
const db = require('../../config/db');

// GET /api/admin/employees
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM employees ORDER BY full_name');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching employees:', err);
    res.status(500).json({ error: 'Could not load employees.' });
  }
});

// POST /api/admin/employees — create an employee
router.post('/', async (req, res) => {
  try {
    const { employee_code, full_name, designation, phone } = req.body;
    if (!employee_code || !full_name) {
      return res.status(400).json({ error: 'Employee code and name are required.' });
    }
    const { rows } = await db.query(
      'INSERT INTO employees (employee_code, full_name, designation, phone) VALUES ($1, $2, $3, $4) RETURNING id',
      [employee_code.trim(), full_name.trim(), designation?.trim() || null, phone?.trim() || null]
    );
    res.status(201).json({ id: rows[0].id, employee_code, full_name, designation, phone });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'An employee with this code already exists.' });
    }
    console.error('Error creating employee:', err);
    res.status(500).json({ error: 'Could not create employee.' });
  }
});

// PUT /api/admin/employees/:id
router.put('/:id', async (req, res) => {
  try {
    const { employee_code, full_name, designation, phone, is_active } = req.body;
    await db.query(
      'UPDATE employees SET employee_code = $1, full_name = $2, designation = $3, phone = $4, is_active = $5 WHERE id = $6',
      [employee_code, full_name, designation, phone, is_active, req.params.id]
    );
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
