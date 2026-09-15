-- ==========================================================
-- Migration: Excel roster import support.
--
-- Adds:
--   - shifts.shift_code   — short code (G/M/E/N/O) used to match cells
--                            in an imported duty-roster Excel sheet to
--                            a specific shift. Nullable — existing
--                            custom shifts don't need one.
--   - shifts.is_off       — marks a pseudo-shift with no real working
--                            hours (e.g. "Off Duty"), so the live
--                            "who's on duty now" logic can skip it
--                            when computing the current employee.
--   - counter_assignments.counter_id becomes nullable, so an import
--     can create "employee X is on shift Y on date Z" rows before a
--     counter has been assigned — the admin assigns the counter
--     afterwards from the Roster page.
--   - a new UNIQUE (employee_id, shift_date) constraint — one employee
--     can only have one shift per day, matching how the source Excel
--     sheets are laid out (one code per person per day) and making
--     re-imports idempotent (importing an updated file updates the
--     shift on conflict instead of creating a duplicate row).
--
--     IMPORTANT: if any employee currently has more than one roster
--     row on the same date (e.g. a deliberate double-shift), the ADD
--     CONSTRAINT step below will fail and the whole migration rolls
--     back safely (it's wrapped in BEGIN/COMMIT — nothing partial gets
--     applied). Run this first to check for that case:
--
--       SELECT employee_id, shift_date, COUNT(*)
--       FROM counter_assignments
--       GROUP BY employee_id, shift_date
--       HAVING COUNT(*) > 1;
--
--     If that returns rows, resolve them (delete or merge) before
--     re-running this migration.
--
-- Also updates the starter Morning/Evening/Night shifts' hours and
-- adds codes to match the hospital's actual Excel duty-roster legend,
-- and adds the General shift + an Off Duty pseudo-shift, neither of
-- which existed before. If Morning/Evening/Night were already
-- deliberately retimed to something else in the admin panel, re-edit
-- them afterwards on the Shifts page — this matches by name only.
--
--   psql -U postgres -d complain_software -f migration_roster_import.sql
-- ==========================================================

BEGIN;

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS shift_code VARCHAR(10) UNIQUE;
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS is_off BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE shifts SET shift_code = 'M', start_time = '08:00', end_time = '15:00' WHERE shift_name = 'Morning';
UPDATE shifts SET shift_code = 'E', start_time = '14:00', end_time = '22:00' WHERE shift_name = 'Evening';
UPDATE shifts SET shift_code = 'N', start_time = '22:00', end_time = '09:00' WHERE shift_name = 'Night';

INSERT INTO shifts (shift_name, start_time, end_time, shift_code) VALUES
  ('General', '10:00', '18:00', 'G')
ON CONFLICT (shift_name) DO UPDATE SET shift_code = 'G', start_time = '10:00', end_time = '18:00';

INSERT INTO shifts (shift_name, start_time, end_time, shift_code, is_off) VALUES
  ('Off Duty', '00:00', '00:00', 'O', TRUE)
ON CONFLICT (shift_name) DO UPDATE SET shift_code = 'O', is_off = TRUE;

ALTER TABLE counter_assignments ALTER COLUMN counter_id DROP NOT NULL;

ALTER TABLE counter_assignments
  ADD CONSTRAINT uniq_employee_shift_date UNIQUE (employee_id, shift_date);

COMMIT;
