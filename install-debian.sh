#!/usr/bin/env bash
# ============================================================================
# "Your Opinion" — one-paste installer for a fresh Debian server
# Repo: https://github.com/theashikd-git/Complain_Software_Kiosk
#
# Run this AS ROOT (log in as root, or run: sudo -i   then paste this).
#
# What it does:
#   1. Installs Node.js (LTS) + PostgreSQL + build tools
#   2. Creates a dedicated system user + app directory
#   3. Clones the repo (public — no credentials needed)
#   4. Installs npm dependencies
#   5. Creates the database + loads schema.sql and all migrations in order
#   6. Generates .env with random secure DB password + session secret
#   7. Creates your first admin login (asks for username/password)
#   8. Sets up a systemd service so the app starts on boot / restarts on crash
#   9. Opens the app's port in the firewall, if ufw is active
# ============================================================================

set -euo pipefail

# ---- Editable settings -----------------------------------------------------
REPO_URL="https://github.com/theashikd-git/Complain_Software_Kiosk.git"
APP_DIR="/opt/complain-software"
APP_USER="complain"
APP_PORT="3000"
DB_NAME="complain_software"
DB_USER="complain_app"
NODE_MAJOR="22"     # Node.js LTS line to install
# -----------------------------------------------------------------------------

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this as root (e.g. 'sudo -i' first, then paste this script)."
  exit 1
fi

echo "=============================================="
echo " 1/9  Installing base packages"
echo "=============================================="
apt-get update -y
apt-get install -y curl git build-essential python3 ca-certificates gnupg

echo "=============================================="
echo " 2/9  Installing Node.js ${NODE_MAJOR}.x"
echo "=============================================="
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "=============================================="
echo " 3/9  Installing PostgreSQL"
echo "=============================================="
apt-get install -y postgresql postgresql-contrib
systemctl enable postgresql
systemctl start postgresql

echo "=============================================="
echo " 4/9  Creating dedicated system user"
echo "=============================================="
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

echo "=============================================="
echo " 5/9  Cloning the repository into ${APP_DIR}"
echo "=============================================="
if [ -d "$APP_DIR/.git" ]; then
  echo "Repo already present, pulling latest instead of cloning."
  su -s /bin/bash "$APP_USER" -c "cd '$APP_DIR' && git pull"
else
  rm -rf "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi

echo "=============================================="
echo " 6/9  Installing npm dependencies"
echo "=============================================="
su -s /bin/bash "$APP_USER" -c "cd '$APP_DIR' && npm install --omit=dev"

echo "=============================================="
echo " 7/9  Setting up PostgreSQL database"
echo "=============================================="
DB_PASSWORD="$(openssl rand -base64 24 | tr -dc 'A-Za-z0-9' | head -c 24)"

ROLE_EXISTS=$(su - postgres -c "psql -tAc \"SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'\"")
if [ "$ROLE_EXISTS" != "1" ]; then
  su - postgres -c "psql -c \"CREATE ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';\""
else
  su - postgres -c "psql -c \"ALTER ROLE ${DB_USER} WITH LOGIN PASSWORD '${DB_PASSWORD}';\""
fi

DB_EXISTS=$(su - postgres -c "psql -tAc \"SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'\"")
if [ "$DB_EXISTS" != "1" ]; then
  su - postgres -c "createdb -O ${DB_USER} -E UTF8 ${DB_NAME}"
  echo "Loading schema and migrations..."
  su - postgres -c "psql -d ${DB_NAME} -f '${APP_DIR}/schema.sql'"
  su - postgres -c "psql -d ${DB_NAME} -f '${APP_DIR}/migration_shifts.sql'"
  su - postgres -c "psql -d ${DB_NAME} -f '${APP_DIR}/migration_counter_employee.sql'"
  su - postgres -c "psql -d ${DB_NAME} -f '${APP_DIR}/migration_complaint_employee_snapshot.sql'"
  su - postgres -c "psql -d ${DB_NAME} -f '${APP_DIR}/migration_roster_import.sql'"
  su - postgres -c "psql -d ${DB_NAME} -f '${APP_DIR}/migration_multi_shift.sql'"

  # Record every migration that's already applied, so the update script
  # (update-debian.sh) only ever runs NEW migration files added by a future
  # version, never re-runs these.
  {
    echo "migration_shifts.sql"
    echo "migration_counter_employee.sql"
    echo "migration_complaint_employee_snapshot.sql"
    echo "migration_roster_import.sql"
    echo "migration_multi_shift.sql"
  } > "${APP_DIR}/.applied_migrations"
  chown "$APP_USER:$APP_USER" "${APP_DIR}/.applied_migrations"
