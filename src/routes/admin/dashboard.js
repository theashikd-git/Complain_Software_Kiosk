const express = require('express');
const router = express.Router();
const db = require('../../config/db');

// GET /api/admin/dashboard/complaints?date=2026-08-09
// Powers the red "Complain" box: every complaint for the day, with the
// counter(s) it named and whoever was rostered on those counters that day.
router.get('/complaints', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);

    const { rows: complaints } = await db.query(
      `SELECT id, id_type, id_value, complaint_text, voice_file_path, submitted_at
       FROM submissions
       WHERE submission_type = 'complain' AND DATE(submitted_at) = $1
       ORDER BY submitted_at DESC`,
      [date]
    );

    if (complaints.length === 0) {
      return res.json([]);
    }

    const submissionIds = complaints.map((c) => c.id);

    // Which counter(s) each complaint named.
    const { rows: counterLinks } = await db.query(
      `SELECT sc.submission_id, c.id AS counter_id, c.counter_number, c.counter_name
       FROM submission_counters sc
       JOIN counters c ON c.id = sc.counter_id
       WHERE sc.submission_id = ANY($1::int[])`,
      [submissionIds]
    );

    const countersBySubmission = {};
    const allCounterIds = new Set();
    for (const link of counterLinks) {
      if (!countersBySubmission[link.submission_id]) countersBySubmission[link.submission_id] = [];
      countersBySubmission[link.submission_id].push({
        id: link.counter_id,
        counter_number: link.counter_number,
        counter_name: link.counter_name
      });
      allCounterIds.add(link.counter_id);
    }

    // Who was rostered on any of those counters, that same date.
    let employeesByCounter = {};
    if (allCounterIds.size > 0) {
      const { rows: assignments } = await db.query(
        `SELECT ca.counter_id, e.full_name
         FROM counter_assignments ca
         JOIN employees e ON e.id = ca.employee_id
         WHERE ca.shift_date = $1 AND ca.counter_id = ANY($2::int[])`,
        [date, [...allCounterIds]]
      );
      for (const a of assignments) {
        if (!employeesByCounter[a.counter_id]) employeesByCounter[a.counter_id] = [];
        employeesByCounter[a.counter_id].push(a.full_name);
      }
    }

    const enriched = complaints.map((c) => {
      const counters = countersBySubmission[c.id] || [];
      return {
        ...c,
        counters: counters.map((ct) => ({
          ...ct,
          assigned_employees: employeesByCounter[ct.id] || []
        }))
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('Error loading dashboard complaints:', err);
    res.status(500).json({ error: 'Could not load complaints.' });
  }
});

// GET /api/admin/dashboard/summary?date=2026-08-09 — quick counts for cards
router.get('/summary', async (req, res) => {
  try {
    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const { rows } = await db.query(
      `SELECT submission_type, COUNT(*) AS total, AVG(rating) AS avg_rating
       FROM submissions
       WHERE DATE(submitted_at) = $1
       GROUP BY submission_type`,
      [date]
    );
    // Patients served in the queue that day — tickets finished via
    // "Call Next" (status 'served'), across every counter.
    const { rows: servedRows } = await db.query(
      `SELECT COUNT(*) AS total FROM queue_tickets WHERE ticket_date = $1 AND status = 'served'`,
      [date]
    );
    const summary = { satisfied: 0, complain: 0, avg_rating: null, served: Number(servedRows[0].total) };
    rows.forEach((r) => {
      summary[r.submission_type] = Number(r.total);
      if (r.submission_type === 'satisfied' && r.avg_rating !== null) {
        summary.avg_rating = Math.round(Number(r.avg_rating) * 10) / 10;
      }
    });
    res.json(summary);
  } catch (err) {
    console.error('Error loading dashboard summary:', err);
    res.status(500).json({ error: 'Could not load summary.' });
  }
});

module.exports = router;
