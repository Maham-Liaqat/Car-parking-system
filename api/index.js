import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import PDFDocument from 'pdfkit';
import { getDb } from '../server/db.js';
import { initScheduler, runStatementJob } from '../server/scheduler.js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const db = getDb();

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
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  try {
    const user = db.prepare('SELECT * FROM staff_users WHERE email = ?').get(email);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (!bcrypt.compareSync(password, user.password_hash)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        carpark: user.carpark_id
          ? db.prepare('SELECT id, name, location, capacity FROM carparks WHERE id = ?').get(user.carpark_id)
          : null,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/auth/me', authMiddleware, (req, res) => {
  try {
    const user = db.prepare('SELECT * FROM staff_users WHERE id = ?').get(req.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      carpark: user.carpark_id
        ? db.prepare('SELECT id, name, location, capacity FROM carparks WHERE id = ?').get(user.carpark_id)
        : null,
    });
  } catch (err) {
    console.error('Auth/me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Customer types
app.get('/customer-types', authMiddleware, (req, res) => {
  try {
    const types = db.prepare('SELECT * FROM customer_types ORDER BY name').all();
    res.json(types);
  } catch (err) {
    console.error('Get customer types error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/customer-types', authMiddleware, requireRole(['ADMIN', 'MANAGER']), (req, res) => {
  const { name, billing_mode, hourly_rate_cents, daily_rate_cents, monthly_rate_cents, annual_rate_cents, max_parking_hours_per_session, max_sessions_per_day, allow_overnight, is_on_account } = req.body;
  try {
    const carpark = db.prepare('SELECT carpark_id FROM staff_users WHERE id = ?').get(req.userId);
    const insertType = db.prepare(
      `INSERT INTO customer_types
        (carpark_id, name, billing_mode, hourly_rate_cents, daily_rate_cents,
         monthly_rate_cents, annual_rate_cents, max_parking_hours_per_session,
         max_sessions_per_day, allow_overnight, is_on_account, is_active, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const result = insertType.run(
      carpark.carpark_id || 1,
      name,
      billing_mode,
      hourly_rate_cents || null,
      daily_rate_cents || null,
      monthly_rate_cents || null,
      annual_rate_cents || null,
      max_parking_hours_per_session || null,
      max_sessions_per_day || null,
      allow_overnight ? 1 : 0,
      is_on_account ? 1 : 0,
      1,
      new Date().toISOString()
    );
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (err) {
    console.error('Create customer type error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Customers
app.get('/customers', authMiddleware, (req, res) => {
  try {
    const customers = db.prepare('SELECT * FROM customers ORDER BY created_at DESC').all();
    res.json(customers);
  } catch (err) {
    console.error('Get customers error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/customers', authMiddleware, (req, res) => {
  const { name, email, phone, license_plate, customer_type_id, status, account_balance_cents, account_billing_enabled } = req.body;
  try {
    const carpark = db.prepare('SELECT carpark_id FROM staff_users WHERE id = ?').get(req.userId);
    const insertCustomer = db.prepare(
      `INSERT INTO customers
        (carpark_id, customer_type_id, name, email, phone, license_plate,
         status, account_balance_cents, account_billing_enabled,
         start_date, end_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    const result = insertCustomer.run(
      carpark.carpark_id || 1,
      customer_type_id,
      name,
      email,
      phone,
      license_plate,
      status || 'ACTIVE',
      account_balance_cents || 0,
      account_billing_enabled ? 1 : 0,
      now,
      null,
      now
    );
    res.json({ id: result.lastInsertRowid, ...req.body });
  } catch (err) {
    console.error('Create customer error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.put('/customers/:id', authMiddleware, (req, res) => {
  const { name, email, phone, license_plate, status, account_balance_cents, account_billing_enabled } = req.body;
  try {
    const updateCustomer = db.prepare(
      `UPDATE customers SET name = ?, email = ?, phone = ?, license_plate = ?, status = ?, account_balance_cents = ?, account_billing_enabled = ? WHERE id = ?`
    );
    updateCustomer.run(
      name,
      email,
      phone,
      license_plate,
      status,
      account_balance_cents,
      account_billing_enabled ? 1 : 0,
      req.params.id
    );
    res.json({ id: req.params.id, ...req.body });
  } catch (err) {
    console.error('Update customer error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/customers/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.status(204).send();
  } catch (err) {
    console.error('Delete customer error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Parking sessions
app.get('/sessions', authMiddleware, (req, res) => {
  try {
    const sessions = db.prepare('SELECT * FROM parking_sessions ORDER BY start_time DESC').all();
    res.json(sessions);
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/sessions', authMiddleware, (req, res) => {
  const { customer_id, customer_type_id, entry_location, entry_photo_url } = req.body;
  try {
    const carpark = db.prepare('SELECT carpark_id FROM staff_users WHERE id = ?').get(req.userId);
    const insertSession = db.prepare(
      `INSERT INTO parking_sessions
        (carpark_id, customer_id, customer_type_id, start_time, entry_location, entry_photo_url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    const result = insertSession.run(
      carpark.carpark_id || 1,
      customer_id,
      customer_type_id,
      now,
      entry_location,
      entry_photo_url || null,
      'ACTIVE',
      now
    );
    res.json({ id: result.lastInsertRowid, ...req.body, start_time: now });
  } catch (err) {
    console.error('Create session error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/sessions/:id/checkout', authMiddleware, (req, res) => {
  const { exit_location, exit_photo_url, amount_paid_cents } = req.body;
  try {
    const session = db.prepare('SELECT * FROM parking_sessions WHERE id = ?').get(req.params.id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    const now = new Date().toISOString();
    const updateSession = db.prepare(
      `UPDATE parking_sessions SET end_time = ?, exit_location = ?, exit_photo_url = ?, amount_paid_cents = ?, status = ? WHERE id = ?`
    );
    updateSession.run(now, exit_location, exit_photo_url || null, amount_paid_cents || 0, 'COMPLETED', req.params.id);
    res.json({ id: req.params.id, ...req.body, end_time: now });
  } catch (err) {
    console.error('Checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Dashboard
app.get('/dashboard/summary', authMiddleware, (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const todaySessions = db.prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_paid_cents), 0) as total_revenue
       FROM parking_sessions
       WHERE DATE(start_time) = ?`
    ).get(today);
    const activeSessions = db.prepare('SELECT COUNT(*) as count FROM parking_sessions WHERE status = ?').get('ACTIVE');
    const totalCustomers = db.prepare('SELECT COUNT(*) as count FROM customers WHERE status = ?').get('ACTIVE');
    res.json({
      todaySessions: todaySessions.count,
      todayRevenue: todaySessions.total_revenue,
      activeSessions: activeSessions.count,
      totalCustomers: totalCustomers.count,
    });
  } catch (err) {
    console.error('Dashboard summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Reports
app.get('/reports/summary', authMiddleware, (req, res) => {
  try {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const summary = db.prepare(
      `SELECT
        COUNT(*) as total_sessions,
        COALESCE(SUM(amount_paid_cents), 0) as total_revenue,
        AVG(amount_paid_cents) as avg_charge,
        COUNT(DISTINCT DATE(start_time)) as days_active
       FROM parking_sessions
       WHERE start_time >= ?`
    ).get(last30Days);
    res.json(summary);
  } catch (err) {
    console.error('Reports summary error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/reports/export', authMiddleware, (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const sessions = db.prepare(
      `SELECT ps.*, c.name as customer_name, ct.name as type_name
       FROM parking_sessions ps
       JOIN customers c ON ps.customer_id = c.id
       JOIN customer_types ct ON ps.customer_type_id = ct.id
       WHERE DATE(ps.start_time) BETWEEN ? AND ?
       ORDER BY ps.start_time DESC`
    ).all(startDate, endDate);

    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="report-${startDate}-to-${endDate}.pdf"`);
    doc.pipe(res);

    doc.fontSize(20).text('Parking Sessions Report', { align: 'center' });
    doc.fontSize(12).text(`Period: ${startDate} to ${endDate}`, { align: 'center' });
    doc.moveDown();

    const tableTop = doc.y;
    const col1 = 50, col2 = 150, col3 = 250, col4 = 350, col5 = 450;

    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Customer', col1, tableTop);
    doc.text('Type', col2, tableTop);
    doc.text('Entry', col3, tableTop);
    doc.text('Exit', col4, tableTop);
    doc.text('Revenue', col5, tableTop);

    doc.font('Helvetica');
    let y = tableTop + 20;
    sessions.forEach((session) => {
      const entryTime = new Date(session.start_time).toLocaleString();
      const exitTime = session.end_time ? new Date(session.end_time).toLocaleString() : 'N/A';
      const revenue = `$${(session.amount_paid_cents / 100).toFixed(2)}`;

      doc.text(session.customer_name || 'N/A', col1, y);
      doc.text(session.type_name, col2, y);
      doc.text(entryTime, col3, y);
      doc.text(exitTime, col4, y);
      doc.text(revenue, col5, y);
      y += 20;
    });

    doc.end();
  } catch (err) {
    console.error('Export error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

export default app;
