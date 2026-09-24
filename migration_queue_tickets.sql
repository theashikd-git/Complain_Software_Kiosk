-- ==========================================================
-- Adds queue/serial ticket numbering for the kiosk's "Get a Serial
-- Number" feature — lets the kiosk double as a simple queue-
-- management tool alongside feedback/complaints.
--
-- One row per (counter, day); last_number is atomically incremented
-- via INSERT ... ON CONFLICT DO UPDATE each time a ticket is issued
-- (see POST /api/queue/ticket in src/routes/public.js), so concurrent
-- taps on the same counter never hand out the same number twice.
-- Numbering resets naturally every day since ticket_date is part of
-- the primary key — no cron/cleanup job needed.
--
-- Safe to run on an existing database — creates a new table only, no
-- effect on any existing data. Fresh installs don't need this file;
-- schema.sql already includes it.
--
--   psql -U postgres -d complain_software -f migration_queue_tickets.sql
--   (or, if you don't have psql installed: node run-migration.js migration_queue_tickets.sql)
-- ==========================================================

CREATE TABLE IF NOT EXISTS queue_ticket_counters (
  counter_id   INTEGER NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
  ticket_date  DATE NOT NULL,
  last_number  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (counter_id, ticket_date)
);
