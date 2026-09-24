const express = require('express');
const router = express.Router();
const db = require('../../config/db');

// GET /api/admin/services — list all services (including inactive, for
// management and for the Counters page's service-tagging checkboxes)
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM services ORDER BY service_name');
    res.json(rows);
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).json({ error: 'Could not load services.' });
  }
});

// POST /api/admin/services — create a service
router.post('/', async (req, res) => {
  try {
    const { service_name } = req.body;
    if (!service_name || !service_name.trim()) {
      return res.status(400).json({ error: 'Service name is required.' });
    }
    const { rows } = await db.query(
      'INSERT INTO services (service_name) VALUES ($1) RETURNING id',
      [service_name.trim()]
    );
    res.status(201).json({ id: rows[0].id, service_name: service_name.trim(), is_active: true });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'A service with this name already exists.' });
    }
    console.error('Error creating service:', err);
    res.status(500).json({ error: 'Could not create service.' });
  }
});

// PUT /api/admin/services/:id — edit name and/or active status
router.put('/:id', async (req, res) => {
  try {
    const { service_name, is_active } = req.body;
    if (!service_name || !service_name.trim()) {
      return res.status(400).json({ error: 'Service name is required.' });
    }
    await db.query(
      'UPDATE services SET service_name = $1, is_active = $2 WHERE id = $3',
      [service_name.trim(), is_active, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'A service with this name already exists.' });
    }
    console.error('Error updating service:', err);
    res.status(500).json({ error: 'Could not update service.' });
  }
});

// DELETE /api/admin/services/:id
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM services WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).json({ error: 'Could not delete service. It may still be assigned to counters or used by existing queue tickets — deactivate it instead, or remove those links first.' });
  }
});

module.exports = router;
