// Run this once after setting up the database to create your first admin
// login. Usage:
//   node seed-admin.js <username> <password> <full name>
// Example:
//   node seed-admin.js admin "StrongPass123!" "Dewan Hasan"

require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./src/config/db');

async function main() {
  const [username, password, ...nameParts] = process.argv.slice(2);
  const full_name = nameParts.join(' ') || 'Administrator';

  if (!username || !password) {
    console.error('Usage: node seed-admin.js <username> <password> <full name>');
    process.exit(1);
  }

  const password_hash = await bcrypt.hash(password, 10);

  try {
    await db.query(
      'INSERT INTO admins (username, password_hash, full_name, role) VALUES ($1, $2, $3, $4)',
      [username, password_hash, full_name, 'super_admin']
    );
    console.log(`Admin "${username}" created successfully.`);
  } catch (err) {
    if (err.code === '23505') { // unique_violation
      console.error(`An admin with username "${username}" already exists.`);
    } else {
      console.error('Error creating admin:', err.message);
    }
  } finally {
    process.exit(0);
  }
}

main();
