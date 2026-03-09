import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import { getDb } from './db.js';
import { initScheduler, runStatementJob } from './scheduler.js';

dotenv.config();

const app = express();
const db = getDb();

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://localhost:5173';

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
        req.rawBody = '';
      }
    }
  })
);

// JSON parse error handler: returns a JSON response and logs the raw body
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.error('[BODY PARSE ERROR] path=', req.path, 'raw=', req.rawBody);
    return res.status(400).json({ error: 'Invalid JSON payload', rawBody: req.rawBody });
  }
  next(err);
});

// --- Auth helpers ---

function generateToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      carparkId: user.carpark_id
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// --- Auth routes ---

// when deploying to Vercel, the entire express app is mounted under
// `/api` already, so we must avoid double-prefixing.  determine the base
// path dynamically.
const BASE_PATH = process.env.VERCEL ? '' : '/api';

app.post(`${BASE_PATH}/auth/login`, (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db
    .prepare(
      `SELECT id, name, email, password_hash, role, carpark_id
       FROM staff_users
       WHERE email = ? AND is_active = 1`
    )
    .get(email.toLowerCase());

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const ok = bcrypt.compareSync(password, user.password_hash);
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = generateToken(user);
  const carpark = user.carpark_id
    ? db
        .prepare('SELECT id, name, location, capacity FROM carparks WHERE id = ?')
        .get(user.carpark_id)
    : null;

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      carpark
    }
  });
});

app.get(`${BASE_PATH}/auth/me`, authMiddleware, (req, res) => {
  const staff = db
    .prepare(
      'SELECT id, name, email, role, carpark_id FROM staff_users WHERE id = ? AND is_active = 1'
    )
    .get(req.user.sub);
  if (!staff) {
    return res.status(404).json({ error: 'User not found' });
  }
  const carpark = staff.carpark_id
    ? db
        .prepare('SELECT id, name, location, capacity FROM carparks WHERE id = ?')
        .get(staff.carpark_id)
    : null;

  res.json({ user: { ...staff, carpark } });
});

// --- Customer types (Short-Term, Long-Term, Annual etc.) ---

app.get(`${BASE_PATH}/customer-types`, authMiddleware, (req, res) => {
  const carparkId = req.query.carparkId || req.user.carparkId;
  if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });
  const rows = db
    .prepare(
      `SELECT id, name, billing_mode, hourly_rate_cents, daily_rate_cents,
              monthly_rate_cents, annual_rate_cents, expiry_days,
              max_parking_hours_per_session, max_sessions_per_day,
              allow_overnight, is_on_account, is_active, created_at
       FROM customer_types
       WHERE carpark_id = ?
       ORDER BY name ASC`
    )
    .all(carparkId);
  res.json(rows);
});

app.post(`${BASE_PATH}/customer-types`, authMiddleware, requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const carparkId = req.body.carparkId || req.user.carparkId;
  if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

  const {
    name,
    billing_mode,
    hourly_rate_cents,
    daily_rate_cents,
    monthly_rate_cents,
    annual_rate_cents,
    expiry_days,
    max_parking_hours_per_session,
    max_sessions_per_day,
    allow_overnight = true,
    is_on_account = true
  } = req.body || {};

  if (!name || !billing_mode) {
    return res.status(400).json({ error: 'name and billing_mode are required' });
  }

  const stmt = db.prepare(
    `INSERT INTO customer_types
      (carpark_id, name, billing_mode, hourly_rate_cents, daily_rate_cents,
       monthly_rate_cents, annual_rate_cents, expiry_days,
       max_parking_hours_per_session, max_sessions_per_day,
       allow_overnight, is_on_account, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`
  );

  const now = new Date().toISOString();
  const info = stmt.run(
    carparkId,
    name,
    billing_mode,
    hourly_rate_cents || null,
    daily_rate_cents || null,
    monthly_rate_cents || null,
    annual_rate_cents || null,
    expiry_days || null,
    max_parking_hours_per_session || null,
    max_sessions_per_day || null,
    allow_overnight ? 1 : 0,
    is_on_account ? 1 : 0,
    now
  );

  const created = db
    .prepare('SELECT * FROM customer_types WHERE id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json(created);
});

// --- Customers ---

