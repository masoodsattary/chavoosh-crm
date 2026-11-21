# Linux deployment

This branch runs the CRM as a standard Next.js Node process. Cloudflare D1 is
replaced by a local SQLite database in WAL mode, and R2 is replaced by protected
local file storage. The application API remains unchanged.

## Runtime paths

- Source: `/opt/chavoosh-crm/current`
- Database: `/var/lib/chavoosh-crm/database/crm.sqlite`
- Attachments: `/var/lib/chavoosh-crm/uploads`
- Backups: `/var/backups/chavoosh-crm`
- Environment: `/etc/chavoosh-crm/crm.env`

Do not point production DNS to the VM until the staging checklist passes. For
staging, install a temporary self-signed certificate and override
`crm.chavoosh.com` to the private IP only on the management workstation. HTTPS
is required because authentication cookies are `Secure`.

## Deployment outline

1. Clone the `linux-deployment` branch to `/opt/chavoosh-crm/current`.
2. Run `npm ci`, `npm test`, and create `/etc/chavoosh-crm/crm.env` from the example.
3. Start the application once so the seven migrations create an empty database.
4. Run `npm run bootstrap-admin` with `CRM_ADMIN_EMAIL`, `CRM_ADMIN_NAME`, and
   `CRM_ADMIN_PASSWORD` supplied through the process environment.
5. Install the systemd, Nginx, backup service, and timer files from this directory.
6. Test authentication, CRUD, permissions, file upload/download, import/export,
   PWA metadata, restart persistence, and backup restoration before data migration.

The initial administrator is staging-only. Data migration later replaces the
empty SQLite database and attachment directory while the service is stopped.
