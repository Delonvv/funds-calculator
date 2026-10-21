#!/usr/bin/env bash
# Netlify ignore convention: 0 = skip, 1 = build.
# On any uncertainty keep the build enabled.
set -u
ref="${COMMIT_REF:-HEAD}"
author="$(git show -s --format=%an "$ref" 2>/dev/null)" || exit 1
subject="$(git show -s --format=%s "$ref" 2>/dev/null)" || exit 1
if [ "$author" != "funds-data-bot" ]; then
  echo "Build enabled: ordinary commit."
  exit 1
fi
case "$subject" in
  *"[netlify-hook-only]"*) ;;
  *) echo "Build enabled: no hook-only marker."; exit 1 ;;
esac
files="$(git diff-tree --root --no-commit-id --name-only -r "$ref" 2>/dev/null)" || exit 1
if [ -z "$files" ]; then
  echo "Build enabled: no confirmed data-file changes."
  exit 1
fi
while IFS= read -r file; do
  case "$file" in
    funds.json|market-rates.json|dcm.json) ;;
    *) echo "Build enabled: changes include non-data files."; exit 1 ;;
  esac
done <<< "$files"
echo "Skipping duplicate Git deploy: data will be published by the Actions build hook."
exit 0
