import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from './pool.js';
import { ensurePartitions } from './partitions.js';
import { loadBuiltinProfiles } from '../profiles/load.js';
import { reresolveAllSites } from '../sites/service.js';
const root = process.cwd();
async function runMigrations() {
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    const { rows } = await pool.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = (await readdir(path.join(root, 'migrations'))).filter((f) => f.endsWith('.sql')).sort();
    for (const f of files) {
        if (applied.has(f))
            continue;
        const sql = await readFile(path.join(root, 'migrations', f), 'utf8');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
            await client.query('COMMIT');
            console.log(`[migrate] applied ${f}`);
        }
        catch (err) {
            await client.query('ROLLBACK');
            throw err;
        }
        finally {
            client.release();
        }
    }
}
try {
    await runMigrations();
    await ensurePartitions();
    const profiles = await loadBuiltinProfiles(path.join(root, 'profiles'));
    console.log(`[migrate] profiles loaded: ${profiles.join(', ')}`);
    console.log(`[migrate] re-resolved ${await reresolveAllSites()} sites`);
}
finally {
    await pool.end();
}
//# sourceMappingURL=migrate.js.map