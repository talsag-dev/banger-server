import { Pool, types } from 'pg';

// Configure pg to parse TIMESTAMP (without timezone) as UTC
// OID 1114 = TIMESTAMP (without timezone)
// This ensures all timestamps from PostgreSQL are treated as UTC
types.setTypeParser(1114, (val: string) => {
  if (!val) return null;

  // If it already has timezone info (shouldn't happen for TIMESTAMP, but be safe)
  if (val.endsWith('Z') || /[+-]\d{2}:\d{2}$/.test(val)) {
    return new Date(val);
  }

  // No timezone - treat as UTC (PostgreSQL TIMESTAMP columns are stored as UTC)
  return new Date(`${val}Z`);
});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
  connectionTimeoutMillis: 2000, // How long to wait for a connection
});

// Test the connection
pool.on('connect', () => {
  console.log('🗄️  Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Database connection error:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Closing database connection pool...');
  await pool.end();
  process.exit(0);
});

export { pool };
