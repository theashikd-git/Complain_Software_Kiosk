// Turns a parsed roster sheet (see rosterImport.js) into a list of
// counter_assignments writes, and classifies each against what's already in
// the database. The admin sees this as a preview first, then confirms; both
// steps use buildImportPlan so what's previewed is exactly what's saved.
//
// Counter rule: the counter named in the sheet always wins on re-import —
// except for dates already in the past, which are never changed (an entry
// with no counter yet is still filled in, whatever its date). A short code
// the sheet uses that matches no counter leaves the entry's counter alone,
// so a counter an admin set by hand is never wiped by a re-import.
//
// Numbering: see the "RD1, RD2" comment below.
const { shortCodeKey } = require('./shortCode');

class ImportError extends Error {
  constructor(message, extra) {
    super(message);
    this.status = 400;
    this.extra = extra || {};
  }
}

const pad = (n) => String(n).padStart(2, '0');

async function buildImportPlan(db, parsed, month, year) {
  const daysInMonth = new Date(year, month, 0).getDate();

  // Every shift code in the sheet must already exist (by shift_code) — better
  // to block the whole import with a clear message than silently leave some
  // days without a shift.
  const usedCodes = new Set();
  parsed.employeeRows.forEach((e) => Object.values(e.days).forEach((d) => usedCodes.add(d.code)));
  const { rows: shiftRows } = await db.query(
    'SELECT id, shift_code, is_off FROM shifts WHERE shift_code = ANY($1::text[])',
    [Array.from(usedCodes)]
  );
  const shiftByCode = Object.fromEntries(shiftRows.map((s) => [s.shift_code, s]));
  const missingCodes = Array.from(usedCodes).filter((c) => !shiftByCode[c]);
  if (missingCodes.length) {
    throw new ImportError(
      `These shift codes aren't set up yet: ${missingCodes.join(', ')}. Add a matching Shift Code to a shift on the Shifts page, then re-import.`
    );
  }

  const { rows: counters } = await db.query('SELECT id, counter_number, counter_name, short_code FROM counters');
  const counterById = new Map(counters.map((c) => [c.id, c]));
  const counterByKey = new Map(
    counters.filter((c) => c.short_code).map((c) => [shortCodeKey(c.short_code), c])
  );
  const counterLabel = (id) => {
    const c = counterById.get(id);
    return c ? `${c.counter_number} — ${c.counter_name}` : 'no counter';
  };

  // Names must match an employee exactly, ignoring case and surrounding
  // whitespace. A name that doesn't match isn't fatal; that employee's rows
  // are skipped and reported.
  const { rows: employees } = await db.query('SELECT id, full_name FROM employees');
  const employeeByName = new Map(employees.map((e) => [e.full_name.trim().toLowerCase(), e.id]));

  // A sheet that just says "RD" or "GF C" for several people means "the 1st
  // RD counter, the 2nd RD counter...": within one day and one shift, people
  // sharing a code are numbered top-to-bottom in sheet order (RD1, RD2, ...)
  // and matched to counters whose short code is that code + the number
  // ("RD1", "GFC2"). Unmatched employees still take a place in the order, as
  // they do on the real desk. Several shifts on one code (a handover) each
  // start again at 1.
  const rankSeen = new Map();
  const ranks = parsed.employeeRows.map((row) => {
    const byDay = {};
    Object.entries(row.days).forEach(([dayStr, d]) => {
      if (!d.place || shiftByCode[d.code].is_off) return;
      const k = `${dayStr}|${d.code}|${shortCodeKey(d.place)}`;
      const n = (rankSeen.get(k) || 0) + 1;
      rankSeen.set(k, n);
      byDay[dayStr] = n;
    });
    return byDay;
  });

  const hasNumberedCounters = (key) =>
    counters.some((c) => {
      const k = c.short_code ? shortCodeKey(c.short_code) : '';
      return k.length > key.length && k.startsWith(key) && /^\d+$/.test(k.slice(key.length));
    });

  const entries = [];
  const unmatched = new Set();
  const skippedInvalidDays = [];
  const unknownPlaces = new Map();
  const missingNumbered = new Map(); // "GFC3" -> { counter, count, examples: [] }

  parsed.employeeRows.forEach((row, rowIdx) => {
    const employeeId = employeeByName.get(row.name.toLowerCase());
    if (!employeeId) {
      unmatched.add(row.name);
      return;
    }
    Object.entries(row.days).forEach(([dayStr, d]) => {
      const day = Number(dayStr);
      if (day > daysInMonth) {
        skippedInvalidDays.push(`${row.name}, day ${day} (${month}/${year} only has ${daysInMonth} days)`);
        return;
      }
      const shift = shiftByCode[d.code];
      const shiftDate = `${year}-${pad(month)}-${pad(day)}`;
      let counterId = null;
      if (d.place && !shift.is_off) {
        const key = shortCodeKey(d.place);
        const n = ranks[rowIdx][dayStr];
        const numbered = counterByKey.get(`${key}${n}`);
        if (numbered) {
          counterId = numbered.id;
        } else if (hasNumberedCounters(key)) {
          // Numbered counters exist for this code but not one for this
          // person's place — never guess; leave it for the admin.
          const need = `${key}${n}`;
          const m = missingNumbered.get(need) || { counter: need, count: 0, examples: [] };
          m.count += 1;
          if (m.examples.length < 8) m.examples.push(`${shiftDate} ${d.code} ${row.name}`);
          missingNumbered.set(need, m);
        } else if (counterByKey.has(key)) {
          counterId = counterByKey.get(key).id;
        } else {
          unknownPlaces.set(d.place, (unknownPlaces.get(d.place) || 0) + 1);
        }
      }
      entries.push({
        name: row.name,
        employee_id: employeeId,
        shift_date: shiftDate,
        shift_id: shift.id,
        is_off: shift.is_off,
        counter_id: counterId
      });
    });
  });

  if (!entries.length) {
    throw new ImportError('Nothing to import — no rows matched an existing employee.', {
      unmatchedEmployees: Array.from(unmatched)
    });
  }

  const { rows: existingRows } = await db.query(
    `SELECT employee_id, to_char(shift_date, 'YYYY-MM-DD') AS d, shift_id, counter_id,
            (shift_date >= CURRENT_DATE) AS future
     FROM counter_assignments
     WHERE employee_id = ANY($1::int[]) AND shift_date BETWEEN $2 AND $3`,
    [
      [...new Set(entries.map((e) => e.employee_id))],
      `${year}-${pad(month)}-01`,
      `${year}-${pad(month)}-${pad(daysInMonth)}`
    ]
  );
  const existingByKey = new Map(existingRows.map((r) => [`${r.employee_id}|${r.d}|${r.shift_id}`, r]));

  const counts = { new: 0, fill: 0, overwrite: 0, unchanged: 0, protected: 0 };
  const overwriteSamples = [];
  entries.forEach((e) => {
    const ex = existingByKey.get(`${e.employee_id}|${e.shift_date}|${e.shift_id}`);
    if (!ex) e.action = 'new';
    else if (e.counter_id === null || ex.counter_id === e.counter_id) e.action = 'unchanged';
    else if (ex.counter_id === null) e.action = 'fill';
    else if (ex.future) e.action = 'overwrite';
    else e.action = 'protected';
    counts[e.action] += 1;
    if (e.action === 'overwrite' && overwriteSamples.length < 8) {
      overwriteSamples.push(
        `${e.name}, ${e.shift_date}: ${counterLabel(ex.counter_id)} → ${counterLabel(e.counter_id)}`
      );
    }
  });

  return {
    entries,
    summary: {
      totalEntries: entries.length,
      newEntries: counts.new,
      countersFilled: counts.fill,
      countersOverwritten: counts.overwrite,
      unchanged: counts.unchanged,
      protectedPast: counts.protected,
      offDays: entries.filter((e) => e.is_off).length,
      withoutCounter: entries.filter((e) => !e.is_off && e.counter_id === null).length,
      unmatchedEmployees: Array.from(unmatched),
      unknownPlaceCodes: Array.from(unknownPlaces, ([code, count]) => ({ code, count })),
      missingNumberedCounters: Array.from(missingNumbered.values()),
      skippedInvalidDays,
      overwriteSamples
    }
  };
}

async function applyImportPlan(client, plan) {
  for (const e of plan.entries) {
    if (e.action === 'new') {
      await client.query(
        `INSERT INTO counter_assignments (employee_id, shift_date, shift_id, counter_id)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (employee_id, shift_date, shift_id) DO NOTHING`,
        [e.employee_id, e.shift_date, e.shift_id, e.counter_id]
      );
    } else if (e.action === 'fill' || e.action === 'overwrite') {
      await client.query(
        `UPDATE counter_assignments SET counter_id = $4
         WHERE employee_id = $1 AND shift_date = $2 AND shift_id = $3`,
        [e.employee_id, e.shift_date, e.shift_id, e.counter_id]
      );
    }
  }
}

module.exports = { buildImportPlan, applyImportPlan, ImportError };
