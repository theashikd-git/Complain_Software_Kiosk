# Your Opinion — Patient Feedback / Complaint System

Runs on **Node.js + Express + PostgreSQL**.

## What's included
- **Public kiosk** (`/`) — "Your Opinion" screen with two emoji buttons:
  - **Satisfied 😊** — shows a happy face and a 5-star rating. Tapping a
    star submits immediately, nothing else required.
  - **Complain 😠** — opens a popup with three parts: what happened (text
    or voice), which counter(s) were visited (multi-select, at least one
    required), and identification (OPD ID / IPD ID / DIAG ID / Patient
    Name — entirely optional, can be left blank).
- **Hidden admin panel** (`/admin`) — not linked from the public site.
  Login, Dashboard (red complaint box), Counters, Employees, Roster/Shifts,
  Reports.

## 1. Install dependencies
```bash
npm install
```

## 2. Set up PostgreSQL
PostgreSQL doesn't support creating a database from inside a SQL script the
way MySQL does, so create it as a separate step first, then load the schema
into it:
```bash
createdb -U postgres -E UTF8 complain_software
psql -U postgres -d complain_software -f schema.sql
```
If `createdb`/`psql` ask for a password, that's your PostgreSQL superuser
password (whatever you set when installing PostgreSQL). Add `-h localhost`
to either command if you connect over TCP rather than a local socket.

## 3. Configure environment
```bash
cp .env.example .env
```
Edit `.env` and fill in your PostgreSQL credentials (`DB_USER`, `DB_PASSWORD`,
`DB_PORT` — 5432 by default) and a random `SESSION_SECRET`.

## 4. Create your first admin login
```bash
node seed-admin.js admin "YourStrongPassword" "Your Full Name"
```
You can run this again with a different username to create more admins.

## 5. Run the server
```bash
npm start
```
- Public kiosk screen: `http://localhost:3000/`
- Admin panel: `http://localhost:3000/admin` (login with the credentials from step 4)

For development with auto-restart on file changes: `npm run dev`.

## Voice complaints
Recordings are captured in the browser (microphone permission required),
uploaded to the server, and saved under `public/uploads/voice/`. Admin plays
them back directly from the Dashboard and Reports pages — since the server
and admin devices share the same LAN, no external file hosting is needed.

## Deploying on the hospital LAN
Run this on a machine on your local network (e.g. `npm start` under `pm2`
for auto-restart), then point kiosk tablets/PCs at
`http://<server-lan-ip>:3000/` and staff devices at
`http://<server-lan-ip>:3000/admin`.

## Notes
- The admin route isn't linked anywhere on the public site (that's the
  "hidden" part), but every admin API call still requires a real login
  session, so it's not relying on secrecy alone.
- Counters must be created (and active) before they'll appear on the
  kiosk's complaint popup.
- The Roster page assigns one employee at a time to a counter/shift, so
  selecting several employees for one counter creates several rows, this
  is what allows multiple employees per counter.
- A complaint can name more than one counter (multi-select) — the
  Dashboard and Reports pages show every counter named on a complaint,
  along with whoever was rostered on each that day.
- Satisfied submissions carry only a 1-5 star rating; the Dashboard and
  Reports pages show the daily/filtered average.

## If you're switching from the MySQL version of this project
This build uses a different database and driver (`pg` instead of `mysql2`),
so there's no in-place migration. Set up PostgreSQL fresh using steps 2-4
above; your old MySQL data isn't carried over automatically.
