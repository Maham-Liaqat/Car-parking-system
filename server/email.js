import nodemailer from 'nodemailer';

let cachedTransporter = null;

export function getMailer() {
  if (cachedTransporter) return cachedTransporter;

  const {
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    SMTP_SECURE,
    SMTP_FROM
  } = process.env;

  if (!SMTP_HOST) {
    console.warn('[email] SMTP_HOST not set; emails will be logged only.');
    cachedTransporter = null;
    return null;
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT ? Number(SMTP_PORT) : 587,
    secure: SMTP_SECURE === 'true',
    auth: SMTP_USER
      ? {
          user: SMTP_USER,
          pass: SMTP_PASS
        }
      : undefined
  });

  cachedTransporter = { transporter, from: SMTP_FROM || SMTP_USER };
  return cachedTransporter;
}

export async function sendStatementEmail({ to, subject, html }) {
  const mailer = getMailer();

  if (!mailer) {
    console.log('[email] Pretend sending email to', to);
    console.log('Subject:', subject);
    console.log('HTML:', html);
    return { simulated: true };
  }

  const { transporter, from } = mailer;
  const result = await transporter.sendMail({
    from,
    to,
    subject,
    html
  });

  return result;
}

