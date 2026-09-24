-- When a staff member picks a counter in the staff console, they become its
-- assigned employee only until their rostered shift ends (this column),
-- unless someone else logs in there first. NULL = no expiry (an admin's
-- manual assignment). Safe to re-run.
ALTER TABLE counters ADD COLUMN IF NOT EXISTS assigned_until TIMESTAMP;
