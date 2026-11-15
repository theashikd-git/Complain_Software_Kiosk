// Parses a hospital duty-roster Excel sheet into per-employee, per-day
// shift codes, ready to be matched against the `shifts` and `employees`
// tables and written into `counter_assignments` by
// src/routes/admin/roster.js's POST /import handler.
//
// The sheets this is built for (see the "Front Desk Executive" August
// 2026 roster) share a consistent shape: a header row with "SL" and a
// name column followed by weekday abbreviations, a day-number row
// (1-31) directly under it, then one row per employee with a shift
// code (M/LM/E/LE/N/O...) in the cell for each day they worked. Real
// hospital workbooks are messy in other ways though — extra stale template
// sheets, inconsistent title text, occasional typos — so this only
// assumes the header/day-row/employee-row shape, not anything about
// sheet names or titles.
//
// The November 2026 roster also puts a SECOND row under each employee
// (no SL number, designation in the name column) holding the counter
// short code for each day (EMG, GF C, RD...). When that row is present it
// is read as the day's counter; older single-row rosters still parse.
//
// Codes are NOT validated here — which shift codes and counter codes exist
// is up to the database, checked by the import route.
const XLSX = require('xlsx');

function readWorkbook(buffer) {
  return XLSX.read(buffer, { type: 'buffer' });
}

// Returns the list of sheet names in the workbook, in file order.
function listSheets(buffer) {
  return readWorkbook(buffer).SheetNames;
}

function isDayNumber(cell) {
  if (cell === null || cell === undefined || cell === '') return false;
  const n = Number(cell);
  return Number.isInteger(n) && n >= 1 && n <= 31;
}

// Parses one sheet into
// { employeeRows: [{ name, designation, days: { [day]: { code, place } } }] },
// where code is the upper-cased shift code and place the counter short code
// from the row underneath (null when absent).
// Throws a descriptive Error if the sheet doesn't look like a roster at all.
function parseRosterSheet(buffer, sheetName) {
  const wb = readWorkbook(buffer);
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error(`Sheet "${sheetName}" was not found in this workbook.`);
  }

  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Header row: first row with a cell that reads exactly "SL". Also record
  // which column that was in — real employee rows have a serial number in
  // this column, which is what tells them apart from stray trailing rows
  // below the table (legend text, notes) that otherwise look like data
  // because they have something in the name column.
  let headerRowIdx = -1;
  let slColIdx = 0;
  for (let i = 0; i < grid.length; i++) {
    const row = grid[i] || [];
    const idx = row.findIndex((c) => typeof c === 'string' && c.trim().toUpperCase() === 'SL');
    if (idx !== -1) {
      headerRowIdx = i;
      slColIdx = idx;
      break;
    }
  }
  if (headerRowIdx === -1) {
    throw new Error('Could not find the header row (a cell reading "SL") in this sheet.');
  }

  // Day-number row: usually right under the header, but scan a couple
  // of rows down in case there's a spacer row in between.
  let dayRowIdx = -1;
  for (let i = headerRowIdx + 1; i <= Math.min(headerRowIdx + 3, grid.length - 1); i++) {
    const row = grid[i] || [];
    const numericCount = row.filter(isDayNumber).length;
    if (numericCount >= 5) {
      dayRowIdx = i;
      break;
    }
  }
  if (dayRowIdx === -1) {
    throw new Error('Could not find the row of day numbers (1-31) under the header row.');
  }

  const dayRow = grid[dayRowIdx] || [];
  const dayColumns = [];
  dayRow.forEach((cell, colIdx) => {
    if (isDayNumber(cell)) dayColumns.push({ colIdx, day: Number(cell) });
  });

  // Name column: whichever header cell reads like a name column;
  // falls back to column 1 (SL is almost always column 0).
  const headerRow = grid[headerRowIdx] || [];
  let nameColIdx = 1;
  for (let i = 0; i < headerRow.length; i++) {
    if (typeof headerRow[i] === 'string' && /name/i.test(headerRow[i])) {
      nameColIdx = i;
      break;
    }
  }

  const employeeRows = [];

  const cellText = (row, colIdx) => {
    const raw = row[colIdx];
    return raw === null || raw === undefined ? '' : String(raw).trim();
  };
  const hasSl = (row) => {
    const v = row[slColIdx];
    return v !== null && v !== undefined && v !== '' && Number.isInteger(Number(v));
  };

  for (let r = dayRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    // A real employee row has a serial number in the SL column. Rows
    // without one are skipped rather than treated as data — this is what
    // keeps trailing legend/note text below the table (which often still
    // has *something* in the name column) from being read as an employee.
    if (!hasSl(row)) continue;

    const name = cellText(row, nameColIdx);
    if (!name) continue;

    // The row right underneath belongs to this employee only if it has no SL
    // of its own AND has something in a day column — a "Note :" row below
    // the last employee of an old single-row roster has neither.
    const next = grid[r + 1] || [];
    const placeRow = !hasSl(next) && dayColumns.some(({ colIdx }) => cellText(next, colIdx) !== '') ? next : null;

    const days = {};
    dayColumns.forEach(({ colIdx, day }) => {
      const code = cellText(row, colIdx).toUpperCase();
      if (!code) return;
      const place = placeRow ? cellText(placeRow, colIdx).replace(/\s+/g, ' ').toUpperCase() : '';
      days[day] = { code, place: place || null };
    });

    employeeRows.push({ name, designation: placeRow ? cellText(placeRow, nameColIdx) : '', days });
  }

  if (!employeeRows.length) {
    throw new Error('No employee rows with data were found under the header.');
  }

  return { employeeRows };
}

module.exports = { listSheets, parseRosterSheet };
