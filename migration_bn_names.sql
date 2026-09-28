-- Optional Bangla display names for counters and services, used by the
-- kiosk's language toggle. NULL/blank falls back to the English name —
-- these are additive columns, nothing else changes.
ALTER TABLE counters ADD COLUMN IF NOT EXISTS counter_name_bn VARCHAR(100);
ALTER TABLE services ADD COLUMN IF NOT EXISTS service_name_bn VARCHAR(100);
