const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const db = require('../../config/db');

// Patients served per employee: tickets finished via "Call Next" in the staff
// console, grouped by whoever pressed it. employee_id NULL = "not recorded"
// (finished from the admin Queue page, or served before this was tracked).
async function loadServedByEmployee(from, to) {
  const params = [];
  const conditions = ["qt.status = 'served'"];
  if (from) {
    params.push(from);
    conditions.push(`qt.ticket_date >= $${params.length}`);
  }
  if (to) {
    params.push(to);
    conditions.push(`qt.ticket_date <= $${params.length}`);
  }
  const { rows } = await db.query(
    `SELECT e.id AS employee_id, e.employee_code, e.full_name, e.designation, COUNT(*) AS served
     FROM queue_tickets qt
     LEFT JOIN employees e ON e.id = qt.served_by_employee_id
     WHERE ${conditions.join(' AND ')}
     GROUP BY e.id, e.employee_code, e.full_name, e.designation
     ORDER BY (e.id IS NULL), COUNT(*) DESC, e.full_name`,
    params
  );
  const list = rows.map((r) => ({ ...r, served: Number(r.served) }));
  return { total: list.reduce((sum, r) => sum + r.served, 0), rows: list };
}

// GET /api/admin/served-report?from=2026-09-01&to=2026-09-24
router.get('/', async (req, res) => {
  try {
    res.json(await loadServedByEmployee(req.query.from, req.query.to));
  } catch (err) {
    console.error('Error generating served report:', err);
    res.status(500).json({ error: 'Could not generate the report.' });
  }
});

// GET /api/admin/served-report/export?from=...&to=...  — same data as .xlsx
router.get('/export', async (req, res) => {
  try {
    const { from, to } = req.query;
    const { total, rows } = await loadServedByEmployee(from, to);

    const sheetRows = rows.map((r) => ({
      Employee: r.employee_id ? r.full_name : 'Not recorded (admin or older data)',
      Code: r.employee_id ? r.employee_code : '',
      Designation: r.employee_id ? r.designation || '' : '',
      'Patients served': r.served,
      'Share (%)': total ? Math.round((r.served / total) * 1000) / 10 : 0
    }));
    sheetRows.push({ Employee: 'Total', Code: '', Designation: '', 'Patients served': total, 'Share (%)': total ? 100 : 0 });

    const sheet = XLSX.utils.json_to_sheet(sheetRows);
    sheet['!cols'] = [{ wch: 36 }, { wch: 12 }, { wch: 22 }, { wch: 16 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, 'Patients served');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    const range = `${from || 'start'}_to_${to || 'today'}`.replace(/[^0-9A-Za-z_-]/g, '');
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="patients-served_${range}.xlsx"`
    });
    res.send(buffer);
  } catch (err) {
    console.error('Error exporting served report:', err);
    res.status(500).json({ error: 'Could not export the report.' });
  }
});

module.exports = router;
