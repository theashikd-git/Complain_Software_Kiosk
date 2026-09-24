// One-off helper to run a .sql migration file against the same database
// the app itself connects to (src/config/db.js) — use this when you don't
// have the `psql` client tools installed. It reuses whatever DB_* config
// the app already connects with, so run it from the same shell/folder you
// use to start the server.
//
// Usage:
//   node run-migration.js migration_queue_tickets.sql

require('dotenv').config();
const fs = require('fs');
const db = require('./src/config/db');

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node run-migration.js <file.sql>');
    process.exit(1);
  }

  const sql = fs.readFileSync(file, 'utf8');
  try {
    await db.query(sql);
    console.log(`Ran ${file} successfully.`);
  } catch (err) {
    console.error(`Error running ${file}`);
    console.error('  code:   ', err.code);
    console.error('  message:', err.message);
    console.error('  detail: ', err.detail);
    process.exitCode = 1;
  } finally {
    process.exit();
  }
}

main();
