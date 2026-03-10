// server/db.js
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import url from 'url';
import bcrypt from 'bcryptjs';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'carpark.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

export function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    initialiseSchema();
    seedInitialData();
  }
  return db;
}

function initialiseSchema() {
  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schemaSql);
}

function seedInitialData() {
  const carparkCount = db.prepare('SELECT COUNT(*) AS c FROM carparks').get().c;

  if (carparkCount === 0) {
    const now = new Date().toISOString();
    const insertCarpark = db.prepare(
      'INSERT INTO carparks (name, location, capacity, timezone, created_at) VALUES (?, ?, ?, ?, ?)'
    );
    const info = insertCarpark.run(
      'Kerikeri Car Storage',
      'Kerikeri',
      150,
      'Pacific/Auckland',
      now
    );
    const carparkId = info.lastInsertRowid;

    // Seed default customer types
    const insertType = db.prepare(
      `INSERT INTO customer_types
        (carpark_id, name, billing_mode, hourly_rate_cents, daily_rate_cents,
         monthly_rate_cents, annual_rate_cents, expiry_days,
         max_parking_hours_per_session, max_sessions_per_day,
         allow_overnight, is_on_account, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const createdAt = now;

    // Short-Term: hourly billing
    insertType.run(
      carparkId,
      'Short-Term',
      'SHORT_TERM',
      150,           // $1.50 per hour
      1800,          // $18 daily cap
      null,
      null,
      null,
      24,
      10,
      1,
      1,
      1,
      createdAt
    );

    // Long-Term: monthly billing
    insertType.run(
      carparkId,
      'Long-Term',
      'LONG_TERM',
      null,
      1200,          // $12 daily if needed
      25000,         // $250 per month
      null,
      30,
      null,
      null,
      1,
      1,
      1,
      createdAt
    );

    // Annual: annual billing
    insertType.run(
      carparkId,
      'Annual',
      'ANNUAL',
      null,
      null,
      null,
      240000,        // $2400 per year
      365,
      null,
      null,
      1,
      1,
      1,
      createdAt
    );

    // Seed an admin staff user for login
    const adminEmail = 'admin@example.com';
    const adminPassword = 'Admin123!';
    const passwordHash = bcrypt.hashSync(adminPassword, 10);

    const insertStaff = db.prepare(
      `INSERT INTO staff_users (carpark_id, name, email, password_hash, role, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insertStaff.run(
      carparkId,
      'System Admin',
      adminEmail,
      passwordHash,
      'ADMIN',
      1,
      now
    );

    // Seed a few sample customers & sessions so dashboard is not empty
    const insertCustomer = db.prepare(
      `INSERT INTO customers
        (carpark_id, customer_type_id, name, email, phone, license_plate,
         status, account_balance_cents, account_billing_enabled,
         start_date, end_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const types = db
      .prepare('SELECT id, name FROM customer_types WHERE carpark_id = ?')
      .all(carparkId);

    const shortType = types.find((t) => t.name === 'Short-Term');
    const longType = types.find((t) => t.name === 'Long-Term');
    const annualType = types.find((t) => t.name === 'Annual');

    const today = new Date();
    const startIso = today.toISOString();

    const cust1 = insertCustomer.run(
      carparkId,
      shortType.id,
      'Michael Knight',
      'michael@example.com',
      '02102624420',
      'NZC356',
      'active',
      4800,
      1,
      startIso,
      null,
      startIso
    ).lastInsertRowid;

    const cust2 = insertCustomer.run(
      carparkId,
      longType.id,
      'Bettina Syme',
      'bettina@example.com',
      '0272164742',
      'NLS814',
      'active',
      6300,
      1,
      startIso,
      null,
      startIso
    ).lastInsertRowid;

    const cust3 = insertCustomer.run(
      carparkId,
      annualType.id,
      'Kristien Keii',
      'kristien@example.com',
      '0274374267',
      'MJS206',
      'active',
      3300,
      1,
      startIso,
      null,
      startIso
    ).lastInsertRowid;

    // Seed some transactions linked to customers (on-account charges)
    const insertTxn = db.prepare(
      `INSERT INTO transactions
        (carpark_id, customer_id, parking_session_id, type, description,
         amount_cents, balance_after_cents, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const addCharge = (customerId, description, amountCents, createdAtIso) => {
      const current = db
        .prepare('SELECT account_balance_cents FROM customers WHERE id = ?')
        .get(customerId).account_balance_cents;
      const newBalance = current + amountCents;
      insertTxn.run(
        carparkId,
        customerId,
        null,
        'CHARGE',
        description,
        amountCents,
        newBalance,
        createdAtIso
      );
      db.prepare('UPDATE customers SET account_balance_cents = ? WHERE id = ?')
        .run(newBalance, customerId);
    };

    addCharge(cust1, 'Short-term parking session', 4800, startIso);
    addCharge(cust2, 'Long-term monthly charge', 6300, startIso);
    addCharge(cust3, 'Annual account adjustment', 3300, startIso);
  }
}

