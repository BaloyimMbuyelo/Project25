# Ubuntu Bistro Management System (UBMS)

A restaurant management system for Ubuntu Bistro, built as our Year 3 project. Customers can browse the menu, order and book tables. Staff can manage orders, reservations, stock, payments, the menu, users and reports.

| Part | Technology | Folder |
|---|---|---|
| Frontend | React 19 with Vite | [frontend/](frontend/) |
| Backend API | Node.js 22 and Express 5 | [backend/](backend/) |
| Database | MySQL 8.0 | [database/](database/) |

The full list of API endpoints, with request and response examples, is in [docs/API.md](docs/API.md).

---

## 1. What you need

- **Node.js 22** or later ([nodejs.org](https://nodejs.org)). Check with `node -v`.
- **MySQL Server 8.0**, with the root password you chose when installing it.
- **Git**.

> **Windows: is `mysql` on your PATH?** Run `mysql --version`. If you see *"'mysql' is not recognized"*, add MySQL's `bin` folder for the current window:
>
> - Command Prompt: `set "PATH=%PATH%;C:\Program Files\MySQL\MySQL Server 8.0\bin"`
> - PowerShell: `$env:PATH += ";C:\Program Files\MySQL\MySQL Server 8.0\bin"`

The commands below are for **Command Prompt (cmd)**. Where PowerShell needs something different, it is shown as well.

---

## 2. Get the code

```bat
git clone https://github.com/BaloyimMbuyelo/Project25.git
cd Project25
```

---

## 3. Set up the database

Run these from the `Project25` folder **in this order**. Each one asks for your MySQL root password.

```bat
mysql -u root -p < database\ubuntu_bistro_database.sql
mysql -u root -p ubuntu_bistro_db < database\ubms_database_extension.sql
mysql -u root -p ubuntu_bistro_db < database\migrations\001_reservations_inventory_payments.sql
mysql -u root -p ubuntu_bistro_db < database\migrations\002_orders_users_auth.sql
mysql -u root -p ubuntu_bistro_db < database\migrations\003_menu.sql
```

**PowerShell** doesn't support `<`, so wrap each line in `cmd /c "..."`. For example:

```powershell
cmd /c "mysql -u root -p < database\ubuntu_bistro_database.sql"
```

| File | What it does |
|---|---|
| `ubuntu_bistro_database.sql` | Creates the `ubuntu_bistro_db` database and the original menu table with sample dishes. |
| `ubms_database_extension.sql` | Adds roles, users, orders, tables, stock, suppliers, payments and the audit log. |
| `001_reservations_inventory_payments.sql` | Reservations, stock movements, payment methods and tables T1–T8. |
| `002_orders_users_auth.sql` | Order statuses and channels, account lockout and audit log columns. |
| `003_menu.sql` | Menu categories, active/inactive dishes and price checks. |

The migrations are safe to run again. If one fails partway, fix the cause and re-run that file.

> **Warning:** migration 001 drops and recreates the `reservations`, `payments` and `stock_movements` tables. Run it on a new or test database, not one with real data.

**Already set up from an earlier version?** Run only the migrations you haven't applied yet. For example, if you set up before the menu changes, run just `003_menu.sql`.

---

## 4. Set up and start the backend

```bat
cd backend
npm install
copy .env.example .env
```

PowerShell: use `Copy-Item .env.example .env` instead of `copy`.

Open `backend\.env` and fill in:

| Setting | What to put |
|---|---|
| `DB_PASSWORD` | Your MySQL root password. |
| `JWT_SECRET` | A long random value. Generate one with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` and paste the output. |

The other settings can stay as they are for local use. `.env` is ignored by Git, so your passwords never get committed.

**Add the demo accounts** (one-off). Set a password for them, then run the seed script:

```bat
set "DEMO_PASSWORD=Bistro2026"
npm run seed:demo
```

PowerShell:

```powershell
$env:DEMO_PASSWORD='Bistro2026'; npm run seed:demo
```

Keep the quotes in the cmd version. Without them, cmd can add a trailing space to the password. The password must be at least 8 characters, with an upper-case letter, a lower-case letter and a digit. Running the script again skips accounts that already exist, so it won't change their passwords.

**Start the API:**

```bat
npm run dev
```

It runs on http://localhost:5000. Leave this window open.

---

## 5. Start the frontend

Open a **second** terminal window in the `Project25` folder:

```bat
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 in your browser.

The frontend calls the API at `http://localhost:5000` by default. If your API runs somewhere else, create `frontend\.env.local` containing `VITE_API_URL=http://your-host:port`.

---

## 6. Log in

| Page | Address |
|---|---|
| Customer menu and cart | http://localhost:5173/menu |
| Staff login | http://localhost:5173/staff/login |

Demo accounts (password = whatever you set `DEMO_PASSWORD` to):

Every staff role can use the Dashboard and Orders. Each role also gets:

| Role | Email | Also can use |
|---|---|---|
| Administrator | admin@ubms.local | Everything, including users and the audit log |
| Manager | manager@ubms.local | Menu, reservations, stock, payments, reports |
| Waiter | waiter@ubms.local | Reservations |
| Kitchen Staff | kitchen@ubms.local | Stock |
| Cashier | cashier@ubms.local | Payments and receipts |
| Customer | thabo.nkosi@example.com | Customer login (`/api/auth/login`), not the staff pages |

**Login rules:**
- **Lockout:** five wrong passwords lock an account for 15 minutes.
- **Session length:** a session lasts 8 hours, and you're logged out after 30 minutes of inactivity.
- **Password change:** users created by an administrator must change their password the first time they log in.

---

## 7. Run the tests

From the `backend` folder:

```bat
npm test
```

Without a database, this runs the unit tests and skips the integration tests.

To run **all** tests, including the API tests that use a real database:

```bat
set "RUN_DB_TESTS=1"
npm test
```

PowerShell: `$env:RUN_DB_TESTS='1'; npm test`

The integration tests use the database settings from `backend\.env`. They create their own test rows and delete them afterwards. Even so, point them at a test copy of the database (all five SQL files applied), not one with real data.

---

## 8. Project layout

```
Project25/
├── backend/
│   ├── app.js, server.js      Express app and startup
│   ├── config/                Database connection and settings (limits, VAT, lockout)
│   ├── routes/                URL → controller, with role checks
│   ├── controllers/           Reads the request, sends the response
│   ├── services/              Business rules (status changes, totals, clash checks)
│   ├── repositories/          SQL queries
│   ├── validation/            Request rules (zod)
│   ├── middleware/            Login check, roles, rate limit, uploads, errors
│   ├── utils/                 Money, references, passwords, image processing
│   ├── scripts/seedDemo.js    Demo accounts and sample data
│   └── tests/                 Unit and integration tests (Jest + Supertest)
├── frontend/
│   └── src/
│       ├── api/               One API client; one function per endpoint
│       ├── auth/              Session, roles and route guards
│       ├── layouts/           Staff layout with role-based navigation
│       ├── pages/             One page per module
│       └── components/        Shared pieces (receipt, etc.)
├── database/
│   ├── ubuntu_bistro_database.sql
│   ├── ubms_database_extension.sql
│   └── migrations/            001, 002, 003 (run in order)
└── docs/
    └── API.md                 Endpoint reference
```

Every backend request follows the same path: **route → controller → service → repository**. Successful responses look like `{ "data": ..., "message": "..." }`. Errors look like `{ "error": { "code", "message", "fields" } }`. The details are in [docs/API.md](docs/API.md).

---

## 9. Common problems

| Problem | Fix |
|---|---|
| `'mysql' is not recognized` | Add MySQL's `bin` folder to PATH (see section 1). |
| `'Copy-Item' is not recognized` | You're in cmd. Use `copy .env.example .env`. |
| `Access denied for user 'root'@'localhost'` | Wrong `DB_PASSWORD` in `backend\.env`. |
| `Unknown column ...` or `Table ... doesn't exist` | A migration is missing. Run the SQL files in section 3 in order. |
| Logins fail with a server error, and the backend window shows `JWT_SECRET is not configured` | Fill in `JWT_SECRET` in `backend\.env` and restart `npm run dev`. |
| Login says the account is locked | Wait 15 minutes, or ask an administrator to reset the password. |
| Browser shows *"Unable to reach the server"* | The backend isn't running, or `VITE_API_URL` points to the wrong address. |
| `Set DEMO_PASSWORD ...` when seeding | Set `DEMO_PASSWORD` first (section 4). `DEMO_PASSWORD=... npm run seed:demo` doesn't work on Windows. |

---

## 10. Contributing

- **Never commit to `main`.** Create a branch (`git checkout -b feature/short-name`), push it, and open a pull request. `main` is protected and needs one approving review before anything merges.
- **Database changes go in a new migration**, for example `database/migrations/004_....sql`. Don't edit the existing SQL files, because teammates have already run them. Make each migration safe to re-run.
- **Run `npm test` in `backend`** before opening a pull request.
- **Keep secrets out of the repo.** Real passwords and `JWT_SECRET` belong in `.env` only.
