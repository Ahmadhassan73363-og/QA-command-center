import { createServer } from 'node:http';

// Inline config loading before any imports
process.env.DATABASE_URL ??= '';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.STATUS_PAGE_PUBLIC ??= 'true';
process.env.ADMIN_TOKEN ??= '';
process.env.VERCEL = '1';

// Dynamic import so env is set before config.ts reads it
const { app } = await import('../dist/api/server.js');

await app.ready();

export default async function handler(req, res) {
  app.server.emit('request', req, res);
}
