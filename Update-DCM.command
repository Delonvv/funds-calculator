#!/bin/zsh

set -e
REPO_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Обновление первичных размещений…"
"$REPO_DIR/scripts/run-local-dcm-update.sh"
echo
echo "Готово. Это окно можно закрыть."
read -r "?Нажмите Enter…"
