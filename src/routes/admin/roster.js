const express = require('express');
const router = express.Router();
const multer = require('multer');
const db = require('../../config/db');
const { listSheets, parseRosterSheet } = require('../../utils/rosterImport');
const { findOverlappingAssignment } = require('../../utils/rosterOverlap');

// GET /api/admin/roster?date=2026-08-09 — all assignments for a given date,
// grouped by counter, so the admin UI can show "Counter 1: Rahim, Karim".
// GET /api/admin/roster?unassigned=1 — every assignment across ALL dates
// (not filtered to any one day), so the admin can work through a whole
// imported month in one table instead of paging through each date. Despite
// the query-param name (kept for frontend compatibility), this does NOT
// filter out rows that already have a counter — it used to (WHERE
// ca.counter_id IS NULL), which meant a row visibly disappeared from this
// exact table the moment an admin finished assigning it, with no trace it
// had ever been there. Reported repeatedly as "the row hides/vanishes when
// I assign a counter — I want it to stay shown." Now every row for every
// date is always included; ones still missing a counter show the inline
// assign dropdown (via counterCellHtml on the frontend), ones already
// assigned show their counter as plain text, exactly like the Daily view.
router.get('/', async (req, res) => {
  try {
    if (req.query.unassigned === '1') {
      const { rows } = await db.query(
        `SELECT ca.id, ca.shift_date,
                c.id AS counter_id, c.counter_number, c.counter_name,
                e.id AS employee_id, e.full_name AS employee_name, e.employee_code,
                s.id AS shift_id, s.shift_name, s.start_time, s.end_time, s.is_off
         FROM counter_assignments ca
         LEFT JOIN counters c ON c.id = ca.counter_id
         JOIN employees e ON e.id = ca.employee_id
         JOIN shifts s    ON s.id = ca.shift_id
         ORDER BY ca.shift_date, e.full_name`
      );
      return res.json(rows);
    }

    const date = req.query.date || new Date().toISOString().slice(0, 10);
    const { rows } = await db.query(
      `SELECT ca.id, ca.shift_date,
              c.id AS counter_id, c.counter_number, c.counter_name,
              e.id AS employee_id, e.full_name AS employee_name, e.employee_code,
              s.id AS shift_id, s.shift_name, s.start_time, s.end_time, s.is_off
       FROM counter_assignments ca
       LEFT JOIN counters c ON c.id = ca.counter_id
       JOIN employees e ON e.id = ca.employee_id
       JOIN shifts s    ON s.id = ca.shift_id
       WHERE ca.shift_date = $1
       ORDER BY (c.counter_number IS NULL), c.counter_number, s.start_time`,
      [date]
    );
    res.json(rows);
  } catch (err) {
    console.error('Error fetching roster:', err);
    res.status(500).json({ error: 'Could not load roster.' });
  }
});

