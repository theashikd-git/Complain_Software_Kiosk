-- ==========================================================
-- Adds services, counter-service tagging, and per-ticket status
-- tracking for the kiosk's "Get a Serial Number" feature.
--
-- Lets an admin define which service(s) each counter offers, and lets
-- the kiosk hand out serial numbers by SERVICE (not by counter) —
-- automatically routing each ticket to whichever eligible counter
-- currently has the fewest people waiting. That single rule also
-- covers overflow: tagging a counter with a second service lets it
-- absorb that service's tickets whenever it's less busy than that
-- service's own counter — no special-case code, just data.
--
-- Safe to run on an existing database — creates new tables only, no
-- effect on existing data. Fresh installs don't need this file;
-- schema.sql already includes it.
--
--   node run-migration.js migration_services_queue.sql
-- ==========================================================

CREATE TABLE IF NOT EXISTS services (
  id            SERIAL PRIMARY KEY,
  service_name  VARCHAR(100) NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO services (service_name)
SELECT v FROM (VALUES
  ('Report delivery'),
  ('OPD and Diagnostic services'),
  ('Admission'),
  ('Emergency')
) AS seed(v)
WHERE NOT EXISTS (SELECT 1 FROM services WHERE service_name = seed.v);

CREATE TABLE IF NOT EXISTS counter_services (
  counter_id  INTEGER NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (counter_id, service_id)
);

CREATE TABLE IF NOT EXISTS queue_tickets (
  id            SERIAL PRIMARY KEY,
  counter_id    INTEGER NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
  service_id    INTEGER NOT NULL REFERENCES services(id),
  ticket_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  ticket_number INTEGER NOT NULL,
  status        VARCHAR(10) NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'serving', 'served')),
  issued_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  called_at     TIMESTAMP NULL,
  served_at     TIMESTAMP NULL
);

CREATE INDEX IF NOT EXISTS idx_queue_tickets_counter_date_status ON queue_tickets (counter_id, ticket_date, status);