else
  echo "Database ${DB_NAME} already exists — skipping schema/migrations (run them manually if this is a fresh DB)."
  touch "${APP_DIR}/.applied_migrations"
  chown "$APP_USER:$APP_USER" "${APP_DIR}/.applied_migrations"
fi

# schema.sql and the migrations above are loaded as the postgres superuser
# (not as ${DB_USER}), so every table/sequence they create is OWNED by
# postgres — being the database's owner does not by itself grant ${DB_USER}
# any privileges on objects postgres created inside it. Grant them
# explicitly, and set default privileges so any tables a FUTURE migration
# creates (also loaded as postgres, see update-debian.sh) are automatically
# usable by the app user too, with no extra step needed.
su - postgres -c "psql -d ${DB_NAME} -c \"
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON TABLES TO ${DB_USER};
  ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL PRIVILEGES ON SEQUENCES TO ${DB_USER};
\""

echo "=============================================="
echo " 8/9  Writing .env and creating admin login"
echo "=============================================="
SESSION_SECRET="$(openssl rand -hex 32)"

cat > "$APP_DIR/.env" <<EOF
PORT=${APP_PORT}
DB_HOST=localhost
DB_PORT=5432
DB_NAME=${DB_NAME}
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASSWORD}
SESSION_SECRET=${SESSION_SECRET}
EOF
chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
chmod 600 "$APP_DIR/.env"

echo ""
echo "Creating default admin login (admin / admin) — CHANGE THIS PASSWORD"
echo "after your first login. See the note printed at the end of this script."
ADMIN_USER="admin"
ADMIN_PASS="admin"
ADMIN_NAME="Administrator"

su -s /bin/bash "$APP_USER" -c "cd '$APP_DIR' && node seed-admin.js '$ADMIN_USER' '$ADMIN_PASS' '$ADMIN_NAME'"

echo "=============================================="
echo " 9/9  Setting up systemd service"
echo "=============================================="
cat > /etc/systemd/system/complain-software.service <<EOF
[Unit]
Description=Your Opinion - Patient Feedback System
After=network.target postgresql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}
ExecStart=/usr/bin/node ${APP_DIR}/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable complain-software
systemctl restart complain-software

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "${APP_PORT}/tcp"
fi

SERVER_IP="$(hostname -I | awk '{print $1}')"

echo ""
echo "=============================================="
echo " Done!"
echo "=============================================="
echo "Kiosk screen:  http://${SERVER_IP}:${APP_PORT}/"
echo "Admin panel:   http://${SERVER_IP}:${APP_PORT}/admin"
echo ""
echo "Admin login:"
echo "  Username: ${ADMIN_USER}"
echo "  Password: ${ADMIN_PASS}"
echo "  *** SECURITY: this is a well-known default. Log in now and create a"
echo "  new admin with a strong password (node seed-admin.js <user> <pass> "
echo "  <name>), then remove this one — don't leave admin/admin active. ***"
echo ""
echo "Database:"
echo "  Name:     ${DB_NAME}"
echo "  User:     ${DB_USER}"
echo "  Password: ${DB_PASSWORD}"
echo "  (also saved in ${APP_DIR}/.env)"
echo ""
echo "Service commands:"
echo "  systemctl status complain-software"
echo "  systemctl restart complain-software"
echo "  journalctl -u complain-software -f"
echo ""
echo "NOTE: browsers block microphone access on a plain LAN IP (http://...)."
echo "If kiosk touchscreens will record voice complaints, you'll need the"
echo "same browser trust-origin trick used for qserver — see kiosk/ folder"
echo "and the project's kiosk-deployment doc."
echo "=============================================="
