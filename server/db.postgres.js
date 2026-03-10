import { Pool } from 'pg';

let pool;

export function getPool() {
  if (pool) return pool;
  const { DATABASE_URL } = process.env;
  if (!DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }
  // Use SSL in serverless environments (Supabase requires SSL over the public endpoint)
  pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  return pool;
}

export async function one(sql, params = []) {
  const res = await getPool().query(sql, params);
  return res.rows[0] || null;
}

export async function many(sql, params = []) {
  const res = await getPool().query(sql, params);
  return res.rows;
}

export async function exec(sql, params = []) {
  const res = await getPool().query(sql, params);
  return { rowCount: res.rowCount, rows: res.rows };
}

export async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn({
      query: (q, p) => client.query(q, p),
      one: async (q, p) => {
        const r = await client.query(q, p);
        return r.rows[0] || null;
      },
      many: async (q, p) => {
        const r = await client.query(q, p);
        return r.rows;
      },
    });
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}
