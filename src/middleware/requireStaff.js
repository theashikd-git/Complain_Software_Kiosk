// Blocks access to staff console API routes unless a valid staff
// session exists. Mirrors requireAdmin, but checks req.session.staff —
// a completely separate login from the admin panel.
function requireStaff(req, res, next) {
  if (req.session && req.session.staff) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated. Please log in.' });
}

module.exports = requireStaff;
