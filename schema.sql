-- ==========================================================
-- "Your Opinion" — Patient Feedback / Complaint System
-- PostgreSQL schema
--
-- PostgreSQL doesn't support CREATE DATABASE IF NOT EXISTS or an
-- inline USE statement the way MySQL does, so create the database
-- as a separate step first, then run the rest of this file while
-- connected to it:
--
--   createdb -U postgres -E UTF8 complain_software
--   psql -U postgres -d complain_software -f schema.sql
--
-- (createdb prompts for a password if your postgres user needs one;
-- add -h localhost if you connect over TCP instead of a local socket.)
-- ==========================================================

-- ----------------------------------------------------------
-- Admin users (login for /admin)
-- ----------------------------------------------------------
CREATE TABLE admins (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(100) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'admin'
                  CHECK (role IN ('super_admin', 'admin')),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------
-- Counters (created by admin)
-- ----------------------------------------------------------
CREATE TABLE counters (
  id             SERIAL PRIMARY KEY,
  counter_number VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. "01", "OPD-1"
  counter_name   VARCHAR(100) NOT NULL,          -- e.g. "OPD Reception"
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------
-- Employees (created by admin, assigned to counters)
-- ----------------------------------------------------------
CREATE TABLE employees (
  id             SERIAL PRIMARY KEY,
  employee_code  VARCHAR(30)  NOT NULL UNIQUE,
  full_name      VARCHAR(100) NOT NULL,
  designation    VARCHAR(100),
  phone          VARCHAR(30),
  is_active      BOOLEAN DEFAULT TRUE,
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Login credential for the staff console (see src/routes/staff.js) —
  -- employee_code doubles as the login id, so there's no separate
  -- username column. NULL until an admin sets a password for this
  -- employee, which is what actually grants them console access.
  password_hash  VARCHAR(255)
);

-- ----------------------------------------------------------
-- Shifts — named, admin-defined shifts with start/end times
-- (e.g. "Morning" 08:00–14:00). Replaces the old fixed
-- morning/evening/night/full_day list so staff can define
-- whatever shifts actually match how the hospital operates.
-- ----------------------------------------------------------
CREATE TABLE shifts (
  id            SERIAL PRIMARY KEY,
  shift_name    VARCHAR(50) NOT NULL UNIQUE,
  start_time    TIME NOT NULL,
  end_time      TIME NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  -- Short code (G/M/E/N/O) matched against cells in an imported Excel
  -- duty roster to pick a shift automatically. Nullable — shifts you
  -- create by hand don't need one.
  shift_code    VARCHAR(10) UNIQUE,
  -- Marks a pseudo-shift with no real working hours (e.g. "Off Duty")
  -- so the live "who's on duty now" logic (src/utils/liveAssignment.js)
  -- skips it when computing the current employee for a counter.
  is_off        BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Starter shifts so the roster is usable right away — edit, rename,
-- retime, deactivate, or delete these freely from the admin panel.
-- Hours/codes match the hospital's Excel duty-roster legend (General/
-- Morning/Evening/Night) so an Excel import can match codes straight
-- to these without any setup. "Off Duty" represents a day off and is
-- excluded from live-assignment matching via is_off.
INSERT INTO shifts (shift_name, start_time, end_time, shift_code, is_off) VALUES
  ('General',  '10:00', '18:00', 'G', FALSE),
  ('Morning',  '08:00', '15:00', 'M', FALSE),
  ('Evening',  '14:00', '22:00', 'E', FALSE),
  ('Night',    '22:00', '09:00', 'N', FALSE),
  ('Off Duty', '00:00', '00:00', 'O', TRUE),
  ('Full day', '00:00', '23:59', NULL, FALSE);

-- ----------------------------------------------------------
-- Each counter can have one directly-assigned employee — "who's
-- responsible for this counter" — set from the admin Counters page.
-- This is separate from the date/shift roster above: it's a simple,
-- always-current declaration ("Counter 01 -> Employee A") rather than
-- a per-day schedule, and it's what the Reports page's Employee
-- column reads from directly. Added after the ALTER so it can
-- reference employees(id), which is defined above this point.
-- ----------------------------------------------------------
ALTER TABLE counters ADD COLUMN assigned_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;

-- ----------------------------------------------------------
-- Live staff-console claim on a counter — separate from
-- assigned_employee_id above, which is an admin-set default/roster
-- assignment. This instead tracks who is ACTUALLY logged into the
-- staff console and working this counter right now (see
-- src/routes/staff.js), so a second employee logging in can be warned
-- before taking over. Cleared on logout, and only lasts for that one
-- login session — picking a counter is not a standing assignment.
-- ----------------------------------------------------------
ALTER TABLE counters ADD COLUMN active_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE counters ADD COLUMN active_login_at TIMESTAMP;

-- Expiry of a staff-console self-assignment: the picking employee stays the
-- counter's assigned employee (after logout) only until their rostered shift
-- ends. NULL = never expires (an admin's manual assignment).
ALTER TABLE counters ADD COLUMN assigned_until TIMESTAMP;

-- ----------------------------------------------------------
-- Counter assignments — rostering / shifting
-- Multiple employees can be assigned to the same counter,
-- on the same or different shifts/dates.
-- ----------------------------------------------------------
CREATE TABLE counter_assignments (
  id            SERIAL PRIMARY KEY,
  -- Nullable: an Excel roster import creates rows with no counter yet
  -- ("employee X is on shift Y on date Z"); the admin assigns the
  -- counter afterwards from the Roster page.
  counter_id    INTEGER REFERENCES counters(id)  ON DELETE CASCADE,
  employee_id   INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  shift_date    DATE NOT NULL,
  shift_id      INTEGER NOT NULL REFERENCES shifts(id),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_counter_employee_shift UNIQUE (counter_id, employee_id, shift_date, shift_id),
  -- An employee CAN work more than one shift on the same day (e.g.
  -- Morning at one counter, Evening at another) — this only blocks a
  -- literal duplicate: the exact same shift assigned twice to the
  -- same employee on the same day. Note this makes Excel re-import
  -- less automatically self-correcting than a stricter one-shift-
  -- per-day rule would: see the note on ON CONFLICT in
  -- src/routes/admin/roster.js's POST /import handler.
  CONSTRAINT uniq_employee_shift_date_shift UNIQUE (employee_id, shift_date, shift_id)
);

-- ----------------------------------------------------------
-- Submissions — both Satisfied and Complain entries land here
--
-- Satisfied: only `rating` is filled (1-5 stars). No counter,
--   no identification — tap a star and it submits immediately.
-- Complain: `complaint_text` and/or `voice_file_path` filled;
--   identification (id_type/id_value) is OPTIONAL; counters are
--   linked via the submission_counters table below (a complaint
--   can name more than one counter).
-- ----------------------------------------------------------
CREATE TABLE submissions (
  id              SERIAL PRIMARY KEY,
  submission_type VARCHAR(20) NOT NULL
                    CHECK (submission_type IN ('satisfied', 'complain')),
  rating          SMALLINT NULL
                    CHECK (rating IS NULL OR (rating BETWEEN 1 AND 5)),
  id_type         VARCHAR(20) NULL
                    CHECK (id_type IS NULL OR id_type IN ('OPD ID', 'IPD ID', 'DIAG ID', 'Patient Name')),
  id_value        VARCHAR(150) NULL,
  complaint_text  TEXT NULL,
  voice_file_path VARCHAR(255) NULL,
  submitted_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_submissions_date ON submissions (submitted_at);
CREATE INDEX idx_submissions_type ON submissions (submission_type);

-- ----------------------------------------------------------
-- Which counter(s) a complaint names — many-to-many, since a
-- patient can select more than one counter on a single complaint.
--
-- assigned_employee_id is a HISTORICAL SNAPSHOT: when a complaint is
-- created, the counter's *current* assigned_employee_id (from the
-- counters table) is copied here and frozen. Reports reads the
-- employee from THIS column, not from counters.assigned_employee_id
-- directly — so re-assigning a counter to a different employee later
-- never rewrites who the report says was responsible for a complaint
-- that already happened. counters.assigned_employee_id is only ever
-- consulted at the moment a NEW complaint is submitted.
-- ----------------------------------------------------------
CREATE TABLE submission_counters (
  id                    SERIAL PRIMARY KEY,
  submission_id         INTEGER NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  counter_id            INTEGER NOT NULL REFERENCES counters(id),
  assigned_employee_id  INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  CONSTRAINT uniq_submission_counter UNIQUE (submission_id, counter_id)
);

CREATE INDEX idx_submission_counters_counter ON submission_counters (counter_id);

-- ----------------------------------------------------------
-- Queue tickets — per-counter, per-day serial numbers for the kiosk's
-- "Get a Serial Number" feature (turns the kiosk into a simple queue-
-- management tool alongside feedback/complaints).
--
-- Unused by ticket issuance — kept only so an existing deployment
-- doesn't lose the table outright. Numbers used to be a separate
-- per-counter, per-day sequence here, which is exactly what let two
-- counters land on the same number; see daily_ticket_sequence below
-- for the single shared sequence every counter now draws from.
-- ----------------------------------------------------------
CREATE TABLE queue_ticket_counters (
  counter_id   INTEGER NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
  ticket_date  DATE NOT NULL,
  last_number  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (counter_id, ticket_date)
);

-- One row per day; last_number is atomically incremented via
-- INSERT ... ON CONFLICT DO UPDATE every time ANY counter issues a
-- ticket (see POST /api/queue/ticket), so the whole hospital shares one
-- strictly increasing sequence — 1, 2, 3, ... — for the day instead of
-- each counter counting up on its own. Resets naturally every day since
-- ticket_date is the primary key.
-- ----------------------------------------------------------
CREATE TABLE daily_ticket_sequence (
  ticket_date  DATE PRIMARY KEY,
  last_number  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ----------------------------------------------------------
-- Services — admin-manageable list of services counters can provide
-- (e.g. "Report delivery", "OPD and Diagnostic services"). Patients
-- pick one of these on the kiosk's "Get a Serial Number" screen
-- instead of picking a counter directly.
-- ----------------------------------------------------------
CREATE TABLE services (
  id            SERIAL PRIMARY KEY,
  service_name  VARCHAR(100) NOT NULL UNIQUE,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO services (service_name) VALUES
  ('Report delivery'),
  ('OPD and Diagnostic services'),
  ('Admission'),
  ('Emergency');

-- ----------------------------------------------------------
-- Which service(s) each counter offers — many-to-many, set from the
-- admin Counters page. A counter can offer more than one service.
--
-- This is also how a counter "absorbs" another service's overflow
-- with no special-case code: tagging the Report Delivery counter with
-- BOTH "Report delivery" AND "OPD and Diagnostic services" lets it
-- pick up OPD tickets automatically whenever it has fewer people
-- waiting than OPD's own counter — see the "least-loaded eligible
-- counter" query in POST /api/queue/ticket. That query just looks at
-- whichever counters are tagged for the requested service; it doesn't
-- know or care which service names are involved.
-- ----------------------------------------------------------
CREATE TABLE counter_services (
  counter_id  INTEGER NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
  service_id  INTEGER NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  PRIMARY KEY (counter_id, service_id)
);

-- ----------------------------------------------------------
-- Individual queue tickets — one row per issued serial number,
-- tracking its status (waiting/serving/served) so the admin "Queue"
-- page can show each counter's live waiting list, and so ticket
-- issuance can tell which counters are currently busy vs free.
--
-- ticket_number is drawn from one shared, strictly increasing sequence
-- for the whole hospital (daily_ticket_sequence above), not counted up
-- per-counter, so the same number is never issued twice in a day no
-- matter which counter issues it, and a plain number is enough to
-- identify a ticket on its own.
-- ----------------------------------------------------------
CREATE TABLE queue_tickets (
  id            SERIAL PRIMARY KEY,
  counter_id    INTEGER NOT NULL REFERENCES counters(id) ON DELETE CASCADE,
  service_id    INTEGER NOT NULL REFERENCES services(id),
  ticket_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  ticket_number INTEGER NOT NULL,
  status        VARCHAR(10) NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'serving', 'served')),
  issued_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  called_at     TIMESTAMP NULL,
  served_at     TIMESTAMP NULL,
  -- Belt-and-braces: daily_ticket_sequence's atomic upsert already
  -- makes a duplicate number effectively impossible, but this makes it
  -- impossible at the database level regardless of how a row got
  -- inserted. Not scoped to "active only" — under a plain increasing
  -- sequence a number is never reused at all within the same day, served
  -- or not.
  CONSTRAINT uniq_ticket_number_per_day UNIQUE (ticket_date, ticket_number)
);

-- Which employee pressed "Call Next" to finish (serve) this ticket, for the
-- Reports page's patients-served-by-employee section. NULL when finished from
-- the admin Queue page, or for tickets served before this column existed.
ALTER TABLE queue_tickets ADD COLUMN served_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;

CREATE INDEX idx_queue_tickets_counter_date_status ON queue_tickets (counter_id, ticket_date, status);
