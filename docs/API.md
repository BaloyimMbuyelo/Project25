# UBMS API reference

The REST API behind the Ubuntu Bistro Management System. It covers every endpoint once **PR #4** (orders, users, reports, login) and **PR #5** (menu, photos) are merged.

- Base URL in development: `http://localhost:5000`
- All bodies are JSON unless stated otherwise.
- Examples below are real responses from the running API, trimmed to one list item.
- System Design references are in brackets, e.g. (P7, Table 30).

**Contents:** [Quick start](#quick-start-for-the-frontend) · [Changes from `main`](#what-changed-compared-with-main) · [Conventions](#conventions) · [Auth](#auth-apiauth) · [Menu](#menu-apiv1menu) · [Orders](#orders-apiv1orders) · [Reservations](#reservations-apiv1reservations) · [Inventory](#inventory-apiv1inventory) · [Payments](#payments-apiv1payments) · [Users and audit](#users-and-audit-apiv1users-apiv1audit) · [Reports](#reports-apiv1reportstype) · [Database changes](#database-changes) · [Images](#menu-images-existing-and-uploaded)

---

## Quick start for the frontend

Everything here is already wrapped in `frontend/src/api/modules.js`, so you shouldn't need to write `fetch` calls:

| Import | Covers |
|---|---|
| `authApi` | `login`, `staffLogin`, `register`, `logout`, `me`, `changePassword` |
| `menuApi`, `menuImageSrc` | menu items, categories, photo upload, image URLs |
| `ordersApi` | place, list, get, `setStatus`, cancel |
| `reservationsApi` | list, get, availability, tables, create, update, `changeStatus` |
| `inventoryApi` | list, lowStock, create, update, setActive, recordMovement, movements |
| `paymentsApi` | methods, payableOrders, order, list, record, receipt, void |
| `usersApi` | roles, list, create, update, setStatus, resetPassword, audit |
| `reportsApi` | `run(type, query)`, `csvUrl(type, query)` |

Each function returns the response envelope `{ data, message }`. Errors throw an `ApiError` with `.status`, `.message`, `.fields`, `.details` and a `.fieldErrors()` helper that returns `{ field: message }` for showing errors under inputs.

```js
import { ordersApi } from '../api/modules';

try {
  const { data, message } = await ordersApi.place({ order_type: 'COLLECTION', lines: [{ menu_item_id: 2, quantity: 2 }] });
  showToast('success', message);            // "Order placed successfully"
  navigate(`/orders/${data.order_ref}/confirmation`);
} catch (err) {
  if (err.fields.length) setFieldErrors(err.fieldErrors());
  else showToast('error', err.message);     // e.g. "Bobotie is no longer available."
}
```

---

## What changed compared with `main`

`main` currently has PR #2 only. If your screens were built against `main`, these are the changes in PRs #4 and #5:

| Area | Before (`main`) | After (#4, #5) |
|---|---|---|
| **Staff login** | `POST /api/auth/login`, token in the response body, sent as `Authorization: Bearer` | `POST /api/auth/staff-login`. The token is an **httpOnly cookie**; JavaScript never sees it. Send requests with `credentials: 'include'`, which `api/client.js` already does. |
| **Customer login** | `POST /api/auth/login` (any role) | `POST /api/auth/login` is **customers only**; staff get 403 "Please use the correct login page." |
| **Session in the browser** | `sessionStorage` held `{ token, user }` | `sessionStorage` holds `{ user }` only (`auth/session.js`). |
| **Order status values** | `ACCEPTED` | `CONFIRMED` (migration 002) |
| **Order type values** | `TAKEAWAY` | `COLLECTION` (migration 002) |
| **Menu changes** | `POST/PUT/PATCH/DELETE /api/menu/...`, no login | `/api/v1/menu/items...`, **Manager or Administrator only**. The old address now answers **410**. |
| **Menu reads** | `GET /api/menu` | Still works, with the same shape. The new address is `GET /api/v1/menu/items`. |
| **Menu fields** | `id`, `category` (text), `image`, `available` | `menu_item_id`, `category_id` + `category_name`, `image_path`, `is_available` |
| **Menu delete** | Permanent | Soft delete. The item disappears from the menu but past orders keep it. |
| **Errors** | Mixed `{ message }` | Always `{ error: { code, message, fields, details? } }` |

---

## Conventions

### Login cookie

- A successful login sets `ubms_token` (`HttpOnly; Secure; SameSite=Strict`, 8 hours).
- Open the site **and** the API as `localhost`. If one is opened as `127.0.0.1`, the browser treats them as different sites and won't send the cookie.
- After **30 minutes of inactivity** the frontend logs out (`auth/useIdleLogout.js`).
- A **401** from any endpoint means the session has ended: clear the user and go to the login page. `api/client.js` does this and fires `ubms:session-expired`.

### Responses

```jsonc
// success
{ "data": { ... }, "message": "Order placed successfully" }   // message only on writes

// error
{ "error": { "code": "VALIDATION_ERROR", "message": "First name must be 2–50 characters.",
             "fields": [ { "field": "first_name", "message": "First name must be 2–50 characters." } ] } }
```

| Status | `error.code` | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Bad input. `fields[]` lists each field and its message (e.g. `lines.0.quantity`). |
| 401 | `UNAUTHENTICATED` | Not logged in, or the session expired: "Your session has expired. Please log in again." |
| 403 | `FORBIDDEN` | The role isn't allowed, or the record isn't theirs: "You don't have access to this page." |
| 403 | `PASSWORD_CHANGE_REQUIRED` | The user still has a temporary password and must call `change-password` first. |
| 404 | `NOT_FOUND` | Record not found (or deleted). |
| 409 | `CONFLICT` | Business rule, e.g. double booking, wrong status step, already paid, not enough stock. Some include `details`. |
| 410 | `MOVED` | Old `/api/menu` change endpoints. |
| 429 | `ACCOUNT_LOCKED` / `TOO_MANY_REQUESTS` | 5 wrong passwords lock an account for 15 minutes, and each IP is limited to 20 login attempts per 15 minutes. |
| 500 | `SERVER_ERROR` | "Something went wrong. Please try again." Details are only logged on the server. |

### Formats

- **Money:** a number in rand with 2 decimals, e.g. `275` or `99.5`. Display as `R275.00` (`utils/format.js` → `formatRand`).
- **Dates:** `YYYY-MM-DD`. **Times:** `HH:MM`. **Timestamps:** ISO strings (UTC), so use `formatDateTime`.
- **References:** orders `UB-0105`, reservations `RS-0240`, receipts `RC-000512`. Order endpoints accept `UB-0105`, `ub105` or `105`.
- **Paged lists** (`/orders`, `/audit`): `?page=1&limit=25` returns `page`, `limit`, `total` and `pages`.

### Roles

`Administrator`, `Manager`, `Waiter`, `Kitchen Staff`, `Cashier`, `Customer`. These exact strings are in `auth/permissions.js` → `ROLES`. "Staff" below means every role except Customer.

---

## Auth (`/api/auth`)

| Method & path | Who | Body | Success |
|---|---|---|---|
| `POST /register` | Public | `{ first_name, last_name, email, phone, password, confirm_password }` | 201 `{ data: { user_id } }` "Registration successful. Please log in." |
| `POST /login` | Public (customers) | `{ email, password }` | 200 `{ data: { user } }` + cookie |
| `POST /staff-login` | Public (staff) | `{ email, password }` | 200 `{ data: { user } }` + cookie |
| `POST /logout` | Anyone | – | 200, cookie cleared |
| `GET /me` | Logged in | – | 200 `{ data: { user } }` |
| `POST /change-password` | Logged in | `{ current_password, new_password, confirm_password }` | 200 `{ data: { user } }` |

**Rules**
- Registration: names 2–50 letters, spaces, hyphens and apostrophes. Phone `0XXXXXXXXX` or `+27XXXXXXXXX` (spaces allowed). Password at least 8 characters with upper-case, lower-case and a digit, and not a common password.
- Login errors: wrong password or unknown email → 401 "Incorrect email or password." (never says which). Inactive account (only after the right password) → 403 "Your account is inactive. Contact your manager." Wrong portal → 403. Locked → 429.

```jsonc
// POST /api/auth/staff-login  { "email": "manager@ubms.local", "password": "Bistro2026" }
// 200   Set-Cookie: ubms_token=<token>; Max-Age=28800; Path=/; HttpOnly; Secure; SameSite=Strict
{ "data": { "user": { "user_id": 2, "full_name": "Thandi Manager", "email": "manager@ubms.local", "phone": null,
  "role": "Manager", "status": "ACTIVE", "must_change_pw": false, "last_login_at": "2026-11-19T04:52:07.853Z" } },
  "message": "Login successful." }
```

If `must_change_pw` is `true`, show the change-password form before anything else. `pages/StaffLogin.jsx` already does this.

---

## Menu (`/api/v1/menu`)

Reading is **public**. Every change needs a **Manager or Administrator** and is audited (P9).

| Method & path | Who | Body / query | Success |
|---|---|---|---|
| `GET /categories` | Public | – | Active categories, sorted |
| `POST /categories` | Mgr, Admin | `{ name, description?, sort_order? }` | 201 |
| `PUT /categories/:id` | Mgr, Admin | same | 200 |
| `PATCH /categories/:id/status` | Mgr, Admin | `{ is_active }` | 200. 409 if it still has items. |
| `GET /items` | Public | `?category_id=&search=&available_only=true` | Active items (available **and** unavailable) |
| `GET /items/:id` | Public | – | 404 if deleted |
| `POST /items` | Mgr, Admin | `{ name, category_id, price, description?, is_available? }` | 201 |
| `PUT /items/:id` | Mgr, Admin | same (all fields) | 200. A price change is logged as `PRICE_CHANGED`. |
| `PATCH /items/:id/availability` | Mgr, Admin | `{ is_available }` | 200 |
| `DELETE /items/:id` | Mgr, Admin | – | 200 soft delete: "Menu item removed. Past orders that include it are kept." |
| `POST /items/:id/image` | Mgr, Admin | **multipart**, field `image` | 200, item with the new `image_path` |
| `DELETE /items/:id/image` | Mgr, Admin | – | 200, `image_path: null` |

**Rules**
- Name: 1–50 characters, unique among items still on the menu (409 "A menu item called 'X' already exists.").
- Price: more than 0, up to 999.99, 2 decimals (400 "Please enter a valid price.").
- Description: up to 255 characters.
- Unavailable items stay in `GET /items`, so **grey them out** (Q3). They can't be ordered.
- Deleted items disappear from all lists and can't be ordered, and their name can be reused.

```jsonc
// GET /api/v1/menu/categories
{ "data": [ { "category_id": 1, "name": "Starters", "description": null, "sort_order": 1, "is_active": true, "item_count": 1 } ] }

// POST /api/v1/menu/items  { "name": "Bobotie", "category_id": 2, "price": 120, "description": "Spiced mince bake" }
// 201
{ "data": { "menu_item_id": 11, "name": "Bobotie", "description": "Spiced mince bake", "category_id": 2,
  "category_name": "Main Course", "price": 120, "image_path": null, "is_available": true,
  "updated_at": "2026-11-19T04:52:09.000Z" }, "message": "Menu item added successfully" }
```

**Photo upload:**

```js
// frontend: menuApi.uploadImage(itemId, file)  - file from <input type="file" accept="image/jpeg,image/png,image/webp">
// response: same item shape, e.g. "image_path": "/uploads/menu/item-11-dc785e586af3da9f.webp", message "Photo uploaded"
```

- Up to **1 MB**. The type is checked from the file's contents, so only JPEG, PNG and WebP are accepted, whatever the file name or browser says.
- The server resizes to fit **800 px**, converts to **WebP**, removes camera and location data, and saves under a random name. Replacing or removing a photo deletes the old file.
- Errors (all 400, `fields[0].field === 'image'`): "Image must be 1 MB or smaller.", "Upload a JPEG, PNG or WebP image.", "The image could not be read. Try a different file.", "Choose an image to upload."

**Old address (read-only):** `GET /api/menu` and `GET /api/menu/:id` still return the original shape (`id`, `name`, `description`, `category`, `price`, `image`, `available` as 0/1), so `CustomerMenu.jsx` works unchanged. Any other method answers **410** `MOVED`. Move screens to `/api/v1/menu/items` when convenient.

---

## Orders (`/api/v1/orders`)

(P4, P5, Figure 7)

| Method & path | Who | Body / query | Success |
|---|---|---|---|
| `POST /` | Customer, Waiter, Manager | see below | 201 order with `lines` |
| `GET /` | All roles | `?status=&date=YYYY-MM-DD&search=&order_type=&needs_action=true&page=&limit=` | `{ orders, page, limit, total, pages, summary? }` |
| `GET /:ref` | All roles | – | Order with `lines` and `payment` |
| `PATCH /:ref/status` | Waiter, Kitchen, Cashier, Manager | `{ status }`, the next step only | 200 |
| `POST /:ref/cancel` | Customer, Waiter, Manager | `{ reason }` (required for staff) | 200 |

**Placing an order**

```jsonc
{
  "order_type": "COLLECTION",            // or "DINE_IN" (no delivery, Q4)
  "table_id": 3,                         // required for DINE_IN
  "special_instructions": "Extra napkins",
  "lines": [ { "menu_item_id": 2, "quantity": 2, "notes": "No onions" } ],   // 1-50 lines, quantity 1-25
  // staff only (optional):
  "customer_id": 6,                      // a registered customer, or
  "guest_name": "Thabo N", "guest_phone": "0821234567"   // required for staff COLLECTION orders
}
```

- **Don't send prices or totals.** The server reads prices from the menu inside the transaction.
- 409 "{name} is no longer available." if an item was switched off or deleted.
- Customers get `sales_channel: "ONLINE"`; staff orders are `"IN_HOUSE"`. A staff dine-in order without a name is named after its table ("Table T3").

```jsonc
// 201
{ "data": { "order_id": 13, "order_ref": "UB-0013", "order_type": "COLLECTION", "sales_channel": "ONLINE",
  "order_status": "PENDING", "status_label": "Pending", "next_status": "CONFIRMED",
  "customer_id": 6, "customer_name": "Thabo Nkosi", "customer_phone": "0821234567",
  "table_id": null, "table_number": null, "staff_name": null, "special_instructions": "Extra napkins",
  "cancel_reason": null, "item_count": 2, "total": 240,
  "time_placed": "2026-11-19T04:52:09.000Z", "status_updated_at": "2026-11-19T04:52:09.000Z",
  "lines": [ { "order_item_id": 18, "menu_item_id": 2, "name": "Beef Burger", "quantity": 2,
               "unit_price": 120, "line_total": 240, "notes": "No onions" } ],
  "payment": null }, "message": "Order placed successfully" }
```

**Status workflow:** `PENDING → CONFIRMED → PREPARING → READY → COMPLETED`, plus `CANCELLED`.

| Next status | Who can set it |
|---|---|
| `CONFIRMED` | Waiter, Manager |
| `PREPARING`, `READY` | Kitchen Staff, Manager |
| `COMPLETED` | Waiter, Cashier, Manager. Needs a recorded payment; recording a payment on a `READY` order completes it automatically. |

- Each order has `next_status`: offer **only that** in the dropdown.
- Skipping a step → 409 ("…The next step for this order is Preparing."). A closed order → 409. Wrong role → 403.
- **Cancel:** customers can cancel their own order while it's `PENDING`. A Waiter can cancel `PENDING` orders. A Manager can cancel up to `PREPARING`. `READY` and later → 409. Cancelled orders are kept.

**Lists:**
- Customers get only their own orders, newest first, with no `summary`.
- Kitchen Staff get the active queue only (`CONFIRMED`, `PREPARING`, `READY`), oldest first.
- Other staff get `summary` for the dashboard tiles: `{ date, pending, confirmed, preparing, ready, completed, cancelled }`.
- `needs_action=true` returns open orders, oldest first ("Orders needing action").
- **Status tracker:** poll `GET /:ref` every 15 seconds (`STATUS_POLL_SEC`).

---

## Reservations (`/api/v1/reservations`)

(P6, Figure 8, Q9)

| Method & path | Who | Body / query | Success |
|---|---|---|---|
| `GET /availability` | Customer, Waiter, Manager, Admin | `?date=&party_size=` | `{ date, party_size, slots: [{ start_time, available }] }` |
| `GET /tables` | Waiter, Manager, Admin | `?date=&start_time=` | Table plan: each table with `booked`, `booking_ref` |
| `GET /` | Customer (own), Waiter, Manager, Admin | `?date=&status=&search=` | `{ reservations, summary: { total, pending, confirmed, seated } }` |
| `GET /:ref` | same | – | 403 for another customer's booking |
| `POST /` | Customer, Waiter, Manager | see below | 201 |
| `PATCH /:ref` | Waiter, Manager | `{ table_id?, reservation_date?, start_time?, party_size?, special_requests?, guest_name?, guest_phone? }` | 200. Allocating a table makes it `CONFIRMED`; `table_id: null` makes it `PENDING`. |
| `PATCH /:ref/status` | Waiter, Manager | `{ status: SEATED\|COMPLETED\|CANCELLED\|NO_SHOW, reason? }` | 200 |

**Rules**
- Dates from today up to 30 days ahead. Start times 17:00–21:00 in 30-minute steps, and sittings last 2 hours (`end_time` is worked out by the server).
- Party size 1–20, and no more than the table's capacity.
- No overlapping active booking on the same table (back-to-back bookings are fine).
- **Customer booking:** `{ reservation_date, start_time, party_size, special_requests? }` creates a `PENDING` booking with no table. Any `table_id` sent is ignored.
- **Staff booking:** add `guest_name` + `guest_phone` (or `customer_id`), and optionally `table_id`. With a table the booking is `CONFIRMED`.
- **Status changes:** `CONFIRMED → SEATED | NO_SHOW (from 15 minutes after the start) | CANCELLED`, `SEATED → COMPLETED`, `PENDING → CANCELLED`. Bookings are never deleted.

```jsonc
// 409 clash: show the message and offer details.alternatives as buttons
{ "error": { "code": "CONFLICT", "message": "Table T3 is already booked 19:00–21:00 (RS-0006).", "fields": [],
  "details": { "alternatives": [ { "table_id": 1, "table_number": "T1", "start_time": "20:00" } ] } } }
```

Reservation object fields: `reservation_id`, `reservation_ref`, `customer_id`, `guest_name`, `guest_phone`, `customer_name`, `customer_phone`, `table_id`, `table_number`, `table_capacity`, `reservation_date`, `start_time`, `end_time`, `party_size`, `special_requests`, `status`, `cancel_reason`, `created_by`, `created_at`, `updated_at`.

---

## Inventory (`/api/v1/inventory`)

(P8, FR-15 to FR-17)

| Method & path | Who | Body / query | Success |
|---|---|---|---|
| `GET /` | Manager, Admin, Kitchen | `?search=&category=&low=true&include_inactive=true` | `{ items, categories, summary: { total, ok, low, out } }` |
| `GET /low-stock` | same | – | `{ items, count }`, most urgent first |
| `GET /:id` · `GET /:id/movements` | same | – | Item · its latest 50 movements |
| `POST /` | Manager, Admin | `{ item_name, unit, reorder_level, category?, opening_quantity? }` | 201. Opening stock is recorded as a Stock in movement. |
| `PUT /:id` | Manager, Admin | `{ item_name, unit, reorder_level, category? }` | 200. Quantity can't be edited directly. |
| `PATCH /:id/status` | Manager, Admin | `{ is_active }` | 200 (deactivate instead of delete) |
| `POST /:id/movements` | Manager, Admin | `{ movement_type, quantity, reason? }` | 201 `{ new_quantity, stock_status, low_stock }` |

- `movement_type`: `STOCK_IN`, `STOCK_OUT`, `WASTAGE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`.
- `reason` is **required** for wastage and both adjustments.
- `quantity` must be more than 0, with at most 2 decimals.
- Stock can't go negative: 409 "Not enough stock: only 3.50 kg on hand."
- `stock_status`: `OK`, `LOW` (on hand at or below the reorder level) or `OUT` (nothing on hand). Show as OK / LOW STOCK / OUT badges.

```jsonc
// GET /api/v1/inventory
{ "data": { "items": [ { "inventory_item_id": 2, "item_name": "Beef", "category": "Meat", "unit": "kg",
  "quantity_on_hand": 18, "reorder_level": 8, "is_active": true, "updated_at": "…", "stock_status": "OK" } ],
  "categories": ["Dairy", "…"], "summary": { "total": 8, "ok": 5, "low": 2, "out": 1 } } }
```

> **"Inventory database compatibility":** the API uses the existing `ingredients` and `stock_movements` tables, but its JSON uses the design's names: `inventory_item_id` (= `ingredient_id`), `item_name` (= `ingredient_name`) and `quantity_on_hand` (= `quantity_in_stock`). Use the API names on the screen.

---

## Payments (`/api/v1/payments`)

(P7, Q5, Q10) Payments are taken at the counter and recorded here; there is no card gateway.

| Method & path | Who | Body / query | Success |
|---|---|---|---|
| `GET /methods` | Cashier, Manager, Admin | – | `[{ payment_method_id, method_name, requires_reference }]` (Cash, Card (terminal), EFT / QR) |
| `GET /payable-orders` | same | – | Ready orders (and Completed after a void) with no active payment |
| `GET /orders/:orderRef` | same | – | Order + `lines`, `amount_due`, `payable`, `not_payable_reason` |
| `GET /` | same | `?date=&status=PAID\|VOIDED` | `{ date, payments, summary: { count, total_paid, voided, by_method } }` |
| `POST /` | Cashier, Manager | `{ order_ref, payment_method_id, amount_tendered?, reference_number? }` | 201 |
| `GET /:id/receipt` | Cashier, Manager, Admin | – | Receipt with the 15% VAT split |
| `POST /:id/void` | **Manager only** | `{ reason }` | 200. The row is kept, and a new payment can follow. |

- **There's no `amount` field.** The server always charges the order total.
- Cash needs `amount_tendered` of at least the total, and the response includes `change`. Card and EFT need `reference_number`, which must be unique.
- Only one active Paid payment per order (409 "This order already has an active Paid payment."). Only Ready or Completed orders can be paid.

```jsonc
// POST /api/v1/payments  { "order_ref": "UB-0001", "payment_method_id": 1, "amount_tendered": 500 }
// 201
{ "data": { "payment_id": 7, "order_id": 1, "order_ref": "UB-0001", "receipt_number": "RC-000007",
  "customer_name": "Lerato K. (demo)", "order_type": "DINE_IN", "payment_method_id": 1, "method_name": "Cash",
  "amount": 345, "amount_tendered": 500, "change": 155, "reference_number": null, "payment_status": "PAID",
  "paid_at": "…", "recorded_by": "Kagiso Cashier", "void_reason": null, "voided_by": null, "voided_at": null },
  "message": "Payment recorded – change due R155.00" }

// GET /api/v1/payments/7/receipt
{ "data": { "restaurant": { "name": "UBUNTU BISTRO", "tagline": "Good Food. Good People.", "address": "12 Long Street, Cape Town · 021 000 0000" },
  "receipt_number": "RC-000007", "order_ref": "UB-0001", "paid_at": "…", "cashier": "Kagiso Cashier",
  "order_type": "DINE_IN", "table_number": null, "customer_name": "Lerato K. (demo)",
  "lines": [ { "name": "Grilled Chicken", "quantity": 1, "unit_price": 195, "line_total": 195 } ],
  "subtotal_excl_vat": 300, "vat": 45, "total": 345, "method_name": "Cash", "amount_tendered": 500,
  "change": 155, "reference_number": null, "payment_status": "PAID", "void_reason": null } }
```

`components/Receipt.jsx` already renders and prints this.

---

## Users and audit (`/api/v1/users`, `/api/v1/audit`)

**Administrator only** (P11, FR-04, FR-21, Figure 23)

| Method & path | Body / query | Success |
|---|---|---|
| `GET /users/roles` | – | Staff roles (no Customer) |
| `GET /users` | `?type=staff\|customer&role=&status=&search=` | Users (no password data). Customers can be viewed but not edited. |
| `GET /users/:id` | – | User |
| `POST /users` | `{ full_name, email, role, phone? }` | 201 `{ user, temporary_password }` |
| `PUT /users/:id` | same | 200, logged as old → new |
| `PATCH /users/:id/status` | `{ status: ACTIVE\|INACTIVE }` | 200 |
| `POST /users/:id/reset-password` | – | 200 `{ user, temporary_password }` (also clears a lockout) |
| `GET /audit` | `?from=&to=&action=&user_id=&page=&limit=` | `{ from, to, page, limit, total, pages, entries }` |

- **Show `temporary_password` once** (with a copy button). It can't be retrieved again, and the user must change it at first login.
- 409 when an admin tries to deactivate their own account, change their own role, or remove the last active Administrator.
- `email` is the staff username (letters, numbers and `. _ - @`).
- The user object includes `locked: true` while an account is locked out.
- Audit `action` filter examples: `LOGIN_`, `ORDER_`, `PAYMENT_`, `PRICE_CHANGED`, `USER_SAVED`. It matches the start of the action name.

```jsonc
// GET /api/v1/audit?limit=2  - entries[0]
{ "log_id": 123, "user_id": 1, "user_name": "System Admin", "action": "USER_SAVED",
  "details": { "entity": "users", "record_id": 31, "change": "status", "from": "ACTIVE", "to": "INACTIVE" },
  "ip_address": "::1", "created_at": "2026-11-19T04:52:10.000Z" }
```

---

## Reports (`/api/v1/reports/:type`)

**Manager and Administrator** (P10, Figure 33)

`GET /api/v1/reports/{orders|payments|reservations|stock}?from=YYYY-MM-DD&to=YYYY-MM-DD`

- Optional filters: `order_type` (orders report) and `payment_method_id` (payments report).
- `to` must be on or after `from`, and the range can be at most 366 days.
- Add `&format=csv` to download a CSV that opens in Excel (`reportsApi.csvUrl(type, query)` builds the link; the cookie is sent automatically).

The response describes its own table, so one component can draw all four reports:

```jsonc
{ "data": { "type": "orders", "title": "Sales / Orders", "from": "2026-11-19", "to": "2026-11-19", "filters": {},
  "generated_at": "2026-11-19T04:52:10.641Z", "generated_by": "Thandi Manager",
  "columns": [ { "key": "day", "label": "Date", "format": "date" }, { "key": "revenue", "label": "Revenue (R)", "format": "money" } ],
  "rows":    [ { "day": "2026-11-19", "orders": 4, "dine_in": 1, "collection": 3, "revenue": 875, "cancelled": 1 } ],
  "totals":  { "orders": 4, "dine_in": 1, "collection": 3, "revenue": 875, "cancelled": 1 },
  "summary": { "orders": 4, "revenue": 875, "average_order": 291.67, "cancelled": 1, "cancelled_pct": 25 } } }
```

| Type | Rows | Summary |
|---|---|---|
| `orders` | per day: orders, dine-in, collection, revenue, cancelled | orders, revenue, average order, cancelled, cancelled % |
| `payments` | per day and method: payments, total, voided | payments, total, voided, by method |
| `reservations` | per day: bookings, guests, each status | bookings, guests, cancelled, no-shows, no-show rate |
| `stock` | per item: on hand, reorder level, status, received, used, wasted, movements | items, low, out, items with wastage |

`format` is `date`, `money`, `number`, `quantity` or `text`. `totals` is `null` for stock, because the items have different units.

---

## Database changes

Run these **once each, in order**, after `ubuntu_bistro_database.sql` and `ubms_database_extension.sql`. They can all be re-run safely. Run each file **on its own**; combining them in one `mysql -e "source …"` command stops part-way.

```cmd
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < database\migrations\001_reservations_inventory_payments.sql
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < database\migrations\002_orders_users_auth.sql
"C:\Program Files\MySQL\MySQL Server 8.0\bin\mysql.exe" -u root -p < database\migrations\003_menu.sql
```

| Migration | PR | Changes |
|---|---|---|
| `001_reservations_inventory_payments.sql` | #2 (merged) | **Recreates** `reservations` (adds `reservation_ref`, `start_time` / `end_time`, guest name and phone, `NO_SHOW`), `payments` (Paid/Voided, receipt number, cashier, cash tendered, one active payment per order) and `stock_movements` (5 types, `balance_after`, reason). Adds `payment_methods`. Alters `restaurant_tables` (`IN_SERVICE` / `OUT_OF_SERVICE`, seeds T1–T8) and `ingredients` (`category`, `is_active`). |
| `002_orders_users_auth.sql` | #4 | `users`: `failed_logins`, `locked_until`, `last_login_at`, `must_change_pw`. `audit_logs`: `ip_address`. `orders`: `sales_channel`, `special_instructions`, `cancel_reason`, `status_updated_at`, **`ACCEPTED → CONFIRMED`**, **`TAKEAWAY → COLLECTION`**. `order_items`: `notes`, quantity 1–25. |
| `003_menu.sql` | #5 | New `menu_categories` (Starters, Main Course, Desserts, Drinks, plus any existing values). `menu_items`: **`category` text → `category_id`** (the text column is removed), `is_active` (soft delete), price CHECK > 0 and ≤ 999.99, names unique among active items. Duplicate active items are deactivated. |

**Values in the database**

| Column | Values |
|---|---|
| `orders.order_status` | `PENDING`, `CONFIRMED`, `PREPARING`, `READY`, `COMPLETED`, `CANCELLED` |
| `orders.order_type` | `DINE_IN`, `COLLECTION` |
| `orders.sales_channel` | `ONLINE`, `IN_HOUSE` |
| `reservations.status` | `PENDING`, `CONFIRMED`, `SEATED`, `COMPLETED`, `CANCELLED`, `NO_SHOW` |
| `payments.payment_status` | `PAID`, `VOIDED` |
| `stock_movements.movement_type` | `STOCK_IN`, `STOCK_OUT`, `WASTAGE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT` |
| `restaurant_tables.status` | `IN_SERVICE`, `OUT_OF_SERVICE` |
| `users.status` | `ACTIVE`, `INACTIVE` |

**Demo data:** `npm run seed:demo` in `backend`, with `DEMO_PASSWORD` set the right way for your terminal:

| Terminal | Command |
|---|---|
| PowerShell | `$env:DEMO_PASSWORD='Bistro2026'; npm run seed:demo` |
| Command Prompt | `set "DEMO_PASSWORD=Bistro2026"` then `npm run seed:demo` |
| Git Bash / Mac / Linux | `DEMO_PASSWORD=Bistro2026 npm run seed:demo` |

It creates `admin@ubms.local`, `manager@`, `waiter@`, `kitchen@`, `cashier@` and the customer `thabo.nkosi@example.com`, plus 8 stock items and 3 Ready orders. Existing accounts are skipped and their passwords are never changed.

---

## Menu images: existing and uploaded

Both kinds keep working side by side. Nothing needs converting.

| Kind | Stored `image_path` | Where the file is | How to show it |
|---|---|---|---|
| **Existing sample photos** | `/images/restaurant-pictures/beef-burger.jpeg` | `frontend/public/images/` (also served by the API at `/images`) | Use as-is on the frontend |
| **New uploads** | `/uploads/menu/item-11-dc785e586af3da9f.webp` | `backend/uploads/menu/` (or `UPLOAD_DIR`) | Prefix with the API address |

Use the helper, which handles both:

```jsx
import { menuImageSrc } from '../api/modules';
<img src={menuImageSrc(item.image_path)} alt={item.name} />
```

`CustomerMenu.jsx` builds `http://localhost:5000${item.image}`, which also works for both because the API serves `/images` and `/uploads`.

---

*Generated from the running API on 19 Nov 2026 (branch `feature/menu-api`, commit `99366c9`). If an endpoint changes, please update this file in the same pull request.*
