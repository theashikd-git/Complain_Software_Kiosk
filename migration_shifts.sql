-- ==========================================================
-- Migration: replace the fixed morning/evening/night/full_day
-- shift list with reusable, admin-defined named shifts.
--
-- Run this ONCE against an EXISTING database that already has the
-- old schema (i.e. counter_assignments.shift_type). It creates the
-- new `shifts` table, maps existing roster rows onto matching
-- starter shifts so no data is lost, then drops the old column.
--
--   psql -U postgres -d complain_software -f migration_shifts.sql
--
-- Safe to run only once — re-running after it has already applied
-- will fail on the DROP COLUMN step (shift_type no longer exists).
-- ==========================================================

BEGIN;

CREATE TABLE IF NOT EXISTS shifts (
  id            SERIAL PRIMARY KEY,
  shift_name    VARCHAR(50) NOT NULL UNIQUE,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed starter shifts matching the old fixed options, so existing
-- roster rows can be mapped onto them below without losing data.
-- Rename/retime/delete these afterwards from the admin panel as needed.
INSERT INTO shifts (shift_name, start_time, end_time) VALUES
  ('Morning',  '08:00', '14:00'),
  ('Evening',  '14:00', '20:00'),
  ('Night',    '20:00', '08:00'),
  ('Full day', '00:00', '23:59')
ON CONFLICT (shift_name) DO NOTHING;

-- Add the new column (nullable for now), backfill it from the old
-- shift_type text, then lock it down.
ALTER TABLE counter_assignments ADD COLUMN IF NOT EXISTS shift_id INTEGER REFERENCES shifts(id);

UPDATE counter_assignments ca
SET shift_id = s.id
FROM shifts s
WHERE ca.shift_id IS NULL
  AND lower(replace(ca.shift_type, '_', ' ')) = lower(s.shift_name);

-- Anything that didn't match (shouldn't happen, but just in case) falls
-- back to "Full day" rather than blocking the migration.
UPDATE counter_assignments ca
SET shift_id = (SELECT id FROM shifts WHERE shift_name = 'Full day')
WHERE ca.shift_id IS NULL;

ALTER TABLE counter_assignments ALTER COLUMN shift_id SET NOT NULL;

ALTER TABLE counter_assignments DROP CONSTRAINT IF EXISTS uniq_counter_employee_shift;
ALTER TABLE counter_assignments
  ADD CONSTRAINT uniq_counter_employee_shift UNIQUE (counter_id, employee_id, shift_date, shift_id);

ALTER TABLE counter_assignments DROP COLUMN shift_type;

COMMIT;
