#!/usr/bin/env bash
set -euo pipefail

database="${CRM_DATABASE_PATH:-/var/lib/chavoosh-crm/database/crm.sqlite}"
uploads="${CRM_UPLOADS_PATH:-/var/lib/chavoosh-crm/uploads}"
backup_root="${CRM_BACKUP_PATH:-/var/backups/chavoosh-crm}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="${backup_root}/${timestamp}"

install -d -m 0750 "${destination}"
sqlite3 "${database}" ".timeout 10000" ".backup '${destination}/crm.sqlite'"
tar --create --gzip --file "${destination}/uploads.tar.gz" --directory "${uploads}" .
sha256sum "${destination}/crm.sqlite" "${destination}/uploads.tar.gz" > "${destination}/SHA256SUMS"
find "${backup_root}" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf -- {} +
