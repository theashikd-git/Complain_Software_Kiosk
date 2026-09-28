#!/usr/bin/env bash
# ============================================================================
# "Your Opinion" — one-paste UPDATER for an already-installed Debian server
# Repo: https://github.com/theashikd-git/Complain_Software_Kiosk
#
# Latest version from main:
#   curl -fsSL https://raw.githubusercontent.com/theashikd-git/Complain_Software_Kiosk/main/update-debian.sh | sudo bash
#
# A specific released version (git tag):
#   curl -fsSL .../update-debian.sh | sudo VERSION=v1.2.0 bash
#
# Go back to the version that was running before the last update:
#   curl -fsSL .../update-debian.sh | sudo ROLLBACK=1 bash
#
# What it does:
#   1. Backs up the database (pg_dump, keeps the last 10)
#   2. Moves the code to the requested version (never touches .env or uploads)
#   3. Installs npm dependencies
#   4. Runs only NEW migration_*.sql files, in the order they were added to git
#   5. Restarts the service and checks it came up
#   If a migration fails or the app won't start, the code is put back to the
#   previous version automatically.
# ============================================================================
set -euo pipefail

# ---- Must match install-debian.sh -------------------------------------------
APP_DIR="/opt/complain-software"
APP_USER="complain"
DB_NAME="complain_software"
DB_USER="complain_app"
SERVICE="complain-software"
BRANCH="${BRANCH:-main}"
BACKUP_DIR="/var/backups/complain-software"
# -----------------------------------------------------------------------------
VERSION="${VERSION:-}"
ROLLBACK="${ROLLBACK:-0}"

if [ "$(id -u)" -ne 0 ]; then
  echo "Please run this as root (sudo)."; exit 1
fi
if [ ! -d "$APP_DIR/.git" ]; then
  echo "No install found at $APP_DIR. Run install-debian.sh first."; exit 1
fi

as_app() { su -s /bin/bash "$APP_USER" -c "cd '$APP_DIR' && $1"; }

install_deps() {
  if [ -f "$APP_DIR/package-lock.json" ]; then
    as_app "npm ci --omit=dev" || as_app "npm install --omit=dev"
  else
    as_app "npm install --omit=dev"
  fi
}

OLD="$(as_app "git rev-parse HEAD")"

restore_code() {
  echo "!! Putting the code back to ${OLD:0:7} and restarting..."
  as_app "git reset --hard '$OLD'"
  install_deps
  systemctl restart "$SERVICE"
  echo "!! Update aborted. The previous version is running again."
  echo "!! Database backup from before this update: $BACKUP_FILE"
  exit 1
}

echo "=============================================="
echo " 1/5 Finding the target version"
echo "=============================================="
if [ "$ROLLBACK" = "1" ]; then
  if [ ! -s "$APP_DIR/.previous_version" ]; then
    echo "No previous version recorded — nothing to roll back to."; exit 1
  fi
  TARGET="$(cat "$APP_DIR/.previous_version")"
else
  as_app "git fetch --tags --prune --force origin"
  TARGET="${VERSION:-origin/$BRANCH}"
fi
NEW="$(as_app "git rev-parse --verify '${TARGET}^{commit}'")" || {
  echo "Version '$TARGET' not found. Available tags:"; as_app "git tag --sort=-v:refname | head -20"; exit 1; }

echo "Current: $(as_app "git describe --tags --always $OLD")"
echo "Target:  $(as_app "git describe --tags --always $NEW")"
if [ "$OLD" = "$NEW" ]; then
  echo "Code is already at this version — will still check for pending migrations."
fi

echo "=============================================="
echo " 2/5 Backing up the database"
echo "=============================================="
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_$(date +%Y%m%d_%H%M%S)_${OLD:0:7}.dump"
su - postgres -c "pg_dump -Fc '$DB_NAME'" > "$BACKUP_FILE"
echo "Saved: $BACKUP_FILE"
ls -1t "$BACKUP_DIR"/*.dump 2>/dev/null | tail -n +11 | xargs -r rm -f

echo "=============================================="
echo " 3/5 Updating code and dependencies"
echo "=============================================="
echo "$OLD" > "$APP_DIR/.previous_version"
chown "$APP_USER:$APP_USER" "$APP_DIR/.previous_version"
# reset --hard only replaces tracked files; .env, .applied_migrations and
# public/uploads/ are untracked, so they are left alone.
as_app "git reset --hard '$NEW'"
install_deps || restore_code

echo "=============================================="
echo " 4/5 Running new database migrations"
echo "=============================================="
APPLIED="$APP_DIR/.applied_migrations"
touch "$APPLIED"; chown "$APP_USER:$APP_USER" "$APPLIED"

# Order = the order each migration file was first added to the repo.
mapfile -t MIGRATIONS < <(
  as_app "git log --diff-filter=A --reverse --format= --name-only -- 'migration_*.sql'" \
    | awk 'NF && !seen[$0]++'
)

RAN=0
for m in "${MIGRATIONS[@]}"; do
  [ -f "$APP_DIR/$m" ] || continue
  grep -qxF "$m" "$APPLIED" && continue
  echo "-> $m"
  if su - postgres -c "psql -v ON_ERROR_STOP=1 --single-transaction -q -d '$DB_NAME' -f -" < "$APP_DIR/$m"; then
    echo "$m" >> "$APPLIED"
    RAN=$((RAN+1))
  else
    echo "!! Migration $m failed (it was rolled back, nothing half-applied)."
    echo "!! If this change is ALREADY in your database, mark it as done with:"
    echo "!!   echo $m >> $APPLIED"
    echo "!! and run the update again."
    restore_code
  fi
done
echo "$RAN new migration(s) applied."

su - postgres -c "psql -q -d '$DB_NAME' -c \"
  GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER};
  GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER};\""

echo "=============================================="
echo " 5/5 Restarting the service"
echo "=============================================="
systemctl restart "$SERVICE"
sleep 4
if ! systemctl is-active --quiet "$SERVICE"; then
  echo "!! Service failed to start. Last log lines:"
  journalctl -u "$SERVICE" -n 30 --no-pager || true
  restore_code
fi

echo ""
echo "=============================================="
echo " Updated to $(as_app "git describe --tags --always")"
echo "=============================================="
echo "Previous version: ${OLD:0:7}  (undo with ROLLBACK=1)"
echo "DB backup:        $BACKUP_FILE"
echo "Logs:             journalctl -u $SERVICE -f"