app.get(`${BASE_PATH}/customers`, authMiddleware, (req, res) => {
  const carparkId = req.query.carparkId || req.user.carparkId;
  const search = (req.query.search || '').toString().toLowerCase();
  const typeName = req.query.type;

  if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

  let sql = `
    SELECT c.id, c.name, c.email, c.phone, c.license_plate,
           c.status, c.account_balance_cents,
           t.name AS type
    FROM customers c
    JOIN customer_types t ON t.id = c.customer_type_id
    WHERE c.carpark_id = ?
  `;
  const params = [carparkId];

  if (typeName && typeName !== 'All Types') {
    sql += ' AND t.name = ?';
    params.push(typeName);
  }

  const rows = db.prepare(sql).all(...params);

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
    balance: `$${(r.account_balance_cents / 100).toFixed(2)}`,
    status: r.status
  }));

  res.json(mapped);
});

app.post(`${BASE_PATH}/customers`, authMiddleware, (req, res) => {
  // Debug: log incoming body and user for troubleshooting 400s
  console.log('[POST /api/customers] body=', req.body, 'user=', req.user);

  const carparkId = req.body.carparkId || req.user.carparkId;
  if (!carparkId) {
    const hint = 'Provide `carparkId` in the request body or ensure your token includes a `carparkId` (login to a carpark-bound user).';
    console.warn('[POST /api/customers] missing carparkId; req.user=', req.user);
    return res.status(400).json({ error: 'carparkId is required', hint });
  }

  const { name, email, phone, license_plate, customer_type_name } = req.body || {};
  const missing = [];
  if (!name) missing.push('name');
  if (!email) missing.push('email');
  if (!license_plate) missing.push('license_plate');
  if (!customer_type_name) missing.push('customer_type_name');

  if (missing.length) {
    console.warn('[POST /api/customers] missing required fields', { missing });
    return res.status(400).json({ error: 'Missing required fields', missing });
  }

  const type = db
    .prepare(
      'SELECT id FROM customer_types WHERE carpark_id = ? AND name = ? AND is_active = 1'
    )
    .get(carparkId, customer_type_name);
  if (!type) {
    const available = db
      .prepare('SELECT name FROM customer_types WHERE carpark_id = ? AND is_active = 1')
      .all(carparkId)
      .map((r) => r.name);
    console.warn('[POST /api/customers] unknown customer type', {
      carparkId,
      customer_type_name,
      available
    });
    return res.status(400).json({
      error: 'Unknown customer type',
      customer_type_name,
      available_types: available
    });
  }

  try {
    const stmt = db.prepare(
      `INSERT INTO customers
        (carpark_id, customer_type_id, name, email, phone, license_plate,
         status, account_balance_cents, account_billing_enabled,
         start_date, end_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', 0, 1, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    const info = stmt.run(
      carparkId,
      type.id,
      name,
      email.toLowerCase(),
      phone || null,
      license_plate.toUpperCase(),
      now,
      null,
      now
    );

    const created = db
      .prepare(
        `SELECT c.id, c.name, c.email, c.phone, c.license_plate,
                c.status, c.account_balance_cents, t.name AS type
         FROM customers c
         JOIN customer_types t ON t.id = c.customer_type_id
         WHERE c.id = ?`
      )
      .get(info.lastInsertRowid);

    res.status(201).json({
      id: created.id,
      name: created.name,
      email: created.email,
      phone: created.phone || '—',
      plate: created.license_plate,
      type: created.type,
      balance: `$${(created.account_balance_cents / 100).toFixed(2)}`,
      status: created.status
    });
  } catch (err) {
    if (err && err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: 'Customer with this plate already exists' });
    }
    console.error('Failed to create customer', err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

app.put(`${BASE_PATH}/customers/:id`, authMiddleware, (req, res) => {
  const carparkId = req.user.carparkId;
  const id = Number(req.params.id);
  const { name, email, phone, license_plate, customer_type_name, status } = req.body || {};

  const existing = db
    .prepare(
      `SELECT c.*, t.name AS type_name
       FROM customers c
       JOIN customer_types t ON t.id = c.customer_type_id
       WHERE c.id = ? AND c.carpark_id = ?`
    )
    .get(id, carparkId);
  if (!existing) return res.status(404).json({ error: 'Customer not found' });

  let typeId = existing.customer_type_id;
  if (customer_type_name && customer_type_name !== existing.type_name) {
    const type = db
      .prepare(
        'SELECT id FROM customer_types WHERE carpark_id = ? AND name = ? AND is_active = 1'
      )
      .get(carparkId, customer_type_name);
    if (!type) return res.status(400).json({ error: 'Unknown customer type' });
    typeId = type.id;
  }

  db.prepare(
    `UPDATE customers
     SET name = ?, email = ?, phone = ?, license_plate = ?, customer_type_id = ?, status = ?
     WHERE id = ? AND carpark_id = ?`
  ).run(
    name || existing.name,
    email ? email.toLowerCase() : existing.email,
    phone || existing.phone,
    license_plate ? license_plate.toUpperCase() : existing.license_plate,
    typeId,
    status || existing.status,
    id,
    carparkId
  );

  const updated = db
    .prepare(
      `SELECT c.id, c.name, c.email, c.phone, c.license_plate,
              c.status, c.account_balance_cents, t.name AS type
       FROM customers c
       JOIN customer_types t ON t.id = c.customer_type_id
       WHERE c.id = ?`
    )
    .get(id);

  res.json({
    id: updated.id,
    name: updated.name,
    email: updated.email,
    phone: updated.phone || '—',
    plate: updated.license_plate,
    type: updated.type,
    balance: `$${(updated.account_balance_cents / 100).toFixed(2)}`,
    status: updated.status
  });
});

app.delete(`${BASE_PATH}/customers/:id`, authMiddleware, (req, res) => {
  const carparkId = req.user.carparkId;
  const id = Number(req.params.id);
  const info = db
    .prepare('DELETE FROM customers WHERE id = ? AND carpark_id = ?')
    .run(id, carparkId);
  if (info.changes === 0) return res.status(404).json({ error: 'Customer not found' });
  res.status(204).send();
});

// --- Parking sessions ---

app.get(`${BASE_PATH}/sessions`, authMiddleware, (req, res) => {
  const carparkId = req.query.carparkId || req.user.carparkId;
  const status = req.query.status || 'ALL';
  const search = (req.query.search || '').toString().toLowerCase();

  if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

  let sqlActive = `
    SELECT s.id, s.license_plate, s.start_time,
           COALESCE(c.name, 'Walk-in Customer') AS customer
    FROM parking_sessions s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.carpark_id = ? AND s.status = 'ACTIVE'
  `;

  let sqlCompleted = `
    SELECT s.id, s.license_plate, s.start_time, s.end_time,
           s.duration_minutes, s.total_fee_cents, s.payment_method,
           COALESCE(c.name, 'Walk-in Customer') AS customer
    FROM parking_sessions s
    LEFT JOIN customers c ON c.id = s.customer_id
    WHERE s.carpark_id = ? AND s.status = 'COMPLETED'
  `;

  const activeRows = status === 'COMPLETED' ? [] : db.prepare(sqlActive).all(carparkId);
  const completedRows = status === 'ACTIVE' ? [] : db.prepare(sqlCompleted).all(carparkId);

  const formatTime = (iso) =>
    new Date(iso).toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toLowerCase();

  const active = activeRows.map((r) => ({
    id: r.id,
    customer: r.customer,
    plate: r.license_plate,
    entry: formatTime(r.start_time),
    status: 'Parked'
  }));

  const completed = completedRows.map((r) => ({
    id: r.id,
    customer: r.customer,
    plate: r.license_plate,
    entry: formatTime(r.start_time),
    exit: formatTime(r.end_time),
    duration: r.duration_minutes
      ? `${Math.floor(r.duration_minutes / 60)}h ${r.duration_minutes % 60}m`
      : '',
    fee: `$${(r.total_fee_cents / 100).toFixed(2)}`,
    payment: r.payment_method === 'ON_ACCOUNT' ? 'on-account' : 'paid'
  }));

  const q = search;
  const filterFn = (s) =>
    !q ||
    s.customer.toLowerCase().includes(q) ||
    s.plate.toLowerCase().includes(q);

  res.json({
    active: active.filter(filterFn),
    completed: completed.filter(filterFn)
  });
});

app.post(`${BASE_PATH}/sessions`, authMiddleware, (req, res) => {
  const carparkId = req.body.carparkId || req.user.carparkId;
  if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

  const { plate, customer_id } = req.body || {};
  const licensePlate = (plate || '').toUpperCase() || `NEW${Math.floor(Math.random() * 900) + 100}`;

  const nowIso = new Date().toISOString();

  const stmt = db.prepare(
    `INSERT INTO parking_sessions
      (carpark_id, customer_id, license_plate, start_time, status, created_at)
     VALUES (?, ?, ?, ?, 'ACTIVE', ?)`
  );
  const info = stmt.run(
    carparkId,
    customer_id || null,
    licensePlate,
    nowIso,
    nowIso
  );

  const created = db
    .prepare(
      `SELECT s.id, s.license_plate, s.start_time,
              COALESCE(c.name, 'Walk-in Customer') AS customer
       FROM parking_sessions s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ?`
    )
    .get(info.lastInsertRowid);

  res.status(201).json({
    id: created.id,
    customer: created.customer,
    plate: created.license_plate,
    entry: new Date(created.start_time).toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toLowerCase(),
    status: 'Parked'
  });
});

app.post(`${BASE_PATH}/sessions/:id/checkout`, authMiddleware, (req, res) => {
  const carparkId = req.user.carparkId;
  const id = Number(req.params.id);
  const paymentMethod = req.body?.payment_method || 'ON_ACCOUNT';

  const session = db
    .prepare(
      `SELECT s.*, c.account_balance_cents
       FROM parking_sessions s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ? AND s.carpark_id = ? AND s.status = 'ACTIVE'`
    )
    .get(id, carparkId);
  if (!session) return res.status(404).json({ error: 'Active session not found' });

  const start = new Date(session.start_time);
  const now = new Date();
  const mins = Math.max(
    Math.round((now.getTime() - start.getTime()) / 60000),
    15
  );
  const feeCents = Math.round(mins * 15); // $0.15 per minute as simple rule

  const updateSession = db.prepare(
    `UPDATE parking_sessions
     SET end_time = ?, duration_minutes = ?, total_fee_cents = ?, payment_method = ?, status = 'COMPLETED'
     WHERE id = ?`
  );
  updateSession.run(
    now.toISOString(),
    mins,
    feeCents,
    paymentMethod === 'ON_ACCOUNT' ? 'ON_ACCOUNT' : 'PAID',
    id
  );

  if (session.customer_id && paymentMethod === 'ON_ACCOUNT') {
    const currentBalance = session.account_balance_cents || 0;
    const newBalance = currentBalance + feeCents;

    db.prepare(
      'UPDATE customers SET account_balance_cents = ? WHERE id = ?'
    ).run(newBalance, session.customer_id);

    db.prepare(
      `INSERT INTO transactions
        (carpark_id, customer_id, parking_session_id,
         type, description, amount_cents, balance_after_cents, created_at)
       VALUES (?, ?, ?, 'CHARGE', ?, ?, ?, ?)`
    ).run(
      carparkId,
      session.customer_id,
      id,
      'Parking session charge',
      feeCents,
      newBalance,
      now.toISOString()
    );
  }

  const updated = db
    .prepare(
      `SELECT s.*, COALESCE(c.name, 'Walk-in Customer') AS customer
       FROM parking_sessions s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.id = ?`
    )
    .get(id);

  const durationStr =
    mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;

  res.json({
    id: updated.id,
    customer: updated.customer,
    plate: updated.license_plate,
    entry: new Date(updated.start_time).toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toLowerCase(),
    exit: new Date(updated.end_time).toLocaleTimeString('en-NZ', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).toLowerCase(),
    duration: durationStr,
    fee: `$${(updated.total_fee_cents / 100).toFixed(2)}`,
    payment: updated.payment_method === 'ON_ACCOUNT' ? 'on-account' : 'paid'
  });
});

// --- Dashboard metrics ---

app.get(`${BASE_PATH}/dashboard/summary`, authMiddleware, (req, res) => {
  const carparkId = req.query.carparkId || req.user.carparkId;
  if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const startIso = todayStart.toISOString();
  const endIso = todayEnd.toISOString();

  const revenueRow = db
    .prepare(
      `SELECT COALESCE(SUM(amount_cents), 0) AS revenue_cents
       FROM transactions
       WHERE carpark_id = ?
         AND type = 'CHARGE'
         AND created_at BETWEEN ? AND ?`
    )
    .get(carparkId, startIso, endIso);

  const usageRows = db
    .prepare(
      `SELECT t.name AS type, COUNT(*) AS count
       FROM customers c
       JOIN customer_types t ON t.id = c.customer_type_id
       WHERE c.carpark_id = ?
       GROUP BY t.name`
    )
    .all(carparkId);

  const occupancyRow = db
    .prepare(
      `SELECT
         (SELECT capacity FROM carparks WHERE id = ?) AS capacity,
         (SELECT COUNT(*) FROM parking_sessions WHERE carpark_id = ? AND status = 'ACTIVE') AS active_count`
    )
    .get(carparkId, carparkId);

  const parked = db
    .prepare(
      `SELECT COALESCE(c.name, 'Walk-in Customer') AS customer,
              s.license_plate,
              s.start_time
       FROM parking_sessions s
       LEFT JOIN customers c ON c.id = s.customer_id
       WHERE s.carpark_id = ? AND s.status = 'ACTIVE'
       ORDER BY s.start_time ASC
       LIMIT 10`
    )
    .all(carparkId)
    .map((r) => ({
      customer: r.customer,
      plate: r.license_plate,
      entry: new Date(r.start_time).toLocaleTimeString('en-NZ', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).toLowerCase(),
      status: 'Active'
    }));

  res.json({
    revenueToday: revenueRow.revenue_cents / 100,
    usageByType: usageRows,
    occupancy: {
      capacity: occupancyRow.capacity || 0,
      active: occupancyRow.active_count || 0,
      rate:
        occupancyRow.capacity > 0
          ? (occupancyRow.active_count / occupancyRow.capacity) * 100
          : 0
    },
    parked
  });
});

// --- Reports + export ---

app.get(`${BASE_PATH}/reports/summary`, authMiddleware, (req, res) => {
  try {
    const carparkId = req.query.carparkId || req.user.carparkId;
    const period = req.query.period || 'This Month';
    const typeFilter = req.query.type || 'All Types';

    if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

    const now = new Date();
    let from, to, groupBy;

    switch (period) {
      case 'Last Month': {
        const month = now.getMonth() - 1;
        const year = month < 0 ? now.getFullYear() - 1 : now.getFullYear();
        const m = (month + 12) % 12;
        from = new Date(year, m, 1);
        to = new Date(year, m + 1, 0, 23, 59, 59);
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

    let typeJoin = '';
    let typeWhere = '';
    if (typeFilter && typeFilter !== 'All Types') {
      typeJoin = `
        JOIN customers c ON c.id = tx.customer_id
        JOIN customer_types ct ON ct.id = c.customer_type_id
      `;
      typeWhere = 'AND ct.name = @typeName';
    }

    const rows = db
      .prepare(
        `
        WITH tx AS (
          SELECT *
          FROM transactions
          WHERE carpark_id = @carparkId
            AND type = 'CHARGE'
            AND created_at BETWEEN @from AND @to
        )
        SELECT
          strftime('${groupBy === 'month' ? '%m' : '%W'}', tx.created_at) AS bucket,
          SUM(tx.amount_cents) AS revenue_cents
        FROM tx
        ${typeJoin}
        WHERE 1=1
        ${typeWhere}
        GROUP BY bucket
        ORDER BY bucket ASC
        `
      )
      .all({
        carparkId,
        from: fromIso,
        to: toIso,
        typeName: typeFilter
      });

    let revenueData;
    if (groupBy === 'week') {
      revenueData = rows.map((r, idx) => ({
        label: `Week ${idx + 1}`,
        revenue: (r.revenue_cents || 0) / 100
      }));
    } else {
      revenueData = rows.map((r) => ({
        label: new Date(from.getFullYear(), Number(r.bucket) - 1, 1).toLocaleString(
          'en-NZ',
          { month: 'short' }
        ),
        revenue: (r.revenue_cents || 0) / 100
      }));
    }

    const usageRows = db
      .prepare(
        `SELECT ct.name AS label, COUNT(*) AS count
         FROM customers c
         JOIN customer_types ct ON ct.id = c.customer_type_id
         WHERE c.carpark_id = ?
         GROUP BY ct.name`
      )
      .all(carparkId);

    const revenueTotal = revenueData.reduce((sum, r) => sum + r.revenue, 0);

    const occupancyRow = db
      .prepare(
        `SELECT
           (SELECT capacity FROM carparks WHERE id = ?) AS capacity,
           (SELECT COUNT(*) FROM parking_sessions WHERE carpark_id = ? AND status = 'ACTIVE') AS active_count`
      )
      .get([carparkId, carparkId]);

    res.json({
      period,
      typeFilter,
      revenueSeries: revenueData,
      usage: usageRows,
      summary: {
        customers: usageRows.reduce((s, u) => s + u.count, 0),
        revenueFormatted: `$${revenueTotal.toFixed(2)}`,
        occupancy: occupancyRow.capacity
          ? `${Math.round((occupancyRow.active_count / occupancyRow.capacity) * 100)}%`
          : '0%'
      }
    });
  } catch (err) {
    console.error('Error in /api/reports/summary:', err.message, err.stack);
    res.status(500).json({ error: err.message });
  }
});

app.get(`${BASE_PATH}/reports/export`, authMiddleware, (req, res) => {
  const carparkId = req.query.carparkId || req.user.carparkId;
  const format = (req.query.format || 'csv').toString().toLowerCase();
  const period = req.query.period || 'This Month';
  const typeFilter = req.query.type || 'All Types';

  if (!carparkId) return res.status(400).json({ error: 'carparkId is required' });

  // Get the same summary data that's shown on the Reports page
  const now = new Date();
  let from, to, groupBy;

  switch (period) {
    case 'Last Month': {
      const month = now.getMonth() - 1;
      const year = month < 0 ? now.getFullYear() - 1 : now.getFullYear();
      const m = (month + 12) % 12;
      from = new Date(year, m, 1);
      to = new Date(year, m + 1, 0, 23, 59, 59);
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

  let typeJoin = '';
  let typeWhere = '';
  if (typeFilter && typeFilter !== 'All Types') {
    typeJoin = `
      JOIN customers c ON c.id = tx.customer_id
      JOIN customer_types ct ON ct.id = c.customer_type_id
    `;
    typeWhere = 'AND ct.name = @typeName';
  }

  // Get revenue series data
  const revenueRows = db
    .prepare(
      `
      WITH tx AS (
        SELECT *
        FROM transactions
        WHERE carpark_id = @carparkId
          AND type = 'CHARGE'
          AND created_at BETWEEN @from AND @to
      )
      SELECT
        strftime('${groupBy === 'month' ? '%m' : '%W'}', tx.created_at) AS bucket,
        SUM(tx.amount_cents) AS revenue_cents
      FROM tx
      ${typeJoin}
      WHERE 1=1
      ${typeWhere}
      GROUP BY bucket
      ORDER BY bucket ASC
      `
    )
    .all({
      carparkId,
      from: fromIso,
      to: toIso,
      typeName: typeFilter
    });

  let revenueData;
  if (groupBy === 'week') {
    revenueData = revenueRows.map((r, idx) => ({
      label: `Week ${idx + 1}`,
      revenue: (r.revenue_cents || 0) / 100
    }));
  } else {
    revenueData = revenueRows.map((r) => ({
      label: new Date(from.getFullYear(), Number(r.bucket) - 1, 1).toLocaleString(
        'en-NZ',
        { month: 'short' }
      ),
      revenue: (r.revenue_cents || 0) / 100
    }));
  }

  // Get usage summary data
  const usageRows = db
    .prepare(
      `SELECT ct.name AS label, COUNT(*) AS count
       FROM customers c
       JOIN customer_types ct ON ct.id = c.customer_type_id
       WHERE c.carpark_id = ?
       GROUP BY ct.name`
    )
    .all(carparkId);

  // Get summary statistics
  const revenueTotal = revenueData.reduce((sum, r) => sum + r.revenue, 0);
  const occupancyRow = db
    .prepare(
      `SELECT
         (SELECT capacity FROM carparks WHERE id = ?) AS capacity,
         (SELECT COUNT(*) FROM parking_sessions WHERE carpark_id = ? AND status = 'ACTIVE') AS active_count`
    )
    .get([carparkId, carparkId]);

  const occupancy = occupancyRow.capacity
    ? `${Math.round((occupancyRow.active_count / occupancyRow.capacity) * 100)}%`
    : '0%';

  // Get detailed transaction data for CSV
  const transactionRows = db
    .prepare(
      `SELECT created_at, description, amount_cents
       FROM transactions
       WHERE carpark_id = ?
         AND type = 'CHARGE'
         AND created_at BETWEEN ? AND ?
       ORDER BY created_at ASC`
    )
    .all(carparkId, fromIso, toIso);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${period.replace(/\s+/g, '-').toLowerCase()}.csv"`
    );

    // Write summary section
    res.write('REPORT SUMMARY\n');
    res.write(`Period:,${period}\n`);
    res.write(`Type Filter:,${typeFilter}\n`);
    res.write(`Total Revenue:,$${revenueTotal.toFixed(2)}\n`);
    res.write(`Total Customers:,${usageRows.reduce((s, u) => s + u.count, 0)}\n`);
    res.write(`Current Occupancy:,${occupancy}\n\n`);

    // Write revenue series
    res.write('REVENUE SERIES\n');
    res.write('Period,Revenue\n');
    for (const r of revenueData) {
      res.write(`${r.label},${r.revenue.toFixed(2)}\n`);
    }
    res.write('\n');

    // Write usage summary
    res.write('CUSTOMER USAGE BY TYPE\n');
    res.write('Type,Count\n');
    for (const u of usageRows) {
      res.write(`${u.label},${u.count}\n`);
    }
    res.write('\n');

    // Write detailed transactions
    res.write('DETAILED TRANSACTIONS\n');
    res.write('Date,Description,Amount\n');
    for (const r of transactionRows) {
      const date = new Date(r.created_at).toISOString().split('T')[0];
      const desc = (r.description || '').replace(/"/g, '""');
      const amount = (r.amount_cents / 100).toFixed(2);
      res.write(`"${date}","${desc}","${amount}"\n`);
    }
    return res.end();
  }

  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report-${period.replace(/\s+/g, '-').toLowerCase()}.pdf"`
    );

    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);

    // Title
    doc.fontSize(20).text('Parking Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(14).text(`Period: ${period}`, { align: 'center' });
    doc.fontSize(12).text(`Type Filter: ${typeFilter}`, { align: 'center' });
    doc.moveDown(1);

    // Summary section
    doc.fontSize(16).text('Summary', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(12);
    doc.text(`Total Revenue: $${revenueTotal.toFixed(2)}`);
    doc.text(`Total Customers: ${usageRows.reduce((s, u) => s + u.count, 0)}`);
    doc.text(`Current Occupancy: ${occupancy}`);
    doc.moveDown(1);

    // Revenue series
    doc.fontSize(16).text('Revenue Series', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text('Period', { continued: true, width: 150 });
    doc.text('Revenue', { align: 'right' });
    doc.moveDown(0.3);

    for (const r of revenueData) {
      doc.text(r.label, { continued: true, width: 150 });
      doc.text(`$${r.revenue.toFixed(2)}`, { align: 'right' });
      doc.moveDown(0.2);
    }
    doc.moveDown(1);

    // Usage summary
    doc.fontSize(16).text('Customer Usage by Type', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text('Type', { continued: true, width: 150 });
    doc.text('Count', { align: 'right' });
    doc.moveDown(0.3);

    for (const u of usageRows) {
      doc.text(u.label, { continued: true, width: 150 });
      doc.text(u.count.toString(), { align: 'right' });
      doc.moveDown(0.2);
    }
    doc.moveDown(1);

    // Detailed transactions
    doc.fontSize(16).text('Detailed Transactions', { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10);
    doc.text('Date', { continued: true, width: 80 });
    doc.text('Description', { continued: true, width: 300 });
    doc.text('Amount', { align: 'right' });
    doc.moveDown(0.3);

    for (const r of transactionRows) {
      const dateStr = new Date(r.created_at).toLocaleDateString();
      const desc = (r.description || '').replace(/\s+/g, ' ').trim();
      const amount = `$${(r.amount_cents / 100).toFixed(2)}`;
      doc.text(dateStr, { continued: true, width: 80 });
      doc.text(desc, { continued: true, width: 300 });
      doc.text(amount, { align: 'right' });
      doc.moveDown(0.2);
    }

    doc.end();
    return;
  }

  res.status(400).json({ error: 'Unsupported format' });
});

// --- Scheduler testing endpoint ---

app.post(
  `${BASE_PATH}/dev/run-statement-job`,
  authMiddleware,
  requireRole(['ADMIN']),
  async (req, res) => {
    const result = await runStatementJob();
    res.json(result);
  }
);

// Health check
app.get(`${BASE_PATH}/health`, (req, res) => {
  res.json({ status: 'ok' });
});

// Start scheduler and server
initScheduler();

app.listen(PORT, () => {
  console.log(`Carpark backend listening on http://localhost:${PORT}`);
});

