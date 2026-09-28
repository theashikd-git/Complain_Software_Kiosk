# Your Opinion — Patient Feedback / Complaint System

A hospital patient feedback / complaint kiosk system: a touchscreen-friendly
public screen for patients, a queue / serial-number system, a staff console,
and an admin panel for managing counters, services, employee rosters, and
complaints. Built with **Node.js + Express + PostgreSQL**.

---

## Contents

- [Quick install (Debian server)](#quick-install-debian-server)
- [Updating to a new version](#updating-to-a-new-version)
- [Rolling back](#rolling-back)
- [Releasing a new version (developer workflow)](#releasing-a-new-version-developer-workflow)
- [Database migrations](#database-migrations)
- [What's included](#whats-included)
- [Project structure](#project-structure)
- [Manual install (any Linux/Mac/Windows machine)](#manual-install-any-linuxmacwindows-machine)
- [Managing the service](#managing-the-service-debian-install)
- [Backups](#backups)
- [Voice complaints](#voice-complaints)
- [Deploying kiosk touchscreens](#deploying-kiosk-touchscreens)
- [Notes](#notes)

---

## Quick install (Debian server)

Run this as **root** on a fresh Debian server. It installs Node.js and
PostgreSQL, clones this repo, sets up the database, creates an admin login,
and runs the app as a systemd service:

```bash
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/install-debian.sh | sudo bash
```

Then run the updater once, so every database migration is applied and the
server is on the latest release:

```bash
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/update-debian.sh | sudo bash
```

When the installer finishes it prints:

- the kiosk URL (`http://<server-ip>:3000/`)
- the admin panel URL (`http://<server-ip>:3000/admin`)
- the auto-generated database password (also saved in `.env` on the server)

> **Security:** the installer creates a default `admin` / `admin` login.
> Log in immediately, create a new admin with a strong password
> (`node seed-admin.js <user> <password> "<Full Name>"`), and remove the
> default one.

### Set the server timezone

Daily serial numbers reset at midnight and reports are grouped by date, both
based on the server's clock. Set it to local time right after installing:

```bash
timedatectl set-timezone Asia/Dhaka
systemctl restart postgresql complain-software
```

---

## Updating to a new version

Run as **root** on the server, preferably outside OPD hours (the app
restarts for a few seconds):

```bash
# Install a specific release (recommended)
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/update-debian.sh | sudo VERSION=v1.0.2 bash

# Or install whatever is currently on the main branch
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/update-debian.sh | sudo bash
```

If you are already logged in as root (`sudo -i`), drop the `sudo`:
`... | VERSION=v1.0.2 bash`

The updater:

1. Backs up the database to `/var/backups/complain-software/` (keeps the last 10)
2. Moves the code to the requested version
3. Installs npm dependencies
4. Runs only the **new** migrations, in the order listed in `migrations.order`
5. Restarts the service and checks that it came up

If a migration fails or the app won't start, the updater automatically puts
the previous code back and restarts it, so the hospital is never left with a
broken system.

It never touches `.env`, uploaded voice recordings, or existing data. It
**does** overwrite the app's code files, so never hand-edit code directly on
the server. Those changes would be lost on the next update.

### Check which version is installed

```bash
cd /opt/complain-software && git describe --tags
```

### If a migration fails

The updater prints the error and restores the previous version.

- If the error says something **already exists**, that change is already in
  your database. Mark it as done with the line the updater prints, e.g.
  ```bash
  echo migration_xxx.sql >> /opt/complain-software/.applied_migrations
  ```
  and run the update again.
- If it's **any other error** (e.g. "does not exist", syntax error), do not
  mark it as done. Fix the migration or its order in `migrations.order`,
  release a new version, and update again.

---

## Rolling back

Go back to the version that was running before the last update:

```bash
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/update-debian.sh | sudo ROLLBACK=1 bash
```

Or install any older release directly with `VERSION=v1.0.0`.

Rollback reverts the **code only**, not database changes. If you need the
database exactly as it was, restore a backup (see [Backups](#backups)).

---

## Releasing a new version (developer workflow)

Branches:

- **`dev`**: day-to-day work, not deployed anywhere
- **`main`**: tested code, ready for the hospital
- **Tags** (`v1.0.0`, `v1.1.0`, ...): the exact versions installed on servers

### 1. Work on `dev`

```bash
git checkout dev
git pull
# ... make changes, test locally with: npm run dev
git add .
git commit -m "Describe the change"
git push
```

### 2. When tested, merge into `main`

```bash
git checkout main
git pull
git merge dev
git push
```

### 3. Tag the release

```bash
git tag -a v1.1.0 -m "Short description of this release"
git push origin v1.1.0
```

### 4. Update the server

```bash
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/update-debian.sh | sudo VERSION=v1.1.0 bash
```

### 5. Switch back to `dev`

```bash
git checkout dev
```

### Version numbers

Use `vMAJOR.MINOR.PATCH`:

| Change | Example | When |
|---|---|---|
| Patch | `v1.1.0` → `v1.1.1` | Bug fixes only |
| Minor | `v1.1.0` → `v1.2.0` | New features, new pages, new migrations |
| Major | `v1.2.0` → `v2.0.0` | Big changes that break old behavior |

### Useful commands

```bash
git tag                          # list all versions
git log --oneline --decorate -10 # recent commits and which tags are on them
git branch                       # current branch (marked with *)
git diff v1.0.0 v1.1.0 --stat    # what changed between two versions
```

### If you tagged the wrong commit

```bash
git tag -d v1.1.0
git push origin --delete v1.1.0
# then create the tag again on the correct commit
```

---

## Database migrations

Database changes are made with `migration_*.sql` files in the project root.

**`migrations.order` controls the order they run in.** Migrations often
depend on each other (e.g. one creates a table that the next one changes),
so the order matters.

### Adding a new migration

1. Create a new file, e.g. `migration_patient_phone.sql`.
2. Write it so it is **safe to re-run**:
   ```sql
   CREATE TABLE IF NOT EXISTS ...;
   ALTER TABLE complaints ADD COLUMN IF NOT EXISTS patient_phone VARCHAR(20);
   CREATE INDEX IF NOT EXISTS ...;
   ```
   For constraints, wrap them in a `DO $$ ... IF NOT EXISTS ... $$` block
   (see `migration_queue_tickets_unique.sql` for an example).
3. Add its file name at the **bottom** of `migrations.order`.
4. If it's needed on fresh installs too, add the same change to `schema.sql`.
5. Commit the migration and `migrations.order` together, then release a new version.

### Rules

- **Never edit a migration after it has run on a server.** The server won't
  run it again. Always add a new migration instead.
- **Never reorder or remove lines** in `migrations.order`; only add at the bottom.

### How the server tracks migrations

Each server keeps a list of migrations already applied in
`/opt/complain-software/.applied_migrations`. The updater only runs files
listed in `migrations.order` that are not in that list yet.

---

## What's included

- **Public kiosk** (`/`): the "Your Opinion" screen with two buttons:
  - **Satisfied 😊**: a happy face and a 5-star rating. Tapping a star
    submits immediately.
  - **Complain 😠**: a form with three parts: what happened (typed or
    voice-recorded), which counter(s) were visited (at least one required),
    and identification (OPD ID / IPD ID / DIAG ID / patient name, all
    optional).
- **Get a Serial Number**: patients pick a service; the ticket is routed to
  the eligible counter with the fewest people waiting, and a receipt is
  printed on the network printer. Serial numbers come from one shared,
  increasing sequence for the whole hospital and reset to 1 each day.
- **Staff console** (`/staff`): employees log in to a counter and call the
  next patient. Warns if another employee is already working that counter.
- **Hidden admin panel** (`/admin`): not linked from the public site, but
  protected by a real login. Dashboard, Counters, Services, Employees,
  Roster/Shifts (with overlap protection), Queue, and Reports.

## Project structure

```
admin/                 Admin panel (HTML/CSS/JS)
public/                Kiosk frontend: the patient-facing screen
staff/                 Staff console for counter employees
src/                   Backend: Express routes, DB config, middleware, utils
kiosk/                 Windows launcher files for kiosk touchscreens
schema.sql             Full database schema for fresh installs
migration_*.sql        Incremental schema changes for existing databases
migrations.order       The order migrations must run in
server.js              App entry point
seed-admin.js          Creates an admin login
install-debian.sh      One-paste installer for a fresh Debian server
update-debian.sh       One-paste updater / rollback for an installed server
.gitignore             Excludes node_modules/, .env, logs
```

---

## Manual install (any Linux/Mac/Windows machine)

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

Create the database, load the schema, then run every migration in the order
listed in `migrations.order`.

**Linux / Mac:**

```bash
createdb -U postgres -E UTF8 complain_software
psql -U postgres -d complain_software -f schema.sql
grep -vE '^\s*(#|$)' migrations.order | while read -r m; do
  psql -U postgres -d complain_software -f "$m"
done
```

**Windows (PowerShell):**

```powershell
createdb -U postgres -E UTF8 complain_software
psql -U postgres -d complain_software -f schema.sql
Get-Content migrations.order | Where-Object { $_ -and -not $_.StartsWith('#') } | ForEach-Object {
  psql -U postgres -d complain_software -f $_
}
```

Add `-h localhost` if you connect over TCP rather than a local socket.

### 4. Configure environment

Create a file named `.env` in the project root:

```
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=complain_software
DB_USER=postgres
DB_PASSWORD=your_postgres_password
SESSION_SECRET=some_long_random_string
PRINTER_IP=192.168.x.x
PRINTER_PORT=9100
```

`PRINTER_IP` / `PRINTER_PORT` point at the network receipt printer used by
"Get a Serial Number" (ESC/POS over raw TCP, see
`src/utils/receiptPrinter.js`). Leave `PRINTER_IP` unset to skip printing; a
ticket is still issued either way.

### 5. Create your first admin login

```bash
node seed-admin.js admin "YourStrongPassword" "Your Full Name"
```

### 6. Run the server

```bash
npm start
```

- Kiosk screen: `http://localhost:3000/`
- Admin panel: `http://localhost:3000/admin`

For development with auto-restart on file changes: `npm run dev`.

---

## Managing the service (Debian install)

```bash
systemctl status complain-software     # is it running?
systemctl restart complain-software    # restart
systemctl stop complain-software       # stop
journalctl -u complain-software -f     # live logs
```

---

## Backups

The updater saves a database backup before every update in
`/var/backups/complain-software/` (the last 10 are kept).

Take a backup manually at any time:

```bash
su - postgres -c "pg_dump -Fc complain_software" > /var/backups/complain-software/manual_$(date +%Y%m%d_%H%M).dump
```

Restore a backup (**this replaces all current data**):

```bash
systemctl stop complain-software
su - postgres -c "pg_restore --clean --if-exists -d complain_software" < /var/backups/complain-software/<backup-file>.dump
systemctl start complain-software
```

Copy backups to another machine regularly. A backup on the same disk won't
survive a disk failure.

---

## Voice complaints

Recordings are captured in the browser (microphone permission required),
uploaded to the server, and saved under `public/uploads/voice/`. Admins play
them back from the Dashboard and Reports pages. This folder is kept empty in
git: recordings are patient data and are never committed to the repository.

## Deploying kiosk touchscreens

Point kiosk tablets/PCs at `http://<server-ip>:3000/` and staff devices at
`http://<server-ip>:3000/admin` or `/staff`.

Browsers block microphone access on a plain LAN address (`http://<ip>`) by
default; it's only allowed on `https://` or `localhost`. The `kiosk/` folder
contains Windows files that work around this:

- `trust-server-origin.reg` / `trust-server-origin-chrome.reg`: registry
  policies telling Edge/Chrome to trust the server's address for microphone
  access. Run once per kiosk device (as admin), then fully close and reopen
  the browser.
- `start-kiosk.bat` / `start-kiosk-chrome.bat`: fullscreen kiosk-mode
  launchers. Put a shortcut to one of these in the kiosk account's Startup
  folder so it boots straight into the feedback screen.

**Before using these, edit them to replace the placeholder IP with your
server's actual address.**

### What the registry files set

**Edge:**

```
Path:  HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Microsoft\Edge\OverrideSecurityRestrictionsOnInsecureOrigin
Name:  1        (a String value named "1")
Data:  http://<your-server-ip>:3000
```

**Chrome:**

```
Path:  HKEY_LOCAL_MACHINE\SOFTWARE\Policies\Google\Chrome\OverrideSecurityRestrictionsOnInsecureOrigin
Name:  1        (a String value named "1")
Data:  http://<your-server-ip>:3000
```

This makes the browser treat that one `http://` address as a secure origin,
which unlocks microphone access for the voice complaint feature on that
address only.

**Setup steps per kiosk device:**

1. Edit the `.reg` file: replace the placeholder IP with the server's LAN IP
   and port (matching `PORT` in `.env`).
2. Double-click the `.reg` file and accept the admin/UAC prompt.
3. Fully close the browser. Check Task Manager for leftover `msedge.exe` /
   `chrome.exe` processes, which can stop the policy taking effect.
4. Reopen the browser, go to `edge://policy` or `chrome://policy`, click
   "Reload policies", and confirm `OverrideSecurityRestrictionsOnInsecureOrigin`
   shows your server's address.

If the server's IP ever changes, the `.reg` and `.bat` files must be updated
and re-applied on every kiosk. Give the server a static IP (a DHCP
reservation on the router) to avoid this.

## Notes

- The admin route isn't linked on the public site, but every admin API call
  still requires a real login session.
- Counters must be created (and active) before they appear on the kiosk's
  complaint form. Counters must be tagged with at least one service before
  they can receive serial-number tickets.
- The Roster page assigns one employee at a time to a counter/shift;
  selecting several employees for one counter creates several rows. Roster
  edits are overlap-protected.
- A complaint can name more than one counter; the Dashboard and Reports show
  each counter along with whoever was rostered on it at the time.
- Satisfied submissions carry only a 1–5 star rating; the Dashboard and
  Reports show the daily/filtered average.
- Admin login sessions are currently kept in memory, so admins are logged
  out whenever the service restarts (including after an update).