// POST /api/admin/roster — assign one employee to one counter for a shift.
// Call this once per employee — a counter with 3 employees on one shift
// means 3 rows, which is what makes "multiple employees per counter" work.
//
// This does NOT write anything to counters.assigned_employee_id. That used
// to happen here (write-time sync — whichever roster row was POSTed most
// recently for today/a future date "won"), but it caused a real bug: if the
// Morning shift's employee was entered before the Afternoon shift's, the
// Counters page kept showing the Morning employee all afternoon, because
// nothing ever re-checked which shift's time window was actually current.
// The Counters page now computes "who's on duty right now" itself, live, by
// matching the current time against each roster entry's shift window (see
// src/utils/liveAssignment.js) — so a new roster row here takes effect
// automatically the moment its shift starts, with no sync step needed.
router.post('/', async (req, res) => {
  try {
    const { counter_id, employee_id, shift_date, shift_id } = req.body;
    if (!counter_id || !employee_id || !shift_date || !shift_id) {
      return res.status(400).json({ error: 'Counter, employee, date, and shift are required.' });
    }

    // An employee can work more than one shift a day (see
    // migration_multi_shift.sql) but must never be double-booked at two
    // different counters during overlapping time windows on the same day —
    // check this before inserting rather than relying only on the unique
    // constraint below, since that constraint only catches a literal
    // duplicate shift_id, not two different-but-overlapping shifts.
    const { rows: shiftRows } = await db.query(
      'SELECT id, start_time, end_time, is_off FROM shifts WHERE id = $1',
      [shift_id]
    );
    if (!shiftRows.length) {
      return res.status(400).json({ error: 'Invalid shift.' });
    }
    const conflict = await findOverlappingAssignment(db, {
      employeeId: employee_id,
      shiftDate: shift_date,
      targetShift: shiftRows[0]
    });
    if (conflict) {
      return res.status(409).json({
        error: `This employee already has an overlapping shift on ${shift_date}: ${conflict.shift_name} at ${
          conflict.counter_number ? `${conflict.counter_number} — ${conflict.counter_name}` : 'no counter yet'
        }.`
      });
    }

    const { rows } = await db.query(
      `INSERT INTO counter_assignments (counter_id, employee_id, shift_date, shift_id)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [counter_id, employee_id, shift_date, shift_id]
    );

    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      // An employee CAN have more than one shift on the same day (see
      // migration_multi_shift.sql) — this only fires for a literal
      // duplicate: this exact same shift already assigned to this
      // employee on this date.
      return res.status(409).json({ error: 'This employee is already assigned to this exact shift on that date.' });
    }
    console.error('Error creating roster assignment:', err);
    res.status(500).json({ error: 'Could not save assignment.' });
  }
});

// --------------------------------------------------------------------
// Excel roster import.
//
// Flow: admin uploads a .xlsx duty roster + picks the month/year it's
// for. If the workbook has more than one sheet, the first call comes
// back with { needsSheetSelection: true, sheets: [...] } instead of
// importing anything — the admin UI shows a dropdown and re-submits
// the same file with `sheetName` set. Real workbooks here tend to
// carry several old/blank template sheets alongside the real one
// (see the August 2026 file this was built against: 5 sheets, only
// one with actual data), so we never guess which sheet to use.
//
// Every row/day cell becomes one counter_assignments row with
// counter_id = NULL — the admin assigns the counter afterwards from
// the Roster page's "All Entries" view. Re-importing the exact same
// file is a no-op (ON CONFLICT (employee_id, shift_date, shift_id) DO
// NOTHING — that row already exists), and any counter already
// assigned to a row is always left untouched either way.
//
// IMPORTANT — since migration_multi_shift.sql, an employee can have
// more than one shift on the same day, so this is NOT as automatically
// self-correcting as it used to be: if a shift CODE for an
// employee/day changes between two imports (e.g. the sheet is
// corrected from "M" to "E"), the corrected row no longer matches the
// old row's conflict target (employee_id, shift_date, shift_id all
// three must match) — so re-importing ADDS the corrected shift as a
// new row instead of replacing the old, now-wrong one. That old row
// has to be removed by hand from the Roster page. To make this
// visible rather than silent, the import response includes
// `multipleShiftsWarnings`: every employee/date touched by this
// import that now has more than one shift on file, so the admin can
// go check whether that's intentional (a real double-shift day) or
// leftover from a correction.
// --------------------------------------------------------------------
const importUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error('Please upload an .xlsx or .xls file.'), ok);
  }
});

router.post('/import', (req, res) => {
  importUpload.single('file')(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || 'Could not read the uploaded file.' });
    }
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      const month = Number(req.body.month);
      const year = Number(req.body.year);
      if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(year) || year < 2000) {
        return res.status(400).json({ error: 'Choose a valid month and year for this roster.' });
      }

      let sheets;
      try {
        sheets = listSheets(req.file.buffer);
      } catch (parseErr) {
        return res.status(400).json({ error: 'Could not read this file as an Excel workbook.' });
      }
      if (!sheets.length) {
        return res.status(400).json({ error: 'This workbook has no sheets.' });
      }

      let sheetName = req.body.sheetName;
      if (!sheetName) {
        if (sheets.length === 1) {
          sheetName = sheets[0];
        } else {
          return res.json({ needsSheetSelection: true, sheets });
        }
      }

      let parsed;
      try {
        parsed = parseRosterSheet(req.file.buffer, sheetName);
      } catch (parseErr) {
        return res.status(400).json({ error: parseErr.message });
      }

      const daysInMonth = new Date(year, month, 0).getDate();

      // Every distinct code actually used in the sheet must already have a
      // matching shift configured (by shift_code) — better to block the
      // whole import with a clear message than silently leave some days
      // with no shift because a code wasn't recognized.
      const usedCodes = new Set();
      parsed.employeeRows.forEach((e) => Object.values(e.days).forEach((c) => usedCodes.add(c)));

      let shiftByCode = {};
      if (usedCodes.size) {
        const { rows: shiftRows } = await db.query(
          'SELECT id, shift_code FROM shifts WHERE shift_code = ANY($1::text[])',
          [Array.from(usedCodes)]
        );
        shiftByCode = Object.fromEntries(shiftRows.map((s) => [s.shift_code, s.id]));
      }
      const missingCodes = Array.from(usedCodes).filter((c) => !shiftByCode[c]);
      if (missingCodes.length) {
        return res.status(400).json({
          error: `These shift codes aren't set up yet: ${missingCodes.join(', ')}. Add a matching Shift Code to a shift on the Shifts page, then re-import.`
        });
      }

      // Match employee names against the employees table — exact match,
      // ignoring case and surrounding whitespace. A name that doesn't
      // match isn't fatal to the whole import; that employee's rows are
      // just skipped and reported back so the admin can fix the sheet or
      // the employee record and re-import.
      const { rows: employees } = await db.query('SELECT id, full_name FROM employees');
      const employeeByName = new Map(employees.map((e) => [e.full_name.trim().toLowerCase(), e.id]));

      const toInsert = [];
      const unmatchedEmployees = [];
      const skippedInvalidDays = [];

      parsed.employeeRows.forEach((row) => {
        const employeeId = employeeByName.get(row.name.toLowerCase());
        if (!employeeId) {
          unmatchedEmployees.push(row.name);
          return;
        }
        Object.entries(row.days).forEach(([dayStr, code]) => {
          const day = Number(dayStr);
          if (day > daysInMonth) {
            skippedInvalidDays.push(`${row.name}, day ${day} (${month}/${year} only has ${daysInMonth} days)`);
            return;
          }
          const shift_date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          toInsert.push({ employee_id: employeeId, shift_date, shift_id: shiftByCode[code] });
        });
      });

      if (!toInsert.length) {
        return res.status(400).json({
          error: 'Nothing to import — no rows matched an existing employee.',
          unmatchedEmployees
        });
      }

      const client = await db.connect();
      try {
        await client.query('BEGIN');
        for (const row of toInsert) {
          await client.query(
            `INSERT INTO counter_assignments (employee_id, shift_date, shift_id, counter_id)
             VALUES ($1, $2, $3, NULL)
             ON CONFLICT (employee_id, shift_date, shift_id)
             DO NOTHING`,
            [row.employee_id, row.shift_date, row.shift_id]
          );
        }
        await client.query('COMMIT');
      } catch (dbErr) {
        await client.query('ROLLBACK');
        console.error('Error importing roster:', dbErr);
        return res.status(500).json({ error: 'Could not import roster — no changes were made.' });
      } finally {
        client.release();
      }

      // See the multi-shift note above: check every distinct (employee,
      // date) this import touched for whether that employee now has
      // MORE THAN ONE shift on file for that day. This can legitimately
      // mean an intentional double shift, or it can mean a corrected
      // Excel re-import left a stale old shift behind — either way it's
      // worth surfacing rather than leaving it silent.
      const touchedPairs = new Map(); // "employeeId|date" -> {employee_id, shift_date}
      toInsert.forEach((row) => touchedPairs.set(`${row.employee_id}|${row.shift_date}`, row));
      const employeeIds = [...touchedPairs.values()].map((r) => r.employee_id);
      const shiftDates = [...touchedPairs.values()].map((r) => r.shift_date);

      let multipleShiftsWarnings = [];
      if (employeeIds.length) {
        const { rows: multiRows } = await db.query(
          `SELECT e.full_name, ca.shift_date,
                  array_agg(s.shift_name ORDER BY s.start_time) AS shift_names
           FROM counter_assignments ca
           JOIN employees e ON e.id = ca.employee_id
           JOIN shifts s ON s.id = ca.shift_id
           JOIN (SELECT unnest($1::int[]) AS employee_id, unnest($2::date[]) AS shift_date) touched
             ON touched.employee_id = ca.employee_id AND touched.shift_date = ca.shift_date
           GROUP BY ca.employee_id, ca.shift_date, e.full_name
           HAVING COUNT(*) > 1
           ORDER BY ca.shift_date, e.full_name`,
          [employeeIds, shiftDates]
        );
        multipleShiftsWarnings = multiRows.map(
          (r) => `${r.full_name} now has ${r.shift_names.length} shifts on ${r.shift_date} (${r.shift_names.join(', ')})`
        );
      }

      res.json({
        success: true,
        sheetName,
        imported: toInsert.length,
        unmatchedEmployees,
        skippedInvalidDays,
        warnings: parsed.warnings,
        multipleShiftsWarnings
      });
    } catch (outerErr) {
      console.error('Error importing roster:', outerErr);
      res.status(500).json({ error: 'Could not import roster.' });
    }
  });
});

