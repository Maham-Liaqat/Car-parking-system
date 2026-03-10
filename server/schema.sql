-- Car parks that the system can manage
CREATE TABLE IF NOT EXISTS carparks (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  location        TEXT,
  capacity        INTEGER NOT NULL DEFAULT 0,
  timezone        TEXT NOT NULL DEFAULT 'Pacific/Auckland',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Staff users (for role-based login)
CREATE TABLE IF NOT EXISTS staff_users (
  id              SERIAL PRIMARY KEY,
  carpark_id      INTEGER REFERENCES carparks(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('ADMIN','MANAGER','ATTENDANT')),
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customer types are defined per car park (e.g. Short-Term, Long-Term, Annual)
CREATE TABLE IF NOT EXISTS customer_types (
  id                            SERIAL PRIMARY KEY,
  carpark_id                    INTEGER NOT NULL REFERENCES carparks(id) ON DELETE CASCADE,
  name                          TEXT NOT NULL,
  billing_mode                  TEXT NOT NULL CHECK (billing_mode IN ('SHORT_TERM','LONG_TERM','ANNUAL')),
  hourly_rate_cents             INTEGER,
  daily_rate_cents              INTEGER,
  monthly_rate_cents            INTEGER,
  annual_rate_cents             INTEGER,
  expiry_days                   INTEGER,
  max_parking_hours_per_session INTEGER,
  max_sessions_per_day          INTEGER,
  allow_overnight               BOOLEAN NOT NULL DEFAULT TRUE,
  is_on_account                 BOOLEAN NOT NULL DEFAULT TRUE,
  is_active                     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers who park at a particular car park
CREATE TABLE IF NOT EXISTS customers (
  id                      SERIAL PRIMARY KEY,
  carpark_id              INTEGER NOT NULL REFERENCES carparks(id) ON DELETE CASCADE,
  customer_type_id        INTEGER NOT NULL REFERENCES customer_types(id) ON DELETE RESTRICT,
  name                    TEXT NOT NULL,
  email                   TEXT,
  phone                   TEXT,
  license_plate           TEXT NOT NULL,
  status                  TEXT NOT NULL DEFAULT 'active',
  account_balance_cents   INTEGER NOT NULL DEFAULT 0,
  account_billing_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  start_date              TIMESTAMPTZ,
  end_date                TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (carpark_id, license_plate)
);

-- Individual parking sessions
CREATE TABLE IF NOT EXISTS parking_sessions (
  id                SERIAL PRIMARY KEY,
  carpark_id        INTEGER NOT NULL REFERENCES carparks(id) ON DELETE CASCADE,
  customer_id       INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  license_plate     TEXT NOT NULL,
  start_time        TIMESTAMPTZ NOT NULL,
  end_time          TIMESTAMPTZ,
  duration_minutes  INTEGER,
  total_fee_cents   INTEGER,
  payment_method    TEXT,
  status            TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Financial transactions (charges, payments, adjustments) per customer
CREATE TABLE IF NOT EXISTS transactions (
  id                    SERIAL PRIMARY KEY,
  carpark_id            INTEGER NOT NULL REFERENCES carparks(id) ON DELETE CASCADE,
  customer_id           INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  parking_session_id    INTEGER REFERENCES parking_sessions(id) ON DELETE SET NULL,
  type                  TEXT NOT NULL CHECK (type IN ('CHARGE','PAYMENT','ADJUSTMENT')),
  description           TEXT,
  amount_cents          INTEGER NOT NULL,
  balance_after_cents   INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Records of monthly on-account statements that were emailed
CREATE TABLE IF NOT EXISTS email_statements (
  id                SERIAL PRIMARY KEY,
  carpark_id        INTEGER NOT NULL REFERENCES carparks(id) ON DELETE CASCADE,
  customer_id       INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  period_start      TIMESTAMPTZ NOT NULL,
  period_end        TIMESTAMPTZ NOT NULL,
  total_due_cents   INTEGER NOT NULL,
  email_to          TEXT NOT NULL,
  payment_link      TEXT,
  sent_at           TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'PENDING',
  error_message     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Simple key/value settings table
CREATE TABLE IF NOT EXISTS settings (
  key         TEXT PRIMARY KEY,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);