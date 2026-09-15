// Blocks access to admin API routes unless a valid admin session exists.
// The /admin frontend pages are served publicly (that's the "hidden" part —
// no link points to them), but every admin API call still needs a real login.
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }
  return res.status(401).json({ error: 'Not authenticated. Please log in.' });
}

module.exports = requireAdmin;
