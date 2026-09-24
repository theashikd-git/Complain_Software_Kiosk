-- Records which employee pressed "Call Next" to finish (serve) each ticket,
-- for the Reports page's patients-served-by-employee section. NULL for
-- tickets finished from the admin Queue page or before this column existed.
-- Safe to re-run.
ALTER TABLE queue_tickets ADD COLUMN IF NOT EXISTS served_by_employee_id INTEGER REFERENCES employees(id) ON DELETE SET NULL;
