import YAML from 'yaml';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { listChecks } from '../checks/index.js';
import type { SiteRecord } from '../checks/types.js';
import { loadProfileMap } from '../profiles/load.js';
import {
  ConfigError, GLOBAL_DEFAULTS, profileChain, resolveConfig, unknownChecks,
  type Layer, type ProfileRow, type ResolvedConfig,
} from '../profiles/resolve.js';
import { removeSiteSchedule, syncSiteSchedule } from '../engine/schedule.js';
import { eventFor, notify, type ChannelOutcome } from '../alerts/notify.js';

export class NotFoundError extends Error { readonly statusCode = 404; }
export class ConflictError extends Error { readonly statusCode = 409; }

/** Top-level keys that form the site's override layer (spec v1 YAML shape still works). */
const OVERRIDE_KEYS = ['checks', 'expected', 'thresholds', 'disable', 'schedule', 'retry'] as const;

const baseSchema = z.object({
  name: z.string().min(1).max(200),
  url: z.string().url().refine((u) => /^https?:\/\//i.test(u), 'url must start with http:// or https://'),
  profile: z.string().min(1),
  region: z.string().min(1).max(64).default('global'),
  timezone: z.string().default('UTC'),
  tags: z.array(z.string()).default([]),
  alert_policy: z.string().optional(),
  is_active: z.boolean().default(true),
  overrides: z.record(z.unknown()).optional(),
});
const patchSchema = baseSchema.partial();

export interface SiteRow extends SiteRecord {
  timezone: string;
  overrides: Layer;
  created_at: string;
  updated_at: string;
  /** Only set right after createSite() — how the "site added" notification went, per channel. */
  emailNotice?: ChannelOutcome;
}

/** Canonical form so "https://a.com/" and "https://a.com" are the same site. */
export function normalizeUrl(raw: string): string {
  const u = new URL(raw);
  const path = u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '');
  return `${u.protocol}//${u.host.toLowerCase()}${path}`;
}

function extractOverrides(raw: Record<string, unknown>, base: Layer): Layer {
  const picked: Layer = {};
  for (const key of OVERRIDE_KEYS) if (key in raw) picked[key] = raw[key];
  const explicit = (raw.overrides ?? {}) as Layer;
  return { ...base, ...picked, ...explicit };
}

const hasOverrideKeys = (raw: Record<string, unknown>) =>
  OVERRIDE_KEYS.some((k) => k in raw) || 'overrides' in raw;

let knownChecks: Set<string> | undefined;

export function resolveForSite(profileId: string, overrides: Layer, profiles: Map<string, ProfileRow>): ResolvedConfig {
  const chain = profileChain(profileId, (id) => profiles.get(id));
  const resolved = resolveConfig([GLOBAL_DEFAULTS, ...chain, overrides]);
  knownChecks ??= new Set(listChecks().map((c) => c.type));
  const unknown = unknownChecks(resolved, knownChecks);
  if (unknown.length) throw new ConfigError(`Unknown check types: ${unknown.join(', ')}`);
  return resolved;
}

async function policyId(name: string | undefined): Promise<number | null> {
  if (!name) return null;
  const { rows } = await pool.query<{ id: number }>('SELECT id FROM alert_policies WHERE name = $1', [name]);
  if (!rows[0]) throw new ConfigError(`Unknown alert policy "${name}"`);
  return rows[0].id;
}

export async function getSite(id: number): Promise<SiteRow> {
  const { rows } = await pool.query<SiteRow>('SELECT * FROM sites WHERE id = $1', [id]);
  if (!rows[0]) throw new NotFoundError(`Site ${id} not found`);
  return rows[0];
}

export async function listSites(): Promise<SiteRow[]> {
  const { rows } = await pool.query<SiteRow>('SELECT * FROM sites ORDER BY name');
  return rows;
}

export async function createSite(raw: unknown): Promise<SiteRow> {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const input = baseSchema.parse(obj);
  const overrides = extractOverrides(obj, input.tags.length ? { '+tags': input.tags } : {});
  const resolved = resolveForSite(input.profile, overrides, await loadProfileMap());
  try {
    const { rows } = await pool.query<SiteRow>(
      `INSERT INTO sites (name, url, region, profile_id, timezone, tags, overrides, resolved_config, alert_policy_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10) RETURNING *`,
      [
        input.name, normalizeUrl(input.url), input.region, input.profile, input.timezone, resolved.tags,
        JSON.stringify(overrides), JSON.stringify(resolved), await policyId(input.alert_policy), input.is_active,
      ],
    );
    const site = rows[0]!;
    await syncSiteSchedule(site);
    // Awaited (not fire-and-forget): on Vercel serverless, the function can freeze right after
    // the response is sent, killing any not-yet-finished background work — a dangling promise
    // here would make this email undeliverable in practice. notify() never throws internally
    // (failures are caught and logged), so this can't fail site creation itself.
    const outcomes = await notify(site, eventFor(site, {
      event: 'site.added',
      severity: 'warn',
      checkType: 'site.added',
      summary: `${site.name} (${site.url}) was added to monitoring.`,
    }));
    site.emailNotice = outcomes.find((o) => o.type === 'email');
    return site;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      throw new ConflictError(`A site with url ${normalizeUrl(input.url)} and region ${input.region} already exists`);
    }
    throw err;
  }
}

