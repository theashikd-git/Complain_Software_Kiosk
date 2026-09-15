const express = require('express');
const router = express.Router();
const db = require('../../config/db');

// GET /api/admin/reports?from=2026-08-01&to=2026-08-09&section=complain
// section is optional: 'satisfied' | 'complain' | omitted (both)
router.get('/', async (req, res) => {
  try {
    const { from, to, section } = req.query;

    const conditions = [];
    const params = [];

    // Postgres uses numbered placeholders ($1, $2, ...), so each condition
    // pushes its param first, then uses the new params.length as its index.
    if (from) {
      params.push(from);
      conditions.push(`DATE(s.submitted_at) >= $${params.length}`);
    }
    if (to) {
      params.push(to);
      conditions.push(`DATE(s.submitted_at) <= $${params.length}`);
    }
    if (section && ['satisfied', 'complain'].includes(section)) {
      params.push(section);
      conditions.push(`s.submission_type = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await db.query(
      `SELECT s.id, s.submission_type, s.rating, s.id_type, s.id_value,
              s.complaint_text, s.voice_file_path, s.submitted_at
       FROM submissions s
       ${whereClause}
       ORDER BY s.submitted_at DESC`,
      params
    );

    // Attach the counter(s) named on each complaint (satisfied rows have none),
    // and each counter-link's HISTORICAL employee snapshot
    // (submission_counters.assigned_employee_id) \u2014 frozen at the moment the
    // complaint was submitted. This is deliberately NOT a live lookup against
    // counters.assigned_employee_id: reassigning a counter to a different
    // employee later must not rewrite who past reports say was responsible.
    // The live counters.assigned_employee_id is only ever consulted once, in
    // src/routes/public.js, at the moment a new complaint is created.
    const complaintIds = rows.filter((r) => r.submission_type === 'complain').map((r) => r.id);
    let countersBySubmission = {};
    let employeesBySubmission = {};
    if (complaintIds.length > 0) {
      const { rows: links } = await db.query(
        `SELECT sc.submission_id, c.id AS counter_id, c.counter_number, c.counter_name,
                e.full_name AS assigned_employee_name
         FROM submission_counters sc
         JOIN counters c ON c.id = sc.counter_id
         LEFT JOIN employees e ON e.id = sc.assigned_employee_id
         WHERE sc.submission_id = ANY($1::int[])
         ORDER BY c.counter_number`,
        [complaintIds]
      );

      links.forEach((l) => {
        if (!countersBySubmission[l.submission_id]) countersBySubmission[l.submission_id] = [];
        countersBySubmission[l.submission_id].push(`${l.counter_number} \u00B7 ${l.counter_name}`);

        if (!employeesBySubmission[l.submission_id]) employeesBySubmission[l.submission_id] = [];
        employeesBySubmission[l.submission_id].push(l.assigned_employee_name || 'Unassigned');
      });
    }

    const results = rows.map((r) => ({
      ...r,
      counters: countersBySubmission[r.id] || [],
      employees: employeesBySubmission[r.id] || []
    }));

    // Summary counts + average rating, handy for a report header.
    const summary = results.reduce(
      (acc, row) => {
        acc[row.submission_type] = (acc[row.submission_type] || 0) + 1;
        if (row.submission_type === 'satisfied' && row.rating != null) {
          acc._ratingSum += row.rating;
          acc._ratingCount += 1;
        }
        return acc;
      },
      { satisfied: 0, complain: 0, _ratingSum: 0, _ratingCount: 0 }
    );
    summary.avg_rating = summary._ratingCount > 0 ? Math.round((summary._ratingSum / summary._ratingCount) * 10) / 10 : null;
    delete summary._ratingSum;
    delete summary._ratingCount;

    res.json({ summary, results });
  } catch (err) {
    console.error('Error generating report:', err);
    res.status(500).json({ error: 'Could not generate report.' });
  }
});

module.exports = router;
