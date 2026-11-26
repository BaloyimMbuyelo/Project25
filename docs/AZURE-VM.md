# Connecting to the Azure VM (live demo server)

The live UBMS demo runs on one Ubuntu 24.04 VM in Azure. This guide covers the website, logging in to the server, and viewing its database.

> **This repository is public.** Never commit passwords, private keys or `.env` files. Ask Chris for the database viewer password, and share it privately (e.g. on WhatsApp), not in GitHub.

| What | Value |
|---|---|
| Website | https://70-153-143-58.sslip.io (use the name, not the IP: the HTTPS certificate is for the name) |
| Server IP | 70.153.143.58 |
| SSH user | `azureuser` |
| Open ports | 22 (SSH), 80 and 443 (website). MySQL (3306) and the API (5000) are **not** reachable from the internet. |
| App folder | `/opt/ubms/app` (the code), `/opt/ubms/uploads` (menu photos), `/opt/ubms/backups` (nightly backups) |
| Demo logins | As in the main README (password `Bistro2026`) |

---

## 1. Get SSH access (once per person)

The server only accepts SSH keys, not passwords. Each team member makes their own key and sends the **public** half to Chris.

**Make a key:** in Command Prompt, run:

```bat
ssh-keygen -t ed25519 -f %USERPROFILE%\.ssh\ubms_ed25519 -C "your-name"
type %USERPROFILE%\.ssh\ubms_ed25519.pub
```

Send Chris the line that starts with `ssh-ed25519`. **Never share the file without `.pub`**: that's your private key.

**Add the key (Chris):** in the Azure portal Cloud Shell, run:

```powershell
az vm user update -g ubms-rg -n ubms-server -u azureuser --ssh-key-value "ssh-ed25519 AAAA... their-name"
```

This adds the key without removing anyone else's.

**Connect:**

```bat
ssh -i %USERPROFILE%\.ssh\ubms_ed25519 azureuser@70.153.143.58
```

The first time, answer `yes` to the fingerprint question. `azureuser` can use `sudo`, so be careful.

---

## 2. View the live database (MySQL Workbench)

MySQL is closed to the internet. You reach it through an **SSH tunnel**: your PC's port 3307 is forwarded to MySQL on the server.

**Step 1: open the tunnel.** Do this in a separate Command Prompt and leave the window open:

```bat
ssh -i %USERPROFILE%\.ssh\ubms_ed25519 -N -L 127.0.0.1:3307:127.0.0.1:3306 azureuser@70.153.143.58
```

It shows nothing while it's working. Press **Ctrl+C** to close it. Port 3307 is used so it doesn't clash with your own MySQL on 3306.

**Step 2: connect in MySQL Workbench.** Click **+** next to *MySQL Connections*:

| Field | Value |
|---|---|
| Connection Method | Standard (TCP/IP) |
| Hostname | `127.0.0.1` |
| Port | `3307` |
| Username | `ubms_viewer` |
| Password | ask Chris, then click *Store in Vault* |
| Default Schema | `ubuntu_bistro_db` |

`ubms_viewer` is **read-only** (SELECT only), so nothing can be changed by accident. Running `SELECT @@hostname;` should return `ubms-server`, which shows you're on the VM, not your local database.

**Command line instead:** while the tunnel is open, run:

```bat
mysql -h 127.0.0.1 -P 3307 -u ubms_viewer -p ubuntu_bistro_db
```

**Useful queries:**

```sql
-- One order from lines to payment (replace 8 with any order_id)
SELECT o.order_id, o.order_status, o.total_amount, m.name, oi.quantity, oi.unit_price, p.receipt_number
FROM orders o
JOIN order_items oi ON oi.order_id = o.order_id
JOIN menu_items m ON m.id = oi.menu_item_id
LEFT JOIN payments p ON p.order_id = o.order_id
WHERE o.order_id = 8;

-- Latest audit entries: who did what, when
SELECT created_at, action, user_id, description FROM audit_logs ORDER BY log_id DESC LIMIT 20;

-- Users and roles
SELECT u.full_name, u.email, r.role_name, u.status FROM users u JOIN roles r ON r.role_id = u.role_id;

-- Booking requests waiting for a table
SELECT reservation_ref, reservation_date, start_time, party_size, status FROM reservations WHERE status = 'PENDING';
```

---

## 3. Everyday server commands

Run these after connecting with SSH (section 1):

| Task | Command |
|---|---|
| API status / logs | `sudo -u ubms -H pm2 status` · `sudo -u ubms -H pm2 logs ubms-api` |
| Restart the API | `cd /opt/ubms && sudo -u ubms -H pm2 restart ubms-api` |
| Deploy the latest `main` | `sudo bash /opt/ubms/app/deploy/update.sh` (backs up first) |
| Back up now | `sudo bash /opt/ubms/app/deploy/backup.sh` |
| Open MySQL as admin | `sudo mysql ubuntu_bistro_db` (full access, so be careful) |
| Website errors | `sudo tail -50 /var/log/nginx/error.log` |

The `deploy/` scripts come from the deployment kit, PR #9.

**First update after the PRs merge:** until now, files were copied onto the server by hand, so its `app` folder has local changes and an untracked `deploy/` folder, and `git pull` would refuse to run. The first time only, set them aside and pull by hand, then run the update:

```bash
sudo -u ubms -H git -C /opt/ubms/app stash -u
sudo -u ubms -H git -C /opt/ubms/app pull --ff-only
sudo bash /opt/ubms/app/deploy/update.sh
```

---

## 4. Costs and shutting down

- **Size and cost:** the VM is a `Standard_B2ts_v2` and uses about **US$10 a month** of the Azure for Students credit while it runs.
- **Pausing it:** *Stop* it in the Azure portal (VM → **Stop**) to pause the charge. The public IP may change after a stop/start, which needs a new certificate: run `sudo bash /opt/ubms/app/deploy/setup-server.sh` again.
- **When marking is done:** delete the resource group `ubms-rg` to remove everything.
