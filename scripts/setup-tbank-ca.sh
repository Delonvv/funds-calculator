#!/usr/bin/env bash
set -euo pipefail

# Official Gosuslugi root, downloaded over verified HTTPS on 2026-10-09:
# https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt
task_script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
task_ca_file="$task_script_dir/certs/russian-trusted-root-ca.crt"
task_expected_fingerprint="D26D2D0231B7C39F92CC738512BA54103519E4405D68B5BD703E9788CA8ECF31"
task_actual_fingerprint="$(openssl x509 -in "$task_ca_file" -noout -fingerprint -sha256 | cut -d= -f2 | tr -d ':')"
if [[ "$task_actual_fingerprint" != "$task_expected_fingerprint" ]]; then
  echo "Unexpected Russian Trusted Root CA fingerprint; refusing installation." >&2
  exit 1
fi
openssl x509 -in "$task_ca_file" -checkend 0 -noout

# System store for curl; additional CA for Node (read when Node starts).
sudo install -m 0644 "$task_ca_file" /usr/local/share/ca-certificates/tbank-russian-trusted-root.crt
sudo update-ca-certificates
echo "NODE_EXTRA_CA_CERTS=$task_ca_file" >> "$GITHUB_ENV"

# Chromium's Linux NSS store, for the browser fallback.
sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends libnss3-tools
task_nss_dir="$HOME/.pki/nssdb"
mkdir -p "$task_nss_dir"
if [[ ! -f "$task_nss_dir/cert9.db" ]]; then
  certutil -N --empty-password -d "sql:$task_nss_dir"
fi
certutil -A -d "sql:$task_nss_dir" -n 'TBank Russian Trusted Root CA' -t 'C,,' -i "$task_ca_file"
echo "Russian Trusted Root CA installed; TLS verification remains enabled."
