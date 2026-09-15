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
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
