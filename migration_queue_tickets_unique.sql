-- Adds a database-level guarantee that the same serial number can never
-- be issued twice for the same counter on the same day. The ticket-issuing
-- code already prevents this via an atomic upsert on queue_ticket_counters,
-- but this constraint makes a duplicate impossible outright, regardless of
-- how a row got inserted (bug, manual edit, future code change, etc.).
--
-- Safe to re-run: does nothing if the constraint already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uniq_queue_ticket_per_counter_day'
  ) THEN
    ALTER TABLE queue_tickets
      ADD CONSTRAINT uniq_queue_ticket_per_counter_day
      UNIQUE (counter_id, ticket_date, ticket_number);
  END IF;
END $$;
