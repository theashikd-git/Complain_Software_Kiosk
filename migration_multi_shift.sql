-- ==========================================================
-- Migration: allow an employee to work more than one shift on the
-- same day (e.g. Morning at one counter, Evening at another).
--
-- Replaces the UNIQUE (employee_id, shift_date) constraint added by
-- migration_roster_import.sql — which allowed only one shift per
-- employee per day, full stop — with a looser UNIQUE (employee_id,
-- shift_date, shift_id): still blocks a literal duplicate (the same
-- shift assigned twice to the same employee on the same day), but
-- now allows two genuinely different shifts side by side.
--
-- IMPORTANT — this also changes Excel re-import behavior. Before this
-- migration, correcting a wrong shift code in the Excel file and
-- re-importing would find the employee's one existing row for that
-- day and update its shift in place. After this migration, the
-- system can no longer tell "this is a correction" apart from "this
-- is an intentional second shift" — a corrected re-import will ADD a
-- new row alongside the old (now-wrong) one instead of replacing it.
-- src/routes/admin/roster.js's import route now detects this case and
-- reports it back as multipleShiftsWarnings in the import response,
-- so it's visible rather than silent, but the old row still needs to
-- be removed by hand from the Roster page if it wasn't intentional.
--
--   psql -U postgres -d complain_software -f migration_multi_shift.sql
-- ==========================================================

BEGIN;

ALTER TABLE counter_assignments DROP CONSTRAINT IF EXISTS uniq_employee_shift_date;

ALTER TABLE counter_assignments
  ADD CONSTRAINT uniq_employee_shift_date_shift UNIQUE (employee_id, shift_date, shift_id);

COMMIT;
