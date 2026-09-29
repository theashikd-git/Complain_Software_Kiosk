require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const os = require('os');
const fs = require('fs');
const http = require('http');
const https = require('https');

// Picks this machine's own LAN IP (not 127.0.0.1) so the startup log
// always shows a real, reachable address for kiosk devices elsewhere on
// the network — instead of a hardcoded IP from a previous deployment.
function getLanAddress() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const addr of iface || []) {
      if (addr.family === 'IPv4' && !addr.internal) return addr.address;
    }
  }
  return null;
}

const publicRoutes = require('./src/routes/public');
const adminAuthRoutes = require('./src/routes/admin/auth');
const adminCounterRoutes = require('./src/routes/admin/counters');
const adminEmployeeRoutes = require('./src/routes/admin/employees');
const adminRosterRoutes = require('./src/routes/admin/roster');
const adminShiftRoutes = require('./src/routes/admin/shifts');
const adminReportRoutes = require('./src/routes/admin/reports');
const adminDashboardRoutes = require('./src/routes/admin/dashboard');
const adminServiceRoutes = require('./src/routes/admin/services');
const adminQueueRoutes = require('./src/routes/admin/queue');
const adminServedReportRoutes = require('./src/routes/admin/served-report');
const staffRoutes = require('./src/routes/staff');
const requireAdmin = require('./src/middleware/requireAdmin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-only-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 8 * 60 * 60 * 1000 // 8 hours
    }
  })
);

// ---- Public kiosk screen ("Your Opinion") ----
app.use('/api', publicRoutes);
app.use(express.static(path.join(__dirname, 'public')));

// ---- Admin ----
// Login route is open (you need it to log in); everything else under
// /api/admin requires an active session.
app.use('/api/admin', adminAuthRoutes);
app.use('/api/admin/counters', requireAdmin, adminCounterRoutes);
app.use('/api/admin/employees', requireAdmin, adminEmployeeRoutes);
app.use('/api/admin/roster', requireAdmin, adminRosterRoutes);
app.use('/api/admin/shifts', requireAdmin, adminShiftRoutes);
app.use('/api/admin/reports', requireAdmin, adminReportRoutes);
app.use('/api/admin/dashboard', requireAdmin, adminDashboardRoutes);
app.use('/api/admin/services', requireAdmin, adminServiceRoutes);
app.use('/api/admin/queue', requireAdmin, adminQueueRoutes);
app.use('/api/admin/served-report', requireAdmin, adminServedReportRoutes);

// ---- Staff console ----
// A separate login from the admin panel, for employees calling numbers
// at their counter. staffRoutes applies its own per-route auth (login/
// logout/me are open; everything else requires an active staff session)
// since login/logout live under the same /api/staff prefix as the
// protected routes, unlike admin's separate auth-router prefix.
app.use('/api/staff', staffRoutes);
app.use('/staff', express.static(path.join(__dirname, 'staff'), { cacheControl: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

// The admin frontend itself lives at /admin. It isn't linked from anywhere
// on the public site (that's the "hidden" part), but the folder is served
// openly since the page-level login screen is what actually protects it.
//
// Cache-Control: no-cache forces the browser to always revalidate these
// files (a fast conditional GET via ETag/Last-Modified, not a full
// re-download) instead of trusting a JS/CSS file for a while just because
// it has no explicit caching header — that "heuristic caching" is exactly
// what made an admin see a fixed bug still behave like the old, broken code
// right after a shipped fix, simply because their browser hadn't re-fetched
// the updated file yet. The admin panel is a handful of small files on a
// hospital LAN, so there's no real performance cost to always revalidating.
app.use('/admin', express.static(path.join(__dirname, 'admin'), { cacheControl: false, setHeaders: (res) => res.set('Cache-Control', 'no-cache') }));

// HTTPS via a self-signed cert (see certs/README.md) when one is present —
// required for the kiosk's voice recording (getUserMedia) to work from a
// separate device over the LAN by IP, since browsers only allow the
// microphone on a "secure context": https://, or http://localhost. Falls
// back to plain HTTP when no cert is set up (e.g. local development),
// so nothing here breaks a machine that hasn't generated one.
const CERT_KEY_PATH = path.join(__dirname, 'certs', 'server.key');
const CERT_PATH = path.join(__dirname, 'certs', 'server.cert');
const useHttps = fs.existsSync(CERT_KEY_PATH) && fs.existsSync(CERT_PATH);

const server = useHttps
  ? https.createServer({ key: fs.readFileSync(CERT_KEY_PATH), cert: fs.readFileSync(CERT_PATH) }, app)
  : http.createServer(app);
const scheme = useHttps ? 'https' : 'http';

// Bind explicitly to all network interfaces (not just loopback) so kiosk
// touchscreens elsewhere on the LAN can reach this server by its IP —
// Node's default without a host is usually fine, but this makes it certain.
server.listen(PORT, '0.0.0.0', () => {
  const lanAddress = getLanAddress();
  console.log(`Server running on port ${PORT} (${scheme.toUpperCase()}${useHttps ? ', self-signed cert' : ''})`);
  console.log(`Local:       ${scheme}://localhost:${PORT}/`);
  if (lanAddress) console.log(`On this LAN: ${scheme}://${lanAddress}:${PORT}/`);
  console.log(`Admin panel: ${scheme}://localhost:${PORT}/admin`);
  console.log(`Staff console: ${scheme}://localhost:${PORT}/staff`);
  if (!useHttps) {
    console.log('No TLS cert found at certs/server.key + certs/server.cert — running over plain HTTP.');
    console.log('Voice recording will only work at http://localhost, not over a LAN IP. See certs/README.md.');
  }
});
