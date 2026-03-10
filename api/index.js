import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import dotenv from 'dotenv';

// Use Postgres via Supabase in serverless
const hasDb = !!process.env.DATABASE_URL;
import { getPool, tx } from '../server/db.postgres.js';

dotenv.config();

const app = express();
if (!hasDb) {
  app.use(cors());
  app.use(express.json());
  app.all('*', (_req, res) => {
    res.status(501).json({
      error: 'API is not configured on this deployment. Set DATABASE_URL and redeploy.',
      hint: 'Provision a serverless-friendly database (Neon/Supabase) and set DATABASE_URL in Vercel.'
    });
  });
}

let pool;
let initError = null;
try {
  pool = getPool();
} catch (e) {
  initError = e;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'https://carparksystem.vercel.app';

app.use(
  cors({
    origin: FRONTEND_ORIGIN,
    credentials: true
  })
);

app.use(
  express.json({
    verify: (req, res, buf) => {
      try {
        req.rawBody = buf.toString();
      } catch (e) {
        // Ignore
      }
    }
  })
);

// Health endpoint early, so it never crashes
app.get('/health', (_req, res) => {
  if (initError) {
    const msg = typeof initError?.message === 'string' ? initError.message : String(initError);
    return res.status(500).json({ status: 'error', error: msg });
  }
  res.json({ status: 'ok' });
});

// Guard to short-circuit when initialization failed
app.use((req, res, next) => {
  if (initError) {
    const msg = typeof initError?.message === 'string' ? initError.message : String(initError);
    return res.status(500).json({ error: 'API initialization failed', details: msg });
  }
  next();
});

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: 'No auth token' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

const requireRole = (roles) => (req, res, next) => {
  if (!roles.includes(req.userRole)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }
  next();
};

// Auth routes
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  try {
    const { rows } = await pool.query('SELECT * FROM staff_users WHERE email = $1 AND is_active = TRUE', [email]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    const carpark = user.carpark_id
      ? (await pool.query('SELECT id, name, location, capacity FROM carparks WHERE id = $1', [user.carpark_id])).rows[0]
      : null;
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role, carpark } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/auth/me', authMiddleware, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM staff_users WHERE id = $1', [req.userId]);
    const user = rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const carpark = user.carpark_id
      ? (await pool.query('SELECT id, name, location, capacity FROM carparks WHERE id = $1', [user.carpark_id])).rows[0]
      : null;
    res.json({ id: user.id, name: user.name, email: user.email, role: user.role, carpark });
  } catch (err) {
    console.error('Auth/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customer types
app.get('/customer-types', authMiddleware, async (req, res) => {
  try {
    const carparkId = req.query.carparkId || (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0]?.carpark_id;
    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });
    const { rows } = await pool.query(
      `SELECT id, carpark_id, name, billing_mode, hourly_rate_cents, daily_rate_cents,
              monthly_rate_cents, annual_rate_cents, expiry_days,
              max_parking_hours_per_session, max_sessions_per_day,
              allow_overnight, is_on_account, is_active, created_at
       FROM customer_types WHERE carpark_id = $1 ORDER BY name ASC`,
      [carparkId]
    );
    res.json(rows);
  } catch (err) {
    console.error('Get customer types error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/customer-types', authMiddleware, requireRole(['ADMIN', 'MANAGER']), async (req, res) => {
  const { name, billing_mode, hourly_rate_cents, daily_rate_cents, monthly_rate_cents, annual_rate_cents, max_parking_hours_per_session, max_sessions_per_day, allow_overnight, is_on_account } = req.body || {};
  try {
    const carpark = (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0];
    const carparkId = carpark?.carpark_id;
    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

    const { rows } = await pool.query(
      `INSERT INTO customer_types
        (carpark_id, name, billing_mode, hourly_rate_cents, daily_rate_cents,
         monthly_rate_cents, annual_rate_cents, expiry_days,
         max_parking_hours_per_session, max_sessions_per_day,
         allow_overnight, is_on_account, is_active, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NULL,$8,$9,$10,$11,TRUE,NOW())
       RETURNING id`,
      [
        carparkId,
        name,
        billing_mode,
        hourly_rate_cents || null,
        daily_rate_cents || null,
        monthly_rate_cents || null,
        annual_rate_cents || null,
        max_parking_hours_per_session || null,
        max_sessions_per_day || null,
        !!allow_overnight,
        !!is_on_account,
      ]
    );
    res.status(201).json({ id: rows[0].id, ...req.body });
  } catch (err) {
    console.error('Create customer type error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Customers
app.get('/customers', authMiddleware, async (req, res) => {
  try {
    const carparkId = req.query.carparkId || (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0]?.carpark_id;
    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

    const search = (req.query.search || '').toString().toLowerCase();
    const typeName = req.query.type;

    let sql = `
      SELECT c.id, c.name, c.email, c.phone, c.license_plate,
             c.status, c.account_balance_cents, t.name AS type
      FROM customers c
      JOIN customer_types t ON t.id = c.customer_type_id
      WHERE c.carpark_id = $1
    `;
    const params = [carparkId];

    if (typeName && typeName !== 'All Types') {
      sql += ' AND t.name = $2';
      params.push(typeName);
    }

    const { rows } = await pool.query(sql, params);

    const filtered = search
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(search) ||
            r.license_plate.toLowerCase().includes(search)
        )
      : rows;

    const mapped = filtered.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone || '—',
      plate: r.license_plate,
      type: r.type,
      balance: `${(r.account_balance_cents / 100).toFixed(2)}`,
      status: r.status,
    }));

    res.json(mapped);
  } catch (err) {
    console.error('Get customers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/customers', authMiddleware, async (req, res) => {
  const { name, email, phone, license_plate, customer_type_id, status, account_balance_cents, account_billing_enabled } = req.body || {};
  try {
    const carpark = (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0];
    const carparkId = carpark?.carpark_id;
    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

    const now = new Date();
    const { rows } = await pool.query(
      `INSERT INTO customers
        (carpark_id, customer_type_id, name, email, phone, license_plate,
         status, account_balance_cents, account_billing_enabled,
         start_date, end_date, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NULL,NOW()) RETURNING id`,
      [
        carparkId,
        customer_type_id,
        name,
        email?.toLowerCase() || null,
        phone || null,
        (license_plate || '').toUpperCase(),
        status || 'active',
        account_balance_cents || 0,
        !!account_billing_enabled,
      ]
    );
    res.status(201).json({ id: rows[0].id, ...req.body });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'Customer with this plate already exists' });
    }
    console.error('Create customer error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/customers/:id', authMiddleware, async (req, res) => {
  const { name, email, phone, license_plate, status, account_balance_cents, account_billing_enabled, customer_type_id } = req.body || {};
  const id = Number(req.params.id);
  try {
    // Ensure customer belongs to the same carpark as the user
    const staff = (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0];
    const existing = (await pool.query(
      `SELECT c.*, t.name AS type_name
       FROM customers c
       JOIN customer_types t ON t.id = c.customer_type_id
       WHERE c.id = $1 AND c.carpark_id = $2`,
      [id, staff?.carpark_id]
    )).rows[0];
    if (!existing) return res.status(404).json({ error: 'Customer not found' });

    let newTypeId = existing.customer_type_id;
    if (customer_type_id && customer_type_id !== existing.customer_type_id) {
      const type = (await pool.query('SELECT id FROM customer_types WHERE id = $1 AND carpark_id = $2', [customer_type_id, staff.carpark_id])).rows[0];
      if (!type) return res.status(400).json({ error: 'Unknown customer type' });
      newTypeId = type.id;
    }

    await pool.query(
      `UPDATE customers
       SET name = $1, email = $2, phone = $3, license_plate = $4, customer_type_id = $5, status = $6, account_balance_cents = $7, account_billing_enabled = $8
       WHERE id = $9 AND carpark_id = $10`,
      [
        name || existing.name,
        email ? email.toLowerCase() : existing.email,
        phone || existing.phone,
        license_plate ? license_plate.toUpperCase() : existing.license_plate,
        newTypeId,
        status || existing.status,
        account_balance_cents ?? existing.account_balance_cents,
        account_billing_enabled ?? existing.account_billing_enabled,
        id,
        staff.carpark_id,
      ]
    );

    const updated = (await pool.query(
      `SELECT c.id, c.name, c.email, c.phone, c.license_plate,
              c.status, c.account_balance_cents, t.name AS type
       FROM customers c
       JOIN customer_types t ON t.id = c.customer_type_id
       WHERE c.id = $1`,
      [id]
    )).rows[0];

    res.json({
      id: updated.id,
      name: updated.name,
      email: updated.email,
      phone: updated.phone || '—',
      plate: updated.license_plate,
      type: updated.type,
      balance: `${(updated.account_balance_cents / 100).toFixed(2)}`,
      status: updated.status,
    });
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/customers/:id', authMiddleware, async (req, res) => {
  try {
    const staff = (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0];
    const result = await pool.query('DELETE FROM customers WHERE id = $1 AND carpark_id = $2', [Number(req.params.id), staff?.carpark_id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Customer not found' });
    res.status(204).send();
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Parking sessions (list active/completed like server/server.js)
app.get('/sessions', authMiddleware, async (req, res) => {
  try {
    const carparkId = req.query.carparkId || (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0]?.carpark_id;
    const status = req.query.status || 'ALL';
    const search = (req.query.search || '').toString().toLowerCase();

    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

    const activeRows = status === 'COMPLETED' ? [] : (
      await pool.query(
        `SELECT s.id, s.license_plate, s.start_time,
                COALESCE(c.name, 'Walk-in Customer') AS customer
         FROM parking_sessions s
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.carpark_id = $1 AND s.status = 'ACTIVE'`,
        [carparkId]
      )
    ).rows;

    const completedRows = status === 'ACTIVE' ? [] : (
      await pool.query(
        `SELECT s.id, s.license_plate, s.start_time, s.end_time,
                s.duration_minutes, s.total_fee_cents, s.payment_method,
                COALESCE(c.name, 'Walk-in Customer') AS customer
         FROM parking_sessions s
         LEFT JOIN customers c ON c.id = s.customer_id
         WHERE s.carpark_id = $1 AND s.status = 'COMPLETED'`,
        [carparkId]
      )
    ).rows;

    const formatTime = (iso) =>
      new Date(iso).toLocaleTimeString('en-NZ', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).toLowerCase();

    const active = activeRows.map((r) => ({
      id: r.id,
      customer: r.customer,
      plate: r.license_plate,
      entry: formatTime(r.start_time),
      status: 'Parked',
    }));

    const completed = completedRows.map((r) => ({
      id: r.id,
      customer: r.customer,
      plate: r.license_plate,
      entry: formatTime(r.start_time),
      exit: formatTime(r.end_time),
      duration: r.duration_minutes ? `${Math.floor(r.duration_minutes / 60)}h ${r.duration_minutes % 60}m` : '',
      fee: `${(r.total_fee_cents / 100).toFixed(2)}`,
      payment: r.payment_method === 'ON_ACCOUNT' ? 'on-account' : 'paid',
    }));

    const filterFn = (s) =>
      !search || s.customer.toLowerCase().includes(search) || s.plate.toLowerCase().includes(search);

    res.json({
      active: active.filter(filterFn),
      completed: completed.filter(filterFn),
    });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/sessions', authMiddleware, async (req, res) => {
  const { plate, customer_id } = req.body || {};
  try {
    const staff = (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0];
    const carparkId = staff?.carpark_id;
    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

    const licensePlate = (plate || '').toUpperCase() || `NEW${Math.floor(Math.random() * 900) + 100}`;
    const nowIso = new Date().toISOString();
    const { rows } = await pool.query(
      `INSERT INTO parking_sessions
        (carpark_id, customer_id, license_plate, start_time, status, created_at)
       VALUES ($1,$2,$3,$4,'ACTIVE', NOW()) RETURNING id, license_plate, start_time`,
      [carparkId, customer_id || null, licensePlate, nowIso]
    );

    const created = rows[0];
    res.status(201).json({
      id: created.id,
      customer: null,
      plate: created.license_plate,
      entry: new Date(created.start_time).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase(),
      status: 'Parked',
    });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/sessions/:id/checkout', authMiddleware, async (req, res) => {
  try {
    const carpark = (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0];
    const carparkId = carpark?.carpark_id;
    const id = Number(req.params.id);
    const paymentMethod = req.body?.payment_method || 'ON_ACCOUNT';

    const session = (await pool.query(
      `SELECT s.*, c.account_balance_cents
       FROM parking_sessions s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1 AND s.carpark_id = $2 AND s.status = 'ACTIVE'`,
      [id, carparkId]
    )).rows[0];
    if (!session) return res.status(404).json({ error: 'Active session not found' });

    const start = new Date(session.start_time);
    const now = new Date();
    const mins = Math.max(Math.round((now.getTime() - start.getTime()) / 60000), 15);
    const feeCents = Math.round(mins * 15);

    await tx(async (trx) => {
      await trx.query(
        `UPDATE parking_sessions
         SET end_time = $1, duration_minutes = $2, total_fee_cents = $3, payment_method = $4, status = 'COMPLETED'
         WHERE id = $5`,
        [now.toISOString(), mins, feeCents, paymentMethod === 'ON_ACCOUNT' ? 'ON_ACCOUNT' : 'PAID', id]
      );

      if (session.customer_id && paymentMethod === 'ON_ACCOUNT') {
        const currentBalance = session.account_balance_cents || 0;
        const newBalance = currentBalance + feeCents;
        await trx.query('UPDATE customers SET account_balance_cents = $1 WHERE id = $2', [newBalance, session.customer_id]);
        await trx.query(
          `INSERT INTO transactions
            (carpark_id, customer_id, parking_session_id, type, description, amount_cents, balance_after_cents, created_at)
           VALUES ($1,$2,$3,'CHARGE',$4,$5,$6,NOW())`,
          [carparkId, session.customer_id, id, 'Parking session charge', feeCents, newBalance]
        );
      }
    });

    const updated = (await pool.query(
      `SELECT s.*, COALESCE(c.name, 'Walk-in Customer') AS customer
       FROM parking_sessions s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = $1`,
      [id]
    )).rows[0];

    const durationStr = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;

    res.json({
      id: updated.id,
      customer: updated.customer,
      plate: updated.license_plate,
      entry: new Date(updated.start_time).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase(),
      exit: new Date(updated.end_time).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase(),
      duration: durationStr,
      fee: `${(updated.total_fee_cents / 100).toFixed(2)}`,
      payment: updated.payment_method === 'ON_ACCOUNT' ? 'on-account' : 'paid',
    });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Dashboard (Postgres)
app.get('/dashboard/summary', authMiddleware, async (req, res) => {
  try {
    const carparkRow = (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0];
    const carparkId = req.query.carparkId || carparkRow?.carpark_id;
    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const revenueRow = (await pool.query(
      `SELECT COALESCE(SUM(amount_cents), 0) AS revenue_cents
       FROM transactions
       WHERE carpark_id = $1 AND type = 'CHARGE' AND created_at BETWEEN $2 AND $3`,
      [carparkId, todayStart.toISOString(), todayEnd.toISOString()]
    )).rows[0];

    const usageRows = (await pool.query(
      `SELECT ct.name AS label, COUNT(*) AS count
       FROM customers c
       JOIN customer_types ct ON ct.id = c.customer_type_id
       WHERE c.carpark_id = $1
       GROUP BY ct.name`,
      [carparkId]
    )).rows;

    const occupancyRow = (await pool.query(
      `SELECT
         (SELECT capacity FROM carparks WHERE id = $1) AS capacity,
         (SELECT COUNT(*) FROM parking_sessions WHERE carpark_id = $1 AND status = 'ACTIVE') AS active_count`,
      [carparkId]
    )).rows[0];

    const parked = (await pool.query(
      `SELECT COALESCE(c.name, 'Walk-in Customer') AS customer, s.license_plate, s.start_time
       FROM parking_sessions s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.carpark_id = $1 AND s.status = 'ACTIVE'
       ORDER BY s.start_time ASC
       LIMIT 10`,
      [carparkId]
    )).rows.map((r) => ({
      customer: r.customer,
      plate: r.license_plate,
      entry: new Date(r.start_time).toLocaleTimeString('en-NZ', { hour: '2-digit', minute: '2-digit', hour12: true }).toLowerCase(),
      status: 'Active',
    }));

    res.json({
      revenueToday: Number(revenueRow?.revenue_cents || 0) / 100,
      usageByType: usageRows,
      occupancy: {
        capacity: Number(occupancyRow?.capacity || 0),
        active: Number(occupancyRow?.active_count || 0),
        rate: Number(occupancyRow?.capacity || 0) > 0 ? (Number(occupancyRow?.active_count || 0) / Number(occupancyRow?.capacity)) * 100 : 0,
      },
      parked,
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reports summary (Postgres, similar to server/server.js)
app.get('/reports/summary', authMiddleware, async (req, res) => {
  try {
    const carparkRow = (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0];
    const carparkId = req.query.carparkId || carparkRow?.carpark_id;
    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

    const period = req.query.period || 'This Month';
    const typeFilter = req.query.type || 'All Types';

    const now = new Date();
    let from, to, groupBy;
    switch (period) {
      case 'Last Month': {
        const m = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        from = new Date(m.getFullYear(), m.getMonth(), 1);
        to = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59);
        groupBy = 'week';
        break;
      }
      case 'This Quarter': {
        const quarter = Math.floor(now.getMonth() / 3);
        const startMonth = quarter * 3;
        from = new Date(now.getFullYear(), startMonth, 1);
        to = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59);
        groupBy = 'month';
        break;
      }
      case 'This Year': {
        from = new Date(now.getFullYear(), 0, 1);
        to = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        groupBy = 'month';
        break;
      }
      case 'This Month':
      default: {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        groupBy = 'week';
        break;
      }
    }

    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const typeJoin = typeFilter && typeFilter !== 'All Types'
      ? `JOIN customers c ON c.id = tx.customer_id JOIN customer_types ct ON ct.id = c.customer_type_id`
      : '';
    const typeWhere = typeFilter && typeFilter !== 'All Types' ? 'AND ct.name = $4' : '';

    const bucketExpr = groupBy === 'month' ? `EXTRACT(MONTH FROM tx.created_at)` : `EXTRACT(WEEK FROM tx.created_at)`;
    const params = [carparkId, fromIso, toIso];
    if (typeWhere) params.push(typeFilter);

    const revenueRows = (await pool.query(
      `WITH tx AS (
        SELECT * FROM transactions
        WHERE carpark_id = $1 AND type = 'CHARGE' AND created_at BETWEEN $2 AND $3
      )
      SELECT ${bucketExpr} AS bucket, SUM(amount_cents) AS revenue_cents
      FROM tx
      ${typeJoin}
      WHERE 1=1 ${typeWhere}
      GROUP BY bucket
      ORDER BY bucket ASC`,
      params
    )).rows;

    let revenueData;
    if (groupBy === 'week') {
      revenueData = revenueRows.map((r, idx) => ({ label: `Week ${idx + 1}`, revenue: Number(r.revenue_cents || 0) / 100 }));
    } else {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      revenueData = revenueRows.map((r) => ({ label: monthNames[Number(r.bucket) - 1], revenue: Number(r.revenue_cents || 0) / 100 }));
    }

    const usageRows = (await pool.query(
      `SELECT ct.name AS label, COUNT(*) AS count
       FROM customers c
       JOIN customer_types ct ON ct.id = c.customer_type_id
       WHERE c.carpark_id = $1
       GROUP BY ct.name`,
      [carparkId]
    )).rows;

    const revenueTotal = revenueData.reduce((sum, r) => sum + r.revenue, 0);

    const occupancyRow = (await pool.query(
      `SELECT
         (SELECT capacity FROM carparks WHERE id = $1) AS capacity,
         (SELECT COUNT(*) FROM parking_sessions WHERE carpark_id = $1 AND status = 'ACTIVE') AS active_count`,
      [carparkId]
    )).rows[0];

    res.json({
      period,
      typeFilter,
      revenueSeries: revenueData,
      usage: usageRows,
      summary: {
        customers: usageRows.reduce((s, u) => s + Number(u.count || 0), 0),
        revenueFormatted: `${revenueTotal.toFixed(2)}`,
        occupancy: Number(occupancyRow?.capacity || 0)
          ? `${Math.round((Number(occupancyRow?.active_count || 0) / Number(occupancyRow.capacity)) * 100)}%`
          : '0%'
      }
    });
  } catch (err) {
    console.error('Reports summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/reports/export', authMiddleware, async (req, res) => {
  try {
    const carparkRow = (await pool.query('SELECT carpark_id FROM staff_users WHERE id = $1', [req.userId])).rows[0];
    const carparkId = req.query.carparkId || carparkRow?.carpark_id;
    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

    const format = (req.query.format || 'csv').toString().toLowerCase();
    const period = req.query.period || 'This Month';
    const typeFilter = req.query.type || 'All Types';

    const now = new Date();
    let from, to, groupBy;
    switch (period) {
      case 'Last Month': {
        const m = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        from = new Date(m.getFullYear(), m.getMonth(), 1);
        to = new Date(m.getFullYear(), m.getMonth() + 1, 0, 23, 59, 59);
        groupBy = 'week';
        break;
      }
      case 'This Quarter': {
        const quarter = Math.floor(now.getMonth() / 3);
        const startMonth = quarter * 3;
        from = new Date(now.getFullYear(), startMonth, 1);
        to = new Date(now.getFullYear(), startMonth + 3, 0, 23, 59, 59);
        groupBy = 'month';
        break;
      }
      case 'This Year': {
        from = new Date(now.getFullYear(), 0, 1);
        to = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
        groupBy = 'month';
        break;
      }
      case 'This Month':
      default: {
        from = new Date(now.getFullYear(), now.getMonth(), 1);
        to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        groupBy = 'week';
        break;
      }
    }

    const fromIso = from.toISOString();
    const toIso = to.toISOString();

    const typeJoin = typeFilter && typeFilter !== 'All Types'
      ? `JOIN customers c ON c.id = tx.customer_id JOIN customer_types ct ON ct.id = c.customer_type_id`
      : '';
    const typeWhere = typeFilter && typeFilter !== 'All Types' ? 'AND ct.name = $4' : '';

    const bucketExpr = groupBy === 'month' ? `EXTRACT(MONTH FROM tx.created_at)` : `EXTRACT(WEEK FROM tx.created_at)`;
    const params = [carparkId, fromIso, toIso];
    if (typeWhere) params.push(typeFilter);

    const revenueRows = (await pool.query(
      `WITH tx AS (
        SELECT * FROM transactions
        WHERE carpark_id = $1 AND type = 'CHARGE' AND created_at BETWEEN $2 AND $3
      )
      SELECT ${bucketExpr} AS bucket, SUM(amount_cents) AS revenue_cents
      FROM tx
      ${typeJoin}
      WHERE 1=1 ${typeWhere}
      GROUP BY bucket
      ORDER BY bucket ASC`,
      params
    )).rows;

    let revenueData;
    if (groupBy === 'week') {
      revenueData = revenueRows.map((r, idx) => ({ label: `Week ${idx + 1}`, revenue: Number(r.revenue_cents || 0) / 100 }));
    } else {
      const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
      revenueData = revenueRows.map((r) => ({ label: monthNames[Number(r.bucket) - 1], revenue: Number(r.revenue_cents || 0) / 100 }));
    }

    const usageRows = (await pool.query(
      `SELECT ct.name AS label, COUNT(*) AS count
       FROM customers c
       JOIN customer_types ct ON ct.id = c.customer_type_id
       WHERE c.carpark_id = $1
       GROUP BY ct.name`,
      [carparkId]
    )).rows;

    const revenueTotal = revenueData.reduce((sum, r) => sum + r.revenue, 0);

    const occupancyRow = (await pool.query(
      `SELECT
         (SELECT capacity FROM carparks WHERE id = $1) AS capacity,
         (SELECT COUNT(*) FROM parking_sessions WHERE carpark_id = $1 AND status = 'ACTIVE') AS active_count`,
      [carparkId]
    )).rows[0];

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="report-${period.replace(/\s+/g, '-').toLowerCase()}.csv"`);

      res.write('REPORT SUMMARY\n');
      res.write(`Period:,${period}\n`);
      res.write(`Type Filter:,${typeFilter}\n`);
      res.write(`Total Revenue:,${revenueTotal.toFixed(2)}\n`);
      res.write(`Total Customers:,${usageRows.reduce((s, u) => s + Number(u.count || 0), 0)}\n`);
      res.write(`Current Occupancy:,${Number(occupancyRow?.capacity || 0) ? Math.round((Number(occupancyRow?.active_count || 0) / Number(occupancyRow.capacity)) * 100) + '%' : '0%'}\n\n`);

      res.write('REVENUE SERIES\n');
      res.write('Period,Revenue\n');
      for (const r of revenueData) res.write(`${r.label},${r.revenue.toFixed(2)}\n`);
      res.write('\n');

      res.write('CUSTOMER USAGE BY TYPE\n');
      res.write('Type,Count\n');
      for (const u of usageRows) res.write(`${u.label},${u.count}\n`);
      res.write('\n');

      const txRows = (await pool.query(
        `SELECT created_at, description, amount_cents
         FROM transactions
         WHERE carpark_id = $1 AND type = 'CHARGE' AND created_at BETWEEN $2 AND $3
         ORDER BY created_at ASC`,
        [carparkId, fromIso, toIso]
      )).rows;

      res.write('DETAILED TRANSACTIONS\n');
      res.write('Date,Description,Amount\n');
      for (const r of txRows) {
        const date = new Date(r.created_at).toISOString().split('T')[0];
        const desc = (r.description || '').replace(/"/g, '""');
        const amount = (Number(r.amount_cents) / 100).toFixed(2);
        res.write(`"${date}","${desc}","${amount}"\n`);
      }

      return res.end();
    }

    if (format === 'pdf') {
      const doc = new PDFDocument({ margin: 40 });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="report-${period.replace(/\s+/g, '-').toLowerCase()}.pdf"`);
      doc.pipe(res);

      doc.fontSize(20).text('Parking Report', { align: 'center' });
      doc.moveDown(0.5);
      doc.fontSize(14).text(`Period: ${period}`, { align: 'center' });
      doc.fontSize(12).text(`Type Filter: ${typeFilter}`, { align: 'center' });
      doc.moveDown(1);

      doc.fontSize(16).text('Summary', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(12);
      doc.text(`Total Revenue: ${revenueTotal.toFixed(2)}`);
      doc.text(`Total Customers: ${usageRows.reduce((s, u) => s + Number(u.count || 0), 0)}`);
      doc.text(`Current Occupancy: ${Number(occupancyRow?.capacity || 0) ? Math.round((Number(occupancyRow?.active_count || 0) / Number(occupancyRow.capacity)) * 100) + '%' : '0%'}`);
      doc.moveDown(1);

      doc.fontSize(16).text('Revenue Series', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text('Period', { continued: true, width: 150 });
      doc.text('Revenue', { align: 'right' });
      doc.moveDown(0.3);
      for (const r of revenueData) {
        doc.text(r.label, { continued: true, width: 150 });
        doc.text(`${r.revenue.toFixed(2)}`, { align: 'right' });
        doc.moveDown(0.2);
      }
      doc.moveDown(1);

      doc.fontSize(16).text('Customer Usage by Type', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10);
      doc.text('Type', { continued: true, width: 150 });
      doc.text('Count', { align: 'right' });
      doc.moveDown(0.3);
      for (const u of usageRows) {
        doc.text(u.label, { continued: true, width: 150 });
        doc.text(String(u.count), { align: 'right' });
        doc.moveDown(0.2);
      }

      doc.end();
      return;
    }

    res.status(400).json({ error: 'Unsupported format' });
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
