import { pool } from './connection';
import fs from 'fs';
import path from 'path';

export const initializeDatabase = async (): Promise<void> => {
  try {
    console.log('🔄 Initializing database...');

    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    // Check if tables exist
    const { rows } = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
    `);

    if (rows.length === 0) {
      console.log('📝 No tables found, creating schema...');
      const schemaPath = path.join(__dirname, '../../db/init.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      await pool.query(schema);
      console.log('✅ Database schema created successfully');
    } else {
      console.log(`✅ Database already initialized with ${rows.length} tables`);
      console.log('⚠️ Skipping schema updates (using existing tables)');
    }
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
};export const closeDatabase = async (): Promise<void> => {
  await pool.end();
  console.log('🔌 Database connection closed');
};
