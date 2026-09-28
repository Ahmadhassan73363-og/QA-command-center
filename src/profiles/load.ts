import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { listChecks } from '../checks/index.js';
import { ConfigError, profileChain, type ProfileRow } from './resolve.js';

const profileFileSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  description: z.string().optional(),
  extends: z.string().optional(),
  adapter: z.string().optional(),
  config: z.record(z.unknown()).default({}),
});
type ProfileFile = z.infer<typeof profileFileSchema>;

export async function loadProfileMap(): Promise<Map<string, ProfileRow>> {
  const { rows } = await pool.query<ProfileRow>('SELECT id, extends, config FROM site_profiles');
  return new Map(rows.map((r) => [r.id, r]));
}

function assertKnownChecks(p: ProfileFile, known: Set<string>): void {
  const checks = (p.config.checks ?? {}) as Record<string, unknown>;
  const disable = Array.isArray(p.config.disable) ? (p.config.disable as string[]) : [];
  const unknown = [...Object.keys(checks), ...disable].filter((id) => !known.has(id));
  if (unknown.length) throw new ConfigError(`Profile "${p.id}" references unknown checks: ${unknown.join(', ')}`);
}

/** Upsert every profiles/*.yaml as a built-in profile, parents before children. */
export async function loadBuiltinProfiles(dir: string): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => /\.ya?ml$/.test(f)).sort();
  const known = new Set(listChecks().map((c) => c.type));
  const pending = new Map<string, ProfileFile>();
  for (const f of files) {
    const parsed = profileFileSchema.parse(YAML.parse(await readFile(path.join(dir, f), 'utf8')));
    assertKnownChecks(parsed, known);
    pending.set(parsed.id, parsed);
  }

  const existing = await loadProfileMap();
  const done = new Set(existing.keys());
  const loaded: string[] = [];
  while (pending.size) {
    let progressed = false;
    for (const p of [...pending.values()]) {
      if (p.extends && !done.has(p.extends)) {
        if (!pending.has(p.extends)) throw new ConfigError(`Profile "${p.id}" extends unknown "${p.extends}"`);
        continue;
      }
      await pool.query(
        `INSERT INTO site_profiles (id, name, description, extends, config, adapter, is_builtin)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6, true)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description,
           extends = EXCLUDED.extends, config = EXCLUDED.config, adapter = EXCLUDED.adapter`,
        [p.id, p.name, p.description ?? null, p.extends ?? null, JSON.stringify(p.config), p.adapter ?? null],
      );
      done.add(p.id);
      pending.delete(p.id);
      loaded.push(p.id);
      progressed = true;
    }
    if (!progressed) throw new ConfigError(`Profile inheritance cycle among: ${[...pending.keys()].join(', ')}`);
  }

  const map = await loadProfileMap();
  for (const id of map.keys()) profileChain(id, (x) => map.get(x)); // validates depth + cycles
  return loaded;
}
