const Database = require('better-sqlite3');

const db = new Database('./server/carpark.db');

try {
  const carparkId = 1;
  const period = 'This Month';
  const typeFilter = 'Annual';
  const groupBy = 'week';
  
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  
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
  
  const sql = `
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
  `;
  
  console.log('SQL:\n', sql);
  console.log('\nParameters:', { carparkId, from: fromIso, to: toIso, typeName: typeFilter });
  
  const rows = db
    .prepare(sql)
    .all({
      carparkId,
      from: fromIso,
      to: toIso,
      typeName: typeFilter
    });
  
  console.log('\nResults:', rows);
  
  // Test the occupancy query
  const occupancyRow = db
    .prepare(
      `SELECT
         (SELECT capacity FROM carparks WHERE id = ?) AS capacity,
         (SELECT COUNT(*) FROM parking_sessions WHERE carpark_id = ? AND status = 'ACTIVE') AS active_count`
    )
    .get([carparkId, carparkId]);
  
  console.log('\nOccupancy:', occupancyRow);
  
} catch (err) {
  console.error('Error:', err.message);
  console.error('Stack:', err.stack);
}

db.close();
