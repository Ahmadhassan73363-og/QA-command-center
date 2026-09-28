import pg from 'pg';
import { config } from '../config.js';

// BIGINT (int8) comes back as a string by default; ids stay well under 2^53.
pg.types.setTypeParser(20, (v) => Number(v));

const isCloudSsl = config.databaseUrl.includes('sslmode=require') ||
  config.databaseUrl.includes('neon.tech') ||
  config.databaseUrl.includes('supabase.co');

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10,
  ssl: isCloudSsl ? { rejectUnauthorized: false } : undefined,
});
