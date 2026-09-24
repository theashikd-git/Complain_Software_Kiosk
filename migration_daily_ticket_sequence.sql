-- Replaces the shared random-number pool with one shared, strictly
-- increasing sequence for the whole hospital (1, 2, 3, ...) — every
-- counter draws its next ticket number from this same daily sequence
-- instead of each counting up on its own or drawing at random.
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS daily_ticket_sequence (
  ticket_date  DATE PRIMARY KEY,
  last_number  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP INDEX IF EXISTS uniq_active_ticket_number_per_day;

-- Full (not status-scoped) uniqueness per day: under a plain increasing
-- sequence, a number is never reused within the same day at all.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_ticket_number_per_day'
  ) THEN
    ALTER TABLE queue_tickets
      ADD CONSTRAINT uniq_ticket_number_per_day
      UNIQUE (ticket_date, ticket_number);
  END IF;
END $$;
