import fs from 'fs';
import path from 'path';
import url from 'url';
import bcrypt from 'bcryptjs';
import { getPool } from '../server/db.postgres.js';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

async function applySchema() {
  const schemaPath = path.resolve(__dirname, '../server/schema.postgres.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  const pool = getPool();
  await pool.query(sql);
}

async function seedIfEmpty() {
  const pool = getPool();
  const { rows: carparks } = await pool.query('SELECT COUNT(*)::int AS c FROM carparks');
  if (carparks[0].c > 0) return; // already seeded

  const now = new Date();
  const adminEmail = 'admin@example.com';
  const adminPassword = 'Admin123!';
  const passwordHash = bcrypt.hashSync(adminPassword, 10);

  await pool.query('BEGIN');
  try {
    const carparkRes = await pool.query(
      `INSERT INTO carparks (name, location, capacity, timezone, created_at)
       VALUES ($1, $2, $3, $4, NOW()) RETURNING id`,
      ['Kerikeri Car Storage', 'Kerikeri', 150, 'Pacific/Auckland']
    );
    const carparkId = carparkRes.rows[0].id;

    // Customer types
    await pool.query(
      `INSERT INTO customer_types
        (carpark_id, name, billing_mode, hourly_rate_cents, daily_rate_cents,
         monthly_rate_cents, annual_rate_cents, expiry_days,
         max_parking_hours_per_session, max_sessions_per_day,
         allow_overnight, is_on_account, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW())`,
      [carparkId, 'Short-Term', 'SHORT_TERM', 150, 1800, null, null, null, 24, 10, true, true, true]
    );

    await pool.query(
      `INSERT INTO customer_types
        (carpark_id, name, billing_mode, hourly_rate_cents, daily_rate_cents,
         monthly_rate_cents, annual_rate_cents, expiry_days,
         max_parking_hours_per_session, max_sessions_per_day,
         allow_overnight, is_on_account, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW())`,
      [carparkId, 'Long-Term', 'LONG_TERM', null, 1200, 25000, null, 30, null, null, true, true, true]
    );

    await pool.query(
      `INSERT INTO customer_types
        (carpark_id, name, billing_mode, hourly_rate_cents, daily_rate_cents,
         monthly_rate_cents, annual_rate_cents, expiry_days,
         max_parking_hours_per_session, max_sessions_per_day,
         allow_overnight, is_on_account, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, NOW())`,
      [carparkId, 'Annual', 'ANNUAL', null, null, null, 240000, 365, null, null, true, true, true]
    );

    // Admin user
    await pool.query(
      `INSERT INTO staff_users (carpark_id, name, email, password_hash, role, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5, true, NOW())`,
      [carparkId, 'System Admin', adminEmail, passwordHash, 'ADMIN']
    );

    // Sample customers
    const c1 = await pool.query(
      `INSERT INTO customers
        (carpark_id, customer_type_id, name, email, phone, license_plate,
         status, account_balance_cents, account_billing_enabled, start_date, end_date, created_at)
       SELECT $1, id, $2, $3, $4, $5, 'active', 4800, true, NOW(), NULL, NOW()
       FROM customer_types WHERE carpark_id = $1 AND name = 'Short-Term' RETURNING id`,
      [carparkId, 'Michael Knight', 'michael@example.com', '02102624420', 'NZC356']
    );

    const c2 = await pool.query(
      `INSERT INTO customers
        (carpark_id, customer_type_id, name, email, phone, license_plate,
         status, account_balance_cents, account_billing_enabled, start_date, end_date, created_at)
       SELECT $1, id, $2, $3, $4, $5, 'active', 6300, true, NOW(), NULL, NOW()
       FROM customer_types WHERE carpark_id = $1 AND name = 'Long-Term' RETURNING id`,
      [carparkId, 'Bettina Syme', 'bettina@example.com', '0272164742', 'NLS814']
    );

    const c3 = await pool.query(
      `INSERT INTO customers
        (carpark_id, customer_type_id, name, email, phone, license_plate,
         status, account_balance_cents, account_billing_enabled, start_date, end_date, created_at)
       SELECT $1, id, $2, $3, $4, $5, 'active', 3300, true, NOW(), NULL, NOW()
       FROM customer_types WHERE carpark_id = $1 AND name = 'Annual' RETURNING id`,
      [carparkId, 'Kristien Keii', 'kristien@example.com', '0274374267', 'MJS206']
    );

    // Seed some transactions
    const addCharge = async (customerId, description, amountCents) => {
      const bal = await getCurrentBalance(customerId);
      const newBal = bal + amountCents;
      await pool.query(
        `INSERT INTO transactions (carpark_id, customer_id, parking_session_id, type, description, amount_cents, balance_after_cents, created_at)
         VALUES ($1,$2,NULL,'CHARGE',$3,$4,$5, NOW())`,
        [carparkId, customerId, description, amountCents, newBal]
      );
      await pool.query(`UPDATE customers SET account_balance_cents = $1 WHERE id = $2`, [newBal, customerId]);
    };

    async function getCurrentBalance(customerId) {
      const { rows } = await pool.query('SELECT account_balance_cents FROM customers WHERE id = $1', [customerId]);
      return rows[0]?.account_balance_cents || 0;
    }

    await addCharge(c1.rows[0].id, 'Short-term parking session', 4800);
    await addCharge(c2.rows[0].id, 'Long-term monthly charge', 6300);
    await addCharge(c3.rows[0].id, 'Annual account adjustment', 3300);

    await pool.query('COMMIT');
  } catch (e) {
    await pool.query('ROLLBACK');
    throw e;
  }
}

(async () => {
  try {
    await applySchema();
    await seedIfEmpty();
    console.log('Migration and seed completed.');
    process.exit(0);
  } catch (e) {
    console.error('Migration failed:', e);
    process.exit(1);
  }
})();
