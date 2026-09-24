// One-off helper to list admin usernames in the database, using the same
// connection config as the app itself (src/config/db.js). Run this from
// the same shell/folder where `node run-migration.js` worked, since that's
// the environment that actually has working DB credentials.
//
// Usage:
//   node check-admins.js

require('dotenv').config();
const db = require('./src/config/db');

async function main() {
  try {
    const { rows } = await db.query(
      'SELECT id, username, full_name, role, created_at FROM admins ORDER BY id'
    );
    if (rows.length === 0) {
      console.log('No rows in the admins table — no admin accounts exist yet.');
      console.log('Create one with: node seed-admin.js admin "YourPassword" "Your Name"');
    } else {
      console.log(`Found ${rows.length} admin account(s):`);
      rows.forEach((a) => {
        console.log(`  id=${a.id}  username="${a.username}"  full_name="${a.full_name}"  role=${a.role}  created_at=${a.created_at}`);
      });
    }
  } catch (err) {
    console.error('Error querying admins table');
    console.error('  code:   ', err.code);
    console.error('  message:', err.message);
  } finally {
    process.exit();
  }
}

main();
