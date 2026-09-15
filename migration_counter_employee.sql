-- ==========================================================
-- Adds a direct "assigned employee" per counter.
--
-- Each counter can now have one directly-declared employee — "who's
-- responsible for this counter" — set from the admin Counters page.
-- This is separate from the date/shift roster (counter_assignments):
-- it's a simple, always-current declaration rather than a per-day
-- schedule, and it's what the Reports page's Employee column reads
-- from directly (a complaint naming a counter shows that counter's
-- assigned employee, regardless of when the complaint came in).
--
-- Safe to run on an existing database — adds a nullable column, no
-- data loss, no effect on the existing shift/roster feature. Fresh
-- installs don't need this file; schema.sql already includes it.
--
--   psql -U postgres -d complain_software -f migration_counter_employee.sql
-- ==========================================================

ALTER TABLE counters ADD COLUMN IF NOT EXISTS assigned_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
