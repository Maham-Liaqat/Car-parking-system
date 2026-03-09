PRAGMA foreign_keys = ON;

-- Car parks that the system can manage
CREATE TABLE IF NOT EXISTS carparks (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  location        TEXT,
  capacity        INTEGER NOT NULL DEFAULT 0,
  timezone        TEXT NOT NULL DEFAULT 'Pacific/Auckland',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Staff users (for role-based login)
CREATE TABLE IF NOT EXISTS staff_users (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  carpark_id      INTEGER,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('ADMIN','MANAGER','ATTENDANT')),
  is_active       INTEGER NOT NULL DEFAULT 1,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (carpark_id) REFERENCES carparks(id) ON DELETE SET NULL
);

-- Customer types are defined per car park (e.g. Short-Term, Long-Term, Annual)
CREATE TABLE IF NOT EXISTS customer_types (
  id                            INTEGER PRIMARY KEY AUTOINCREMENT,
  carpark_id                    INTEGER NOT NULL,
  name                          TEXT NOT NULL,
  billing_mode                  TEXT NOT NULL CHECK (billing_mode IN ('SHORT_TERM','LONG_TERM','ANNUAL')),
  -- Pricing fields (all optional depending on mode)
  hourly_rate_cents             INTEGER,   -- for SHORT_TERM
  daily_rate_cents              INTEGER,   -- optional cap for SHORT_TERM / LONG_TERM
  monthly_rate_cents            INTEGER,   -- for LONG_TERM
  annual_rate_cents             INTEGER,   -- for ANNUAL
  -- Expiry / access rules
  expiry_days                   INTEGER,   -- generic expiry window, if used
  max_parking_hours_per_session INTEGER,
  max_sessions_per_day          INTEGER,
  allow_overnight               INTEGER NOT NULL DEFAULT 1,
  is_on_account                 INTEGER NOT NULL DEFAULT 1, -- can accrue balance
  is_active                     INTEGER NOT NULL DEFAULT 1,
  created_at                    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (carpark_id) REFERENCES carparks(id) ON DELETE CASCADE
);

-- Customers who park at a particular car park
CREATE TABLE IF NOT EXISTS customers (
  id                      INTEGER PRIMARY KEY AUTOINCREMENT,
  carpark_id              INTEGER NOT NULL,
  customer_type_id        INTEGER NOT NULL,
  name                    TEXT NOT NULL,
  email                   TEXT,
  phone                   TEXT,
  license_plate           TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'active', -- active / suspended / expired
  account_balance_cents   INTEGER NOT NULL DEFAULT 0,     -- positive means they owe money
  account_billing_enabled INTEGER NOT NULL DEFAULT 1,
  start_date              DATETIME,
  end_date                DATETIME,
  created_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (carpark_id, license_plate),
  FOREIGN KEY (carpark_id)       REFERENCES carparks(id)       ON DELETE CASCADE,
  FOREIGN KEY (customer_type_id) REFERENCES customer_types(id) ON DELETE RESTRICT
);

-- Individual parking sessions
CREATE TABLE IF NOT EXISTS parking_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  carpark_id        INTEGER NOT NULL,
  customer_id       INTEGER,
  license_plate     TEXT NOT NULL,
  start_time        DATETIME NOT NULL,
  end_time          DATETIME,
  duration_minutes  INTEGER,
  total_fee_cents   INTEGER,
  payment_method    TEXT, -- CASH, CARD, ON_ACCOUNT, ONLINE
  status            TEXT NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / COMPLETED / CANCELLED
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (carpark_id)   REFERENCES carparks(id)   ON DELETE CASCADE,
  FOREIGN KEY (customer_id)  REFERENCES customers(id)  ON DELETE SET NULL
);

-- Financial transactions (charges, payments, adjustments) per customer
CREATE TABLE IF NOT EXISTS transactions (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  carpark_id            INTEGER NOT NULL,
  customer_id           INTEGER,
  parking_session_id    INTEGER,
  type                  TEXT NOT NULL CHECK (type IN ('CHARGE','PAYMENT','ADJUSTMENT')),
  description           TEXT,
  amount_cents          INTEGER NOT NULL, -- positive for charges, negative for payments
  balance_after_cents   INTEGER,
  created_at            DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (carpark_id)         REFERENCES carparks(id)         ON DELETE CASCADE,
  FOREIGN KEY (customer_id)        REFERENCES customers(id)        ON DELETE SET NULL,
  FOREIGN KEY (parking_session_id) REFERENCES parking_sessions(id) ON DELETE SET NULL
);

-- Records of monthly on-account statements that were emailed
CREATE TABLE IF NOT EXISTS email_statements (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  carpark_id        INTEGER NOT NULL,
  customer_id       INTEGER NOT NULL,
  period_start      DATETIME NOT NULL,
  period_end        DATETIME NOT NULL,
  total_due_cents   INTEGER NOT NULL,
  email_to          TEXT NOT NULL,
  payment_link      TEXT,
  sent_at           DATETIME,
  status            TEXT NOT NULL DEFAULT 'PENDING', -- PENDING / SENT / FAILED
  error_message     TEXT,
  created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (carpark_id) REFERENCES carparks(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
);

-- Simple key/value settings table (for future extension, e.g. SMTP overrides per carpark)
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

