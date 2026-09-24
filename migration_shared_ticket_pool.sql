-- Switches ticket-number uniqueness from "unique per counter per day"
-- to "unique across the whole hospital while active" — required for
-- drawing every ticket number from one shared pool instead of each
-- counter numbering its own tickets independently (which is what let
-- two different counters land on the same number).
--
-- Safe to re-run.
ALTER TABLE queue_tickets DROP CONSTRAINT IF EXISTS uniq_queue_ticket_per_counter_day;

-- A ticket's number only needs to stay unique while it's still
-- "active" (waiting or being served) — once served, that number goes
-- back into the shared pool and can be handed to someone else later
-- the same day. Scoping the index to ticket_date also gives the daily
-- reset for free.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_ticket_number_per_day
  ON queue_tickets (ticket_date, ticket_number)
  WHERE status IN ('waiting', 'serving');
