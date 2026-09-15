// Central PostgreSQL connection pool. Every route/model imports this instead
// of opening its own connection, so we don't run out of DB connections under
// load. pool.query() is used for single statements; pool.connect() is used
// where a route needs a transaction (see src/routes/public.js).
const { Pool, types } = require('pg');
require('dotenv').config();

// node-postgres's default parser for DATE columns (OID 1082) builds a JS
// Date object at LOCAL midnight, then JSON.stringify() always renders it via
// toISOString() (UTC) — so on a server whose OS timezone is ahead of UTC
// (qserver runs on Asia/Dhaka, UTC+6), a stored '2026-08-01' comes back as
// "2026-07-31T18:00:00.000Z": the date silently shifts back a day, and looks
// like a messy full timestamp instead of a plain date. Every date column
// this app touches (shift_date) is already handled as a plain "YYYY-MM-DD"
// string everywhere else (HTML <input type="date">, the Excel importer's
// hand-built date strings) — nothing needs a JS Date object for it — so the
// fix is to make `pg` hand dates back exactly as Postgres stores them,
// skipping the Date-object round-trip (and the timezone bug) entirely.
types.setTypeParser(1082, (val) => val);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 10
});

module.exports = pool;
