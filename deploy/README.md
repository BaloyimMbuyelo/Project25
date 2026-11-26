# Deploying UBMS (Ubuntu server, Nginx + HTTPS)

This follows the System Design's deployment (section 4.3.3). One Ubuntu server runs everything:

```
Browser ──HTTPS──▶ Nginx ─┬─ /            React build (frontend/dist)
                          ├─ /uploads/    menu photos (/opt/ubms/uploads)
                          └─ /api/  ────▶ Node API on 127.0.0.1:5000 (PM2) ──▶ MySQL (localhost)
```

## What you need

- A new **Ubuntu 24.04** server. A 1 GB VPS is enough.
- SSH access as root or as a user with `sudo`.
- **A domain is optional.** Without one, the script uses `<server-ip>.sslip.io`, a free name that points at the server, and gets a Let's Encrypt certificate for it.

## First-time setup

Connect with SSH and run:

```bash
sudo git clone https://github.com/BaloyimMbuyelo/Project25.git /opt/ubms/app
sudo bash /opt/ubms/app/deploy/setup-server.sh            # or: ... setup-server.sh ubms.example.com
```

It takes about 5 minutes. It prints the site address and the demo accounts password when it finishes.

| Step | What it does |
|---|---|
| Packages | Installs Nginx, MySQL 8, Node.js 22, PM2 and Certbot. Adds swap on small servers. |
| Firewall | Allows only SSH, HTTP (80) and HTTPS (443). Port 5000 and MySQL can't be reached from outside. |
| Database | Loads the schema, then runs migrations with [migrate.sh](migrate.sh). Each migration runs only once. |
| App account | The API connects as `ubms_app`, which can only read and write rows (`SELECT, INSERT, UPDATE, DELETE`). Not root. |
| Secrets | Writes `backend/.env` with a random database password and `JWT_SECRET`. Only the `ubms` user can read it. |
| HTTPS | Gets a Let's Encrypt certificate, redirects HTTP to HTTPS and sets up automatic renewal. |
| Demo accounts | Creates the six demo accounts with the team's demo password `Bistro2026`, the same as locally. Set `DEMO_PASSWORD=...` before running to use a different one. That password is public in this repo, so change it, or remove the demo accounts, before real restaurant data goes on the server. |
| API | Runs it under PM2 as the `ubms` user, and restarts it after crashes and reboots. |
| Backups | Backs up the database and photos every night at 02:30 to `/opt/ubms/backups`, keeping 14 days. |

Optional settings:
- `LE_EMAIL=you@example.com` gets certificate expiry emails.
- `SEED_DEMO=0` skips the demo accounts.

Running the script again is safe. It keeps existing data, `.env` and passwords.

## Updating after changes are merged to main

```bash
sudo bash /opt/ubms/app/deploy/update.sh
```

It takes a backup first. Then it pulls main, installs packages, runs any **new** migrations, rebuilds the frontend and restarts the API.

## Everyday commands

| Task | Command |
|---|---|
| API status and logs | `sudo -u ubms -H pm2 status` / `sudo -u ubms -H pm2 logs ubms-api` |
| Restart the API | `sudo -u ubms -H pm2 restart ubms-api` |
| Back up now | `sudo bash /opt/ubms/app/deploy/backup.sh` |
| Restore the database | `gunzip -c /opt/ubms/backups/db-<date>.sql.gz \| sudo mysql ubuntu_bistro_db` |
| Nginx errors | `sudo tail -50 /var/log/nginx/error.log` |
| Certificate status | `sudo certbot certificates` |

## If the certificate fails

Let's Encrypt limits how many certificates a shared name like sslip.io can get. If yours is refused, the site still runs on plain HTTP. To fix it:
1. Create a free name at [duckdns.org](https://www.duckdns.org) and point it at the server's IP.
2. Run `sudo bash /opt/ubms/app/deploy/setup-server.sh yourname.duckdns.org`.
