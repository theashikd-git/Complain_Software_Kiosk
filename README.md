# Your Opinion  Patient Feedback / Complaint System

A hospital patient feedback / complaint kiosk system: a touchscreen-friendly
public screen for patients, and an admin panel for staff to manage counters,
employee rosters, and review complaints. Built with **Node.js + Express +
PostgreSQL**.

---

## Quick install (Debian server)

Run this as **root** on a fresh Debian server. It installs Node.js and
PostgreSQL, clones this repo, sets up the database, creates your admin
login, and runs the app as a systemd service  all in one step:

```bash
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/install-debian.sh | sudo bash
```

The script pauses once, near the end, to ask you for an admin username and
password  that becomes your first login for `/admin`. Everything else runs
unattended. When it finishes, it prints:
- the kiosk URL (`http://<server-ip>:3000/`)
- the admin panel URL (`http://<server-ip>:3000/admin`)
- the auto-generated database password (also saved in `.env` on the server)

That's it  the app is installed, the database is set up, and it's running
as a service that restarts automatically on crash or reboot.

---

## What's included

- **Public kiosk** (`/`)  the "Your Opinion" screen with two buttons:
  - **Satisfied 😊**  a happy face and a 5-star rating. Tapping a star
    submits immediately, nothing else required.
  - **Complain 😠**  opens a form with three parts: what happened (typed
    or voice-recorded), which counter(s) were visited (at least one
    required), and identification (OPD ID / IPD ID / DIAG ID / patient
    name  all optional, can be left blank).
- **Hidden admin panel** (`/admin`)  not linked from the public site, but
  protected by a real login regardless. Dashboard, Counters, Employees,
  Roster/Shifts (with overlap protection  an employee can't be double-
  booked on two counters at once), and Reports.

## Project structure

```
admin/                Admin panel (HTML/CSS/JS)  login, dashboard, counters,
                       employees, roster/shifts, reports
public/                Kiosk frontend  the patient-facing feedback screen
src/                   Backend  Express routes, DB config, middleware, utils
kiosk/                 Windows launcher files for kiosk touchscreens (see below)
schema.sql             Base database schema
migration_*.sql        Incremental schema changes  run in order (see below)
server.js              App entry point
seed-admin.js          Creates an admin login
install-debian.sh      One-paste installer for a fresh Debian server
.gitignore             Excludes node_modules/, .env, logs
```

---

## Manual install (any Linux/Mac/Windows machine)

If you're not on Debian, or want to install by hand instead of using the
script above, follow these steps.

### 1. Prerequisites
- **Node.js** 18 or newer
- **PostgreSQL** 13 or newer

### 2. Clone and install dependencies
```bash
git clone https://github.com/theashikd-git/Complain_Software_Kiosk.git
cd Complain_Software_Kiosk
npm install
```

### 3. Set up PostgreSQL
PostgreSQL doesn't support creating a database from inside a SQL script the
way MySQL does, so create it as a separate step first, then load the schema
and every migration **in this order**:

```bash
createdb -U postgres -E UTF8 complain_software

psql -U postgres -d complain_software -f schema.sql
psql -U postgres -d complain_software -f migration_shifts.sql
psql -U postgres -d complain_software -f migration_counter_employee.sql
psql -U postgres -d complain_software -f migration_complaint_employee_snapshot.sql
psql -U postgres -d complain_software -f migration_roster_import.sql
psql -U postgres -d complain_software -f migration_multi_shift.sql
```

If `createdb`/`psql` ask for a password, that's your PostgreSQL superuser
password. Add `-h localhost` to either command if you connect over TCP
rather than a local socket.

### 4. Configure environment
Create a file named `.env` in the project root:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=complain_software
DB_USER=postgres
DB_PASSWORD=your_postgres_password
SESSION_SECRET=some_long_random_string
```

### 5. Create your first admin login
```bash
node seed-admin.js admin "YourStrongPassword" "Your Full Name"
```
Run this again with a different username any time to add more admins.

### 6. Run the server
```bash
npm start
```
- Kiosk screen: `http://localhost:3000/`
- Admin panel: `http://localhost:3000/admin` (log in with the credentials
  from step 5)

For development with auto-restart on file changes: `npm run dev`.

---

## Voice complaints

Recordings are captured in the browser (microphone permission required),
uploaded to the server, and saved under `public/uploads/voice/`. Admins play
them back directly from the Dashboard and Reports pages  since the server
and admin devices share the same network, no external file hosting is
needed. This folder is intentionally kept empty in git  actual recordings
are patient data and are never committed to the repository.

## Deploying kiosk touchscreens

Point kiosk tablets/PCs at `http://<server-ip>:3000/` and staff devices at
`http://<server-ip>:3000/admin`.

Browsers block microphone access on a plain LAN address (`http://<ip>`) by
default  it's only allowed on `https://` or `localhost`. The `kiosk/`
folder contains Windows-specific files that work around this:

- `trust-server-origin.reg` / `trust-server-origin-chrome.reg`  registry
  policies telling Edge/Chrome to trust the server's address for microphone
  access. Run once per kiosk device (as admin), then fully close and reopen
  the browser.
- `start-kiosk.bat` / `start-kiosk-chrome.bat`  fullscreen kiosk-mode
  launchers (no address bar, tabs, or way to navigate away). Put a shortcut
  to one of these in the kiosk account's Startup folder so it boots
  straight into the feedback screen.

**Before using these, edit them to replace the placeholder IP with your
actual server's address.**

## Managing the service (Debian install)

If you used the Quick Install script, the app runs under systemd:

```bash
systemctl status complain-software     # check if it's running
systemctl restart complain-software    # restart after a code change
systemctl stop complain-software       # stop it
journalctl -u complain-software -f     # view live logs
```

To update to the latest code:
```bash
cd /opt/complain-software
sudo -u complain git pull
sudo -u complain npm install --omit=dev
sudo systemctl restart complain-software
```

## Notes

- The admin route isn't linked anywhere on the public site, but every
  admin API call still requires a real login session  it isn't relying on
  secrecy alone.
- Counters must be created (and active) before they'll appear on the
  kiosk's complaint form.
- The Roster page assigns one employee at a time to a counter/shift;
  selecting several employees for one counter creates several rows, which
  is how multiple employees per counter is supported. Roster edits are
  overlap-protected  an employee can't be assigned to two counters with
  conflicting shift times on the same day.
- A complaint can name more than one counter  the Dashboard and Reports
  pages show every counter named on a complaint, along with whoever was
  rostered on each at the time.
- Satisfied submissions carry only a 1–5 star rating; the Dashboard and
  Reports pages show the daily/filtered average.
