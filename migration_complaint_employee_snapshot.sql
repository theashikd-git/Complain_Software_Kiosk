-- ==========================================================
-- Makes each complaint's "Employee" a historical snapshot instead of
-- a live lookup.
--
-- Previously, the Reports page's Employee column read a complaint's
-- named counter(s) and joined LIVE against counters.assigned_employee_id
-- — meaning if the counter was later reassigned to a different
-- employee, every past complaint against that counter would silently
-- start showing the NEW employee's name, which misrepresents who was
-- actually responsible at the time.
--
-- This migration adds a snapshot column to submission_counters. Going
-- forward, every NEW complaint copies the counter's *current*
-- assigned_employee_id into this column at submission time and never
-- touches it again — reassigning a counter later has no effect on
-- complaints that already happened. counters.assigned_employee_id
-- itself is now only ever read at the moment a new complaint is filed.
--
-- Safe to run on an existing database. Fresh installs don't need this
-- file; schema.sql already includes the column.
--
--   psql -U postgres -d complain_software -f migration_complaint_employee_snapshot.sql
-- ==========================================================

ALTER TABLE submission_counters
  ADD COLUMN IF NOT EXISTS assigned_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;

-- Best-effort backfill for complaints that already exist: there is no
-- true historical record of who was assigned to each counter at the
-- time those complaints came in, so this seeds the snapshot with
-- TODAY's current assignment as the closest available approximation —
-- a one-time guess, not a real historical fact. If you'd rather those
-- older rows simply show "Unassigned" until fresh data comes in, skip
-- this UPDATE (everything else in this file still applies safely).
UPDATE submission_counters sc
SET assigned_employee_id = c.assigned_employee_id
FROM counters c
WHERE c.id = sc.counter_id
  AND sc.assigned_employee_id IS NULL;