// PUT /api/admin/roster/:id — edit a roster row.
//
// Two shapes of caller, both handled by this one route:
//   1. The inline "Assign" control (Daily/All Entries counter cell), which
//      sends only { counter_id } to finish off an Excel-imported entry (no
//      counter yet) or move a manual entry to a different counter. Shift and
//      employee are left exactly as they were — no conflict is possible just
//      from changing which counter a row points at, so this path skips the
//      overlap check entirely (unchanged from before this route grew a
//      second shape).
//   2. The Roster page's Edit button (Daily view and All Entries — both
//      share the same rowHtml() on the frontend), which sends
//      { counter_id, shift_id, employee_id } to change the shift and/or
//      employee on an existing row, not just its counter. Editing is only
//      ever offered by the frontend for today-or-future rows, but that's
//      just a UI convenience — this route re-checks shift_date itself so a
//      past row can never be edited even via a direct API call.
router.put('/:id', async (req, res) => {
  try {
    const { rows: existingRows } = await db.query(
      `SELECT id, counter_id, employee_id, shift_id, shift_date,
              (shift_date >= CURRENT_DATE) AS editable
       FROM counter_assignments WHERE id = $1`,
      [req.params.id]
    );
    if (!existingRows.length) {
      return res.status(404).json({ error: 'Roster entry not found.' });
    }
    const existing = existingRows[0];

    const editingShiftOrEmployee =
      Object.prototype.hasOwnProperty.call(req.body, 'shift_id') ||
      Object.prototype.hasOwnProperty.call(req.body, 'employee_id');

    // Past entries can't be edited at all — enforced here (not just hidden
    // on the frontend) so a direct API call can't bypass it either. Compares
    // against the database's own CURRENT_DATE, matching qserver's real OS
    // timezone (Asia/Dhaka) rather than trusting the caller's clock — see
    // the qserver-timezone lesson in the project notes for why that matters.
    if (editingShiftOrEmployee && !existing.editable) {
      return res.status(400).json({ error: 'Past roster entries can\'t be edited.' });
    }

    const counter_id = Object.prototype.hasOwnProperty.call(req.body, 'counter_id')
      ? req.body.counter_id || null
      : existing.counter_id;
    const shift_id = req.body.shift_id || existing.shift_id;
    const employee_id = req.body.employee_id || existing.employee_id;

    // Re-check for an overlap whenever the edit form was used (shift and/or
    // employee present in the body), even if the saved values happen to
    // match what was already there — cheap read-only query, and avoids
    // fragile string-vs-number comparisons between the DB's ids and the
    // frontend's <select> values.
    if (editingShiftOrEmployee) {
      const { rows: shiftRows } = await db.query(
        'SELECT id, start_time, end_time, is_off FROM shifts WHERE id = $1',
        [shift_id]
      );
      if (!shiftRows.length) {
        return res.status(400).json({ error: 'Invalid shift.' });
      }
      const conflict = await findOverlappingAssignment(db, {
        employeeId: employee_id,
        shiftDate: existing.shift_date,
        targetShift: shiftRows[0],
        excludeRowId: existing.id
      });
      if (conflict) {
        return res.status(409).json({
          error: `This employee already has an overlapping shift on ${existing.shift_date}: ${conflict.shift_name} at ${
            conflict.counter_number ? `${conflict.counter_number} — ${conflict.counter_name}` : 'no counter yet'
          }.`
        });
      }
    }

    await db.query(
      'UPDATE counter_assignments SET counter_id = $1, shift_id = $2, employee_id = $3 WHERE id = $4',
      [counter_id, shift_id, employee_id, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      return res.status(409).json({ error: 'This employee is already assigned to that exact shift on that date.' });
    }
    console.error('Error editing roster entry:', err);
    res.status(500).json({ error: 'Could not save changes.' });
  }
});

// DELETE /api/admin/roster/:id — remove one assignment
router.delete('/:id', async (req, res) => {
  try {
    await db.query('DELETE FROM counter_assignments WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting assignment:', err);
    res.status(500).json({ error: 'Could not remove assignment.' });
  }
});

module.exports = router;
