import { pool } from './connection';
import fs from 'fs';
import path from 'path';

interface Migration {
  filename: string;
  version: number;
  sql: string;
}

/**
 * Creates the migrations tracking table if it doesn't exist
 */
const ensureMigrationsTable = async (): Promise<void> => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      filename VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

/**
 * Gets all applied migrations from the database
 */
const getAppliedMigrations = async (): Promise<Set<number>> => {
  const { rows } = await pool.query<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version'
  );
  return new Set(rows.map((row) => row.version));
};

/**
 * Marks a migration as applied in the database
 */
const markMigrationApplied = async (version: number, filename: string): Promise<void> => {
  await pool.query('INSERT INTO schema_migrations (version, filename) VALUES ($1, $2)', [
    version,
    filename,
  ]);
};

/**
 * Reads all migration files from the migrations directory
 */
const loadMigrations = (migrationsDir: string): Migration[] => {
  if (!fs.existsSync(migrationsDir)) {
    return [];
  }

  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort(); // Sort alphabetically to ensure order

  return files.map((file) => {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    // Extract version number from filename (e.g., "001_add_column.sql" -> 1)
    const match = file.match(/^(\d+)_/);
    const version = match ? parseInt(match[1], 10) : 0;

    return {
      filename: file,
      version,
      sql,
    };
  });
};

/**
 * Runs all pending migrations
 */
export const runMigrations = async (): Promise<void> => {
  try {
    console.log('🔄 Running database migrations...');

    // Ensure migrations table exists
    await ensureMigrationsTable();

    // Get migrations directory
    const migrationsDir = path.join(__dirname, '../../db/migrations');

    if (!fs.existsSync(migrationsDir)) {
      console.log('⚠️ No migrations directory found, skipping migrations');
      return;
    }

    // Load all migration files
    const migrations = loadMigrations(migrationsDir);

    if (migrations.length === 0) {
      console.log('⚠️ No migration files found');
      return;
    }

    // Get applied migrations
    const appliedMigrations = await getAppliedMigrations();

    // Filter to only pending migrations
    const pendingMigrations = migrations.filter(
      (migration) => !appliedMigrations.has(migration.version)
    );

    if (pendingMigrations.length === 0) {
      console.log('✅ All migrations are up to date');
      return;
    }

    console.log(`📦 Found ${pendingMigrations.length} pending migration(s)`);

    // Run each pending migration in order
    for (const migration of pendingMigrations) {
      try {
        console.log(`  → Running migration: ${migration.filename}`);
        await pool.query(migration.sql);
        await markMigrationApplied(migration.version, migration.filename);
        console.log(`  ✅ Applied: ${migration.filename}`);
      } catch (error: any) {
        console.error(`  ❌ Failed to apply migration ${migration.filename}:`, error);
        throw error; // Stop on first error
      }
    }

    console.log(`✅ Successfully applied ${pendingMigrations.length} migration(s)`);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
};
