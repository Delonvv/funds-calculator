#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCK_DIR="${TMPDIR:-/tmp}/funds-calculator-dcm-update.lock"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  echo "DCM: обновление уже выполняется"
  exit 0
fi
trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT

cd "$REPO_DIR"

echo "DCM: начало — $(date '+%d.%m.%Y %H:%M:%S')"
git pull --rebase --autostash origin main

node scripts/update-dcm.mjs

git add dcm.json
if git diff --cached --quiet -- dcm.json; then
  echo "DCM: новых данных нет, отправлять в GitHub нечего"
  exit 0
fi

git config user.name >/dev/null 2>&1 || git config user.name "Funds Data Updater"
git config user.email >/dev/null 2>&1 || git config user.email "funds-data-updater@users.noreply.github.com"

git commit -m "Update DCM data $(date '+%Y-%m-%d %H:%M')"
git push origin main

echo "DCM: dcm.json обновлён и отправлен в GitHub — $(date '+%d.%m.%Y %H:%M:%S')"
