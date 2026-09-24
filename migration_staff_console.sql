-- Adds the staff login console: employees get a login credential
-- (employee_code + password), and counters track who is currently
-- logged in and working them so a second employee can be warned before
-- taking a counter over.
--
-- Safe to re-run.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

ALTER TABLE counters ADD COLUMN IF NOT EXISTS active_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
ALTER TABLE counters ADD COLUMN IF NOT EXISTS active_login_at TIMESTAMP;
