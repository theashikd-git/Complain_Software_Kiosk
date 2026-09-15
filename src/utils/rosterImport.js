// Parses a hospital duty-roster Excel sheet into per-employee, per-day
// shift codes, ready to be matched against the `shifts` and `employees`
// tables and written into `counter_assignments` by
// src/routes/admin/roster.js's POST /import handler.
//
// The sheets this is built for (see the "Front Desk Executive" August
// 2026 roster) share a consistent shape: a header row with "SL" and a
// name column followed by weekday abbreviations, a day-number row
// (1-31) directly under it, then one row per employee with a shift
// code (G/M/E/N/O) in the cell for each day they worked. Real hospital
// workbooks are messy in other ways though — extra stale template
// sheets, inconsistent title text, occasional typos — so this only
// assumes the header/day-row/employee-row shape, not anything about
// sheet names or titles.
const XLSX = require('xlsx');

const CODE_SET = new Set(['G', 'M', 'E', 'N', 'O']);

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

// Parses one sheet into { employeeRows: [{ name, days: { [day]: code } }], warnings: [] }.
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
  const warnings = [];

  for (let r = dayRowIdx + 1; r < grid.length; r++) {
    const row = grid[r] || [];
    const rawSl = row[slColIdx];
    // A real employee row has a serial number in the SL column. Rows
    // without one are skipped rather than treated as data — this is what
    // keeps trailing legend/note text below the table (which often still
    // has *something* in the name column) from being read as an employee.
    if (rawSl === null || rawSl === undefined || rawSl === '' || !Number.isInteger(Number(rawSl))) continue;

    const rawName = row[nameColIdx];
    if (rawName === null || rawName === undefined || String(rawName).trim() === '') continue;
    const name = String(rawName).trim();

    const days = {};
    dayColumns.forEach(({ colIdx, day }) => {
      const raw = row[colIdx];
      if (raw === null || raw === undefined) return;
      const code = String(raw).trim().toUpperCase();
      if (code === '') return;
      if (!CODE_SET.has(code)) {
        warnings.push(`"${name}", day ${day}: unrecognized code "${code}" — skipped.`);
        return;
      }
      days[day] = code;
    });

    employeeRows.push({ name, days });
  }

  if (!employeeRows.length) {
    throw new Error('No employee rows with data were found under the header.');
  }

  return { employeeRows, warnings };
}

module.exports = { listSheets, parseRosterSheet, CODE_SET };
