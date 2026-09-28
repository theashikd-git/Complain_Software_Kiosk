<div align="center">

# 🏥 Your Opinion

**Patient feedback, complaint & queue system for hospitals**

![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13%2B-4169E1?logo=postgresql&logoColor=white)
![Debian](https://img.shields.io/badge/Debian-ready-A81D33?logo=debian&logoColor=white)

[Install](#-quick-install) · [Update](#-updating) · [Release](#-releasing-a-new-version) · [Migrations](#-database-migrations) · [Kiosks](#-kiosk-touchscreens)

</div>

---

## ✨ Features

| | Feature | Description |
|---|---|---|
| 😊 | **Feedback kiosk** | Touchscreen screen with *Satisfied* (1–5 stars) and *Complain* (typed or voice) |
| 🎫 | **Serial numbers** | Patients pick a service; tickets go to the least-busy counter and print on a receipt printer |
| 👩‍💼 | **Staff console** | Employees log in to a counter and call the next patient |
| 🔐 | **Admin panel** | Dashboard, counters, services, employees, roster/shifts, queue and reports |

| Screen | URL |
|---|---|
| Kiosk | `http://<server-ip>:3000/` |
| Staff console | `http://<server-ip>:3000/staff` |
| Admin panel | `http://<server-ip>:3000/admin` |

---

## 🚀 Quick install

On a fresh **Debian** server, as **root**:

```bash
# 1. Install
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/install-debian.sh | sudo bash

# 2. Apply all migrations and move to the latest release
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/update-debian.sh | sudo bash

# 3. Set local time (serial numbers reset at midnight)
timedatectl set-timezone Asia/Dhaka
systemctl restart postgresql complain-software
```

> [!WARNING]
> The installer creates a default **`admin` / `admin`** login. Log in right away, create your own admin, and remove the default:
> ```bash
> cd /opt/complain-software && node seed-admin.js <username> "<password>" "<Full Name>"
> ```

---

## 🔄 Updating

Run on the server as **root**, preferably **outside OPD hours**:

```bash
curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/update-debian.sh | sudo VERSION=v1.0.2 bash
```

| Goal | Add before `bash` |
|---|---|
| Install a specific release | `VERSION=v1.1.0` |
| Install latest `main` | *(nothing)* |
| Undo the last update | `ROLLBACK=1` |

> [!TIP]
> Already root (`sudo -i`)? Drop `sudo`: `... | VERSION=v1.1.0 bash`

**What the updater does:**

1. 💾 Backs up the database
2. 📥 Switches the code to the requested version
3. 📦 Installs dependencies
4. 🗃️ Runs only **new** migrations, in `migrations.order` order
5. ♻️ Restarts the app and checks it's running

If anything fails, it **automatically restores the previous version**, so the hospital is never left with a broken system.

> [!IMPORTANT]
> Never edit code directly on the server. Updates overwrite code files. Your `.env`, voice recordings and data are never touched.

<details>
<summary><b>🔧 Troubleshooting a failed update</b></summary>

<br>

**"… already exists"**: that change is already in the database. Mark it done, then update again:

```bash
echo migration_xxx.sql >> /opt/complain-software/.applied_migrations
```

**Any other error** (e.g. "does not exist"): do **not** mark it done. Fix the migration or its position in `migrations.order`, release a new version, and update again.

**Check the installed version:**

```bash
cd /opt/complain-software && git describe --tags
```

</details>

---

## 🏷️ Releasing a new version

```
dev  ──●──●──●──────●──●─────▶   daily work
             \           \
main ─────────●───────────●──▶   tested code
            v1.1.0      v1.2.0    ← tags installed on servers
```

```bash
# 1. Work on dev
git checkout dev
git add . && git commit -m "Describe the change" && git push

# 2. When tested, merge to main
git checkout main && git pull
git merge dev && git push

# 3. Tag the release
git tag -a v1.1.0 -m "What's new" && git push origin v1.1.0

# 4. Back to dev
git checkout dev
```

Then [update the server](#-updating) with `VERSION=v1.1.0`.

| Change | Example | Use for |
|---|---|---|
| **Patch** | `v1.1.0 → v1.1.1` | Bug fixes |
| **Minor** | `v1.1.0 → v1.2.0` | New features or migrations |
| **Major** | `v1.2.0 → v2.0.0` | Breaking changes |

<details>
<summary><b>📋 Useful git commands</b></summary>

<br>

```bash
git tag                          # list versions
git log --oneline --decorate -10 # recent commits and their tags
git diff v1.0.0 v1.1.0 --stat    # what changed between versions

# Tagged the wrong commit?
git tag -d v1.1.0
git push origin --delete v1.1.0
```

</details>

---

## 🗃️ Database migrations

Schema changes live in `migration_*.sql` files. **`migrations.order`** decides the order they run in, because later migrations often depend on earlier ones.

**Adding a migration:**

1. Create `migration_<name>.sql` and make it **safe to re-run**:
   ```sql
   CREATE TABLE IF NOT EXISTS ...;
   ALTER TABLE complaints ADD COLUMN IF NOT EXISTS patient_phone VARCHAR(20);
   CREATE INDEX IF NOT EXISTS ...;
   ```
2. Add the file name to the **bottom** of `migrations.order`
3. Add the same change to `schema.sql` for fresh installs
4. Commit both files together and [release a new version](#%EF%B8%8F-releasing-a-new-version)

> [!CAUTION]
> - Never edit a migration that has already run on a server. Add a new one instead.
> - Never reorder or delete lines in `migrations.order`. Only add at the bottom.

Each server records what it has applied in `/opt/complain-software/.applied_migrations`.

---

## 🛠️ Server management

| Task | Command |
|---|---|
| Status | `systemctl status complain-software` |
| Restart | `systemctl restart complain-software` |
| Live logs | `journalctl -u complain-software -f` |
| Version | `cd /opt/complain-software && git describe --tags` |

### 💾 Backups

The updater keeps the **last 10** database backups in `/var/backups/complain-software/`.

```bash
# Manual backup
su - postgres -c "pg_dump -Fc complain_software" > /var/backups/complain-software/manual_$(date +%Y%m%d_%H%M).dump

# Restore (⚠️ replaces all current data)
systemctl stop complain-software
su - postgres -c "pg_restore --clean --if-exists -d complain_software" < /var/backups/complain-software/<file>.dump
systemctl start complain-software
```

> [!NOTE]
> Rollback reverts **code only**. To undo database changes, restore a backup. Copy backups to another machine regularly.

---

## 🖥️ Kiosk touchscreens

Browsers only allow microphone access (for voice complaints) on `https://` or `localhost`. The `kiosk/` folder contains Windows files that fix this for your server's LAN address.

| File | Purpose |
|---|---|
| `trust-server-origin.reg` / `-chrome.reg` | Lets Edge / Chrome use the microphone on your server's address |
| `start-kiosk.bat` / `-chrome.bat` | Opens the kiosk fullscreen. Put a shortcut in the Startup folder |

**Per kiosk device:**

1. Edit the `.reg` and `.bat` files and replace the placeholder IP with your server's IP
2. Double-click the `.reg` file and accept the admin prompt
3. Fully close the browser (check Task Manager for leftover `msedge.exe` / `chrome.exe`)
4. Open `edge://policy` or `chrome://policy`, click **Reload policies**, and confirm `OverrideSecurityRestrictionsOnInsecureOrigin` shows your server

> [!TIP]
> Give the server a **static IP** (DHCP reservation on the router). If it changes, every kiosk must be reconfigured.

<details>
<summary><b>🔍 Registry values (for manual setup)</b></summary>

<br>

| Browser | Registry path |
|---|---|
| Edge | `HKLM\SOFTWARE\Policies\Microsoft\Edge\OverrideSecurityRestrictionsOnInsecureOrigin` |
| Chrome | `HKLM\SOFTWARE\Policies\Google\Chrome\OverrideSecurityRestrictionsOnInsecureOrigin` |

Value: a **String** named `1`, with data `http://<your-server-ip>:3000`

</details>

---

## 💻 Manual install / development

<details>
<summary><b>Show steps (any Linux, Mac or Windows machine)</b></summary>

<br>

**Requirements:** Node.js 18+ and PostgreSQL 13+

```bash
git clone https://github.com/theashikd-git/Complain_Software_Kiosk.git
cd Complain_Software_Kiosk
npm install
```

**Database (Linux / Mac):**

```bash
createdb -U postgres -E UTF8 complain_software
psql -U postgres -d complain_software -f schema.sql
grep -vE '^\s*(#|$)' migrations.order | while read -r m; do
  psql -U postgres -d complain_software -f "$m"
done
```

**Database (Windows PowerShell):**

```powershell
createdb -U postgres -E UTF8 complain_software
psql -U postgres -d complain_software -f schema.sql
Get-Content migrations.order | Where-Object { $_ -and -not $_.StartsWith('#') } |
  ForEach-Object { psql -U postgres -d complain_software -f $_ }
```

**Create `.env`** in the project root:

```ini
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=complain_software
DB_USER=postgres
DB_PASSWORD=your_postgres_password
SESSION_SECRET=some_long_random_string
PRINTER_IP=192.168.x.x      # leave unset to skip printing
PRINTER_PORT=9100
```

**Create an admin and start:**

```bash
node seed-admin.js admin "YourStrongPassword" "Your Full Name"
npm run dev     # development, auto-restart
npm start       # production
```

</details>

---

## 📁 Project structure

```
├── admin/              Admin panel
├── public/             Patient kiosk screen
├── staff/              Staff console
├── src/                Backend (routes, DB, middleware, utils)
├── kiosk/              Windows kiosk setup files
├── schema.sql          Full schema for fresh installs
├── migration_*.sql     Incremental database changes
├── migrations.order    Migration run order
├── install-debian.sh   One-command installer
├── update-debian.sh    One-command updater / rollback
└── server.js           App entry point
```

---

## 📝 Notes

- 🔒 The admin panel isn't linked publicly, but every admin request still requires a login.
- 🏷️ Counters must be **active** to appear on the complaint form, and **tagged with a service** to receive tickets.
- 📅 Roster assignments are overlap-protected: an employee can't be on two counters at the same time.
- 🎙️ Voice recordings are stored in `public/uploads/voice/` and are **never committed** to git (patient data).
- 🔁 Admin sessions are kept in memory, so admins are logged out whenever the app restarts.
