## Overview

This project is a browser-based carpark management system. It lets staff run every aspect of the carpark from any Windows PC with a modern browser, with no extra client software required.

The frontend is a React + Vite app, and the backend is a Node.js + Express API with a SQLite database. The system supports:

- **Multi-carpark support** (schema is keyed by `carpark_id`)
- **Flexible customer types**: Short-Term, Long-Term, Annual (and any new types you define)
- **On-account customers** with balances and monthly statements
- **Role-based staff login**
- **Live dashboard metrics** and exportable reports

## Tech stack

- **Frontend**: Vite, TypeScript, React, React Router, shadcn-ui, Tailwind CSS, React Query
- **Backend**: Node.js, Express, SQLite (via `better-sqlite3`)
- **Auth**: JWT-based staff login with roles (`ADMIN`, `MANAGER`, `ATTENDANT`)
- **Email**: SMTP via `nodemailer` for monthly on-account statements
- **Scheduling**: `node-cron` (runs the 20th-of-month statement job)

## Database schema (high level)

The backend database is defined in `server/schema.sql` and is designed to scale to additional carparks:

- **`carparks`**: each carpark (name, location, capacity, timezone).
- **`staff_users`**: staff accounts with role and optional `carpark_id`.
- **`customer_types`**: per-carpark parking products:
  - `SHORT_TERM`, `LONG_TERM`, `ANNUAL`
  - hourly / daily / monthly / annual pricing fields
  - expiry + access limits (max hours per session, max sessions/day, allow overnight).
- **`customers`**: individual customers for a carpark, linked to a `customer_type`, including:
  - license plate, contact details, status
  - `account_balance_cents` and `account_billing_enabled` for on-account parking.
- **`parking_sessions`**: each parking stay:
  - start/end time, duration, total fee, payment method, status (`ACTIVE`/`COMPLETED`).
- **`transactions`**: financial ledger for each customer:
  - charges, payments, adjustments, running balance.
- **`email_statements`**: record of monthly on-account statements that were emailed.

All key business entities are keyed by `carpark_id` so you can add more carparks by inserting new rows into `carparks`.

## Running locally on Windows

### Prerequisites

- Node.js 18+ and npm installed
- A terminal (PowerShell or Command Prompt)

### 1. Install dependencies

From the project root:

```powershell
cd c:\Users\MEDIAWORKS\Downloads\park-refine-main
npm install

# Install backend dependencies
cd server
npm install
```

### 2. Configure environment

From the project root, copy the sample env file:

```powershell
cd c:\Users\MEDIAWORKS\Downloads\park-refine-main
copy .env.example .env
```

Edit `.env` and set:

- **VITE_API_BASE_URL**: normally `http://localhost:4000`
- **JWT_SECRET**: change this to a long random string in production
- **SMTP\_***: your SMTP server details so monthly statements really send

If you leave `SMTP_HOST` empty, the backend will **log emails to the console instead of sending**, which is useful for testing.

### 3. Start the backend API

In a terminal:

```powershell
cd c:\Users\MEDIAWORKS\Downloads\park-refine-main\server
npm start
```

This will:

- Create a SQLite database file `carpark.db`
- Apply the schema in `schema.sql`
- Seed:
  - One carpark: **Kerikeri Car Storage**
  - Three customer types: **Short-Term**, **Long-Term**, **Annual**
  - An admin staff user:
    - Email: `admin@example.com`
    - Password: `Admin123!`
  - Sample customers and on-account transactions for demo data

The API listens on `http://localhost:4000` by default.

### 4. Start the frontend

In another terminal:

```powershell
cd c:\Users\MEDIAWORKS\Downloads\park-refine-main
npm run dev
```

By default the app runs at `http://localhost:5173`.

### 5. Log in and use the system

1. Open `http://localhost:5173` in your browser.
2. Log in with:
   - **Email**: `admin@example.com`
   - **Password**: `Admin123!`
3. After login you can:
   - Access the **Dashboard** with live revenue / usage / occupancy.
   - Manage **Customers** (Short-Term, Long-Term, Annual).
   - Manage **Parking Sessions** (start new entries, check out to on-account).
   - View **Reports** and export CSV/PDF.

## Role-based login

Staff users live in the `staff_users` table and have a `role`:

- **ADMIN**: full access, can create customer types and run the manual statement job.
- **MANAGER**: operational management (similar to admin, can configure products).
- **ATTENDANT**: daily operations (sessions, customer lookup) but no configuration.

Auth is via JWT:

- `POST /api/auth/login` returns `{ token, user }`.
- The frontend stores the token in `localStorage` and includes it as `Authorization: Bearer …`.
- Protected routes use a small `RequireAuth` wrapper to prevent anonymous access.

## Monthly on-account statements

- A scheduler runs in the backend (`node-cron` in `server/scheduler.js`).
- Every day at 02:00 it checks if the day-of-month is **20**.
- On the 20th it:
  - Finds all customers with `account_balance_cents > 0` and `account_billing_enabled = 1`.
  - Collects their transactions for the current month.
  - Generates a statement email with:
    - Transaction table
    - Current balance
    - A payment link URL
  - Sends via SMTP (or logs to console if SMTP is not configured).
  - Records each statement in `email_statements`.

For testing without waiting for the 20th, as an **ADMIN** you can call:

- `POST /api/dev/run-statement-job`

(e.g. via Postman or `curl` with your `Authorization` header) and watch the console / SMTP logs.

## Key API endpoints (backend)

- **Auth**
  - `POST /api/auth/login` – staff login (email, password).
  - `GET /api/auth/me` – fetch current staff profile.
- **Customer types**
  - `GET /api/customer-types` – list types for the current carpark.
  - `POST /api/customer-types` – create a new product (ADMIN/MANAGER).
- **Customers**
  - `GET /api/customers?search=&type=` – list + filter customers.
  - `POST /api/customers` – create customer.
  - `PUT /api/customers/:id` – update customer.
  - `DELETE /api/customers/:id` – delete customer.
- **Parking sessions**
  - `GET /api/sessions` – active and completed sessions.
  - `POST /api/sessions` – start a new entry.
  - `POST /api/sessions/:id/checkout` – complete a session, charge on-account, and create a transaction.
- **Dashboard / reports**
  - `GET /api/dashboard/summary` – revenue today, usage by type, occupancy, active cars.
  - `GET /api/reports/summary?period=&type=` – revenue series, usage breakdown, period summary.
  - `GET /api/reports/export?format=csv|pdf` – CSV/PDF export of revenue transactions for a period.
- **Scheduler testing**
  - `POST /api/dev/run-statement-job` – run the monthly statement job immediately (ADMIN only).

These endpoints are what the existing React UI now calls via a small API helper in `src/lib/api.ts`.

## Production deployment notes

For a simple single-server deployment:

- Run the backend as a long-lived Node process (e.g. `pm2` or a Windows service) so the scheduler can fire.
- Point the React frontend at the backend URL via `VITE_API_BASE_URL`.
- Use a more robust database (e.g. PostgreSQL) if you expect high write concurrency or many carparks; the current schema maps cleanly to a relational DB.

