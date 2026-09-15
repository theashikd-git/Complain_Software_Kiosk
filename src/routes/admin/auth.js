const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../../config/db');

// POST /api/admin/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const { rows } = await db.query('SELECT * FROM admins WHERE username = $1', [username]);
    const admin = rows[0];

    // Same generic error whether the username doesn't exist or the password is
    // wrong — avoids telling an attacker which usernames are valid.
    if (!admin || !(await bcrypt.compare(password, admin.password_hash))) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    req.session.admin = {
      id: admin.id,
      username: admin.username,
      full_name: admin.full_name,
      role: admin.role
    };

    res.json({ success: true, admin: req.session.admin });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// POST /api/admin/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/admin/me — used by admin frontend to check if session is valid
router.get('/me', (req, res) => {
  if (req.session && req.session.admin) {
    return res.json({ admin: req.session.admin });
  }
  res.status(401).json({ error: 'Not logged in.' });
});

module.exports = router;