/** PATCH: scalar fields replace; any override key replaces the whole override layer. */
export async function updateSite(id: number, raw: unknown): Promise<SiteRow> {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const patch = patchSchema.parse(obj);
  const current = await getSite(id);

  let overrides = current.overrides;
  if (hasOverrideKeys(obj)) {
    const keepTags = current.overrides['+tags'] ? { '+tags': current.overrides['+tags'] } : {};
    overrides = extractOverrides(obj, keepTags);
  }
  if (patch.tags) overrides = { ...overrides, '+tags': patch.tags };

  const profile = patch.profile ?? current.profile_id;
  const resolved = resolveForSite(profile, overrides, await loadProfileMap());
  const alertPolicyId = patch.alert_policy !== undefined ? await policyId(patch.alert_policy) : current.alert_policy_id;

  try {
    const { rows } = await pool.query<SiteRow>(
      `UPDATE sites SET name=$2, url=$3, region=$4, profile_id=$5, timezone=$6, tags=$7, overrides=$8::jsonb,
         resolved_config=$9::jsonb, alert_policy_id=$10, is_active=$11, updated_at=now()
       WHERE id=$1 RETURNING *`,
      [
        id, patch.name ?? current.name, patch.url ? normalizeUrl(patch.url) : current.url,
        patch.region ?? current.region, profile, patch.timezone ?? current.timezone, resolved.tags,
        JSON.stringify(overrides), JSON.stringify(resolved), alertPolicyId, patch.is_active ?? current.is_active,
      ],
    );
    const site = rows[0]!;
    await syncSiteSchedule(site);
    return site;
  } catch (err) {
    if ((err as { code?: string }).code === '23505') throw new ConflictError('Another site already has that url + region');
    throw err;
  }
}

export async function deleteSite(id: number): Promise<void> {
  const { rowCount } = await pool.query('DELETE FROM sites WHERE id = $1', [id]);
  if (!rowCount) throw new NotFoundError(`Site ${id} not found`);
  await removeSiteSchedule(id);
}

export interface ImportOutcome {
  index: number;
  name?: string;
  status: 'created' | 'updated' | 'error';
  id?: number;
  error?: string;
}

/** Accepts one site, a list, or { sites: [...] }, as YAML or JSON. */
export async function importSites(text: string, upsert: boolean): Promise<ImportOutcome[]> {
  const doc = YAML.parse(text) as unknown;
  const items: unknown[] = Array.isArray(doc)
    ? doc
    : doc && typeof doc === 'object' && Array.isArray((doc as { sites?: unknown }).sites)
      ? (doc as { sites: unknown[] }).sites
      : [doc];

  const out: ImportOutcome[] = [];
  for (const [index, item] of items.entries()) {
    const name = (item as { name?: string })?.name;
    try {
      const site = await createSite(item);
      out.push({ index, name, status: 'created', id: site.id });
    } catch (err) {
      if (err instanceof ConflictError && upsert) {
        const i = item as { url: string; region?: string };
        const { rows } = await pool.query<{ id: number }>(
          'SELECT id FROM sites WHERE url = $1 AND region = $2',
          [normalizeUrl(i.url), i.region ?? 'global'],
        );
        const site = await updateSite(rows[0]!.id, item);
        out.push({ index, name, status: 'updated', id: site.id });
      } else {
        out.push({ index, name, status: 'error', error: errorText(err) });
      }
    }
  }
  return out;
}

/** Re-resolve every site against current profiles (run after profiles change). */
export async function reresolveAllSites(): Promise<number> {
  const profiles = await loadProfileMap();
  const { rows } = await pool.query<{ id: number; profile_id: string; overrides: Layer }>(
    'SELECT id, profile_id, overrides FROM sites',
  );
  for (const r of rows) {
    const resolved = resolveForSite(r.profile_id, r.overrides, profiles);
    await pool.query('UPDATE sites SET resolved_config = $2::jsonb, tags = $3, updated_at = now() WHERE id = $1', [
      r.id, JSON.stringify(resolved), resolved.tags,
    ]);
  }
  return rows.length;
}

export function errorText(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
  return err instanceof Error ? err.message : String(err);
}
