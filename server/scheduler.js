import cron from 'node-cron';
import { getDb } from './db.js';
import { sendStatementEmail } from './email.js';

function startMonthlyStatementJob() {
  // Run at 02:00 every day; on the 20th we send statements
  cron.schedule('0 2 * * *', async () => {
    const today = new Date();
    if (today.getDate() !== 20) return;
    console.log('[scheduler] 20th of month detected, sending statements...');
    await runStatementJob();
  });
}

export async function runStatementJob() {
  const db = getDb();
  const today = new Date();
  const periodStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const periodEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();

  const customers = db
    .prepare(
      `SELECT c.id, c.carpark_id, c.name, c.email, c.account_balance_cents, cp.name AS carpark_name
       FROM customers c
       JOIN carparks cp ON cp.id = c.carpark_id
       WHERE c.account_billing_enabled = 1
         AND c.account_balance_cents > 0
         AND c.email IS NOT NULL`
    )
    .all();

  const insertStatement = db.prepare(
    `INSERT INTO email_statements
      (carpark_id, customer_id, period_start, period_end,
       total_due_cents, email_to, payment_link, sent_at, status, error_message, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const selectTxns = db.prepare(
    `SELECT created_at, description, amount_cents
     FROM transactions
     WHERE customer_id = ?
       AND created_at BETWEEN ? AND ?
     ORDER BY created_at ASC`
  );

  const results = [];

  for (const c of customers) {
    const txns = selectTxns.all(c.id, periodStartIso, periodEndIso);
    const amountDollars = (c.account_balance_cents / 100).toFixed(2);
    const paymentLink = `https://payments.example.com/pay?customer=${encodeURIComponent(
      c.id
    )}&amount=${amountDollars}`;

    const rowsHtml = txns
      .map(
        (t) => `
          <tr>
            <td>${new Date(t.created_at).toLocaleDateString()}</td>
            <td>${t.description || ''}</td>
            <td style="text-align:right;">$${(t.amount_cents / 100).toFixed(2)}</td>
          </tr>
        `
      )
      .join('');

    const html = `
      <p>Hi ${c.name},</p>
      <p>Here is your statement for ${c.carpark_name} for the period
      ${periodStart.toLocaleDateString()} – ${periodEnd.toLocaleDateString()}.</p>
      <table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse; font-size:13px;">
        <thead>
          <tr>
            <th>Date</th>
            <th>Description</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="3">No transactions this period.</td></tr>'}
        </tbody>
      </table>
      <p><strong>Balance due:</strong> $${amountDollars}</p>
      <p>You can pay securely using this link:<br/>
        <a href="${paymentLink}">${paymentLink}</a>
      </p>
      <p>Thank you for your business.</p>
    `;

    let status = 'SENT';
    let error = null;
    let sentAtIso = new Date().toISOString();

    try {
      await sendStatementEmail({
        to: c.email,
        subject: `Account statement – ${c.carpark_name}`,
        html
      });
    } catch (err) {
      console.error('[scheduler] Failed to send statement for customer', c.id, err);
      status = 'FAILED';
      error = err.message || String(err);
    }

    insertStatement.run(
      c.carpark_id,
      c.id,
      periodStartIso,
      periodEndIso,
      c.account_balance_cents,
      c.email,
      paymentLink,
      sentAtIso,
      status,
      error,
      new Date().toISOString()
    );

    results.push({
      customerId: c.id,
      name: c.name,
      email: c.email,
      amountCents: c.account_balance_cents,
      status,
      error,
      sentAt: sentAtIso
    });
  }

  console.log(
    `[scheduler] Statement run complete for period ${periodStartIso} – ${periodEndIso}, customers: ${customers.length}`
  );

  return {
    periodStart: periodStartIso,
    periodEnd: periodEndIso,
    totalCustomers: customers.length,
    results
  };
}

export function initScheduler() {
  startMonthlyStatementJob();
}

