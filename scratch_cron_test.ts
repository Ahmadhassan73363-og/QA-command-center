import { app } from './src/api/server.ts';
import { pool } from './src/db/pool.ts';

await app.ready();
const res = await app.inject({ method: 'GET', url: '/api/cron' });
console.log('status:', res.statusCode);
const body = JSON.parse(res.body);
console.log('ok:', body.ok, 'site count:', body.count);
console.log('sample result:', JSON.stringify(body.results?.[0]));

await pool.end();
