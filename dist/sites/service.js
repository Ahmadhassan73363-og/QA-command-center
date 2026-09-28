import YAML from 'yaml';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { listChecks } from '../checks/index.js';
import { loadProfileMap } from '../profiles/load.js';
import { ConfigError, GLOBAL_DEFAULTS, profileChain, resolveConfig, unknownChecks, } from '../profiles/resolve.js';
import { removeSiteSchedule, syncSiteSchedule } from '../engine/schedule.js';
export class NotFoundError extends Error {
    statusCode = 404;
}
export class ConflictError extends Error {
    statusCode = 409;
}
/** Top-level keys that form the site's override layer (spec v1 YAML shape still works). */
const OVERRIDE_KEYS = ['checks', 'expected', 'thresholds', 'disable', 'schedule', 'retry'];
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
/** Canonical form so "https://a.com/" and "https://a.com" are the same site. */
export function normalizeUrl(raw) {
    const u = new URL(raw);
    const path = u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '');
    return `${u.protocol}//${u.host.toLowerCase()}${path}`;
}
function extractOverrides(raw, base) {
    const picked = {};
    for (const key of OVERRIDE_KEYS)
        if (key in raw)
            picked[key] = raw[key];
    const explicit = (raw.overrides ?? {});
    return { ...base, ...picked, ...explicit };
}
const hasOverrideKeys = (raw) => OVERRIDE_KEYS.some((k) => k in raw) || 'overrides' in raw;
let knownChecks;
export function resolveForSite(profileId, overrides, profiles) {
    const chain = profileChain(profileId, (id) => profiles.get(id));
    const resolved = resolveConfig([GLOBAL_DEFAULTS, ...chain, overrides]);
    knownChecks ??= new Set(listChecks().map((c) => c.type));
    const unknown = unknownChecks(resolved, knownChecks);
    if (unknown.length)
        throw new ConfigError(`Unknown check types: ${unknown.join(', ')}`);
    return resolved;
}
async function policyId(name) {
    if (!name)
        return null;
    const { rows } = await pool.query('SELECT id FROM alert_policies WHERE name = $1', [name]);
    if (!rows[0])
        throw new ConfigError(`Unknown alert policy "${name}"`);
    return rows[0].id;
}
export async function getSite(id) {
    const { rows } = await pool.query('SELECT * FROM sites WHERE id = $1', [id]);
    if (!rows[0])
        throw new NotFoundError(`Site ${id} not found`);
    return rows[0];
}
export async function listSites() {
    const { rows } = await pool.query('SELECT * FROM sites ORDER BY name');
    return rows;
}
export async function createSite(raw) {
    const obj = (raw ?? {});
    const input = baseSchema.parse(obj);
    const overrides = extractOverrides(obj, input.tags.length ? { '+tags': input.tags } : {});
    const resolved = resolveForSite(input.profile, overrides, await loadProfileMap());
    try {
        const { rows } = await pool.query(`INSERT INTO sites (name, url, region, profile_id, timezone, tags, overrides, resolved_config, alert_policy_id, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10) RETURNING *`, [
            input.name, normalizeUrl(input.url), input.region, input.profile, input.timezone, resolved.tags,
            JSON.stringify(overrides), JSON.stringify(resolved), await policyId(input.alert_policy), input.is_active,
        ]);
        const site = rows[0];
        await syncSiteSchedule(site);
        return site;
    }
    catch (err) {
        if (err.code === '23505') {
            throw new ConflictError(`A site with url ${normalizeUrl(input.url)} and region ${input.region} already exists`);
        }
        throw err;
    }
}
/** PATCH: scalar fields replace; any override key replaces the whole override layer. */
export async function updateSite(id, raw) {
    const obj = (raw ?? {});
    const patch = patchSchema.parse(obj);
    const current = await getSite(id);
    let overrides = current.overrides;
    if (hasOverrideKeys(obj)) {
        const keepTags = current.overrides['+tags'] ? { '+tags': current.overrides['+tags'] } : {};
        overrides = extractOverrides(obj, keepTags);
    }
    if (patch.tags)
        overrides = { ...overrides, '+tags': patch.tags };
    const profile = patch.profile ?? current.profile_id;
    const resolved = resolveForSite(profile, overrides, await loadProfileMap());
    const alertPolicyId = patch.alert_policy !== undefined ? await policyId(patch.alert_policy) : current.alert_policy_id;
    try {
        const { rows } = await pool.query(`UPDATE sites SET name=$2, url=$3, region=$4, profile_id=$5, timezone=$6, tags=$7, overrides=$8::jsonb,
         resolved_config=$9::jsonb, alert_policy_id=$10, is_active=$11, updated_at=now()
       WHERE id=$1 RETURNING *`, [
            id, patch.name ?? current.name, patch.url ? normalizeUrl(patch.url) : current.url,
            patch.region ?? current.region, profile, patch.timezone ?? current.timezone, resolved.tags,
            JSON.stringify(overrides), JSON.stringify(resolved), alertPolicyId, patch.is_active ?? current.is_active,
        ]);
        const site = rows[0];
        await syncSiteSchedule(site);
        return site;
    }
    catch (err) {
        if (err.code === '23505')
            throw new ConflictError('Another site already has that url + region');
        throw err;
    }
}
export async function deleteSite(id) {
    const { rowCount } = await pool.query('DELETE FROM sites WHERE id = $1', [id]);
    if (!rowCount)
        throw new NotFoundError(`Site ${id} not found`);
    await removeSiteSchedule(id);
}
/** Accepts one site, a list, or { sites: [...] }, as YAML or JSON. */
export async function importSites(text, upsert) {
    const doc = YAML.parse(text);
    const items = Array.isArray(doc)
        ? doc
        : doc && typeof doc === 'object' && Array.isArray(doc.sites)
            ? doc.sites
            : [doc];
    const out = [];
    for (const [index, item] of items.entries()) {
        const name = item?.name;
        try {
            const site = await createSite(item);
            out.push({ index, name, status: 'created', id: site.id });
        }
        catch (err) {
            if (err instanceof ConflictError && upsert) {
                const i = item;
                const { rows } = await pool.query('SELECT id FROM sites WHERE url = $1 AND region = $2', [normalizeUrl(i.url), i.region ?? 'global']);
                const site = await updateSite(rows[0].id, item);
                out.push({ index, name, status: 'updated', id: site.id });
            }
            else {
                out.push({ index, name, status: 'error', error: errorText(err) });
            }
        }
    }
    return out;
}
/** Re-resolve every site against current profiles (run after profiles change). */
export async function reresolveAllSites() {
    const profiles = await loadProfileMap();
    const { rows } = await pool.query('SELECT id, profile_id, overrides FROM sites');
    for (const r of rows) {
        const resolved = resolveForSite(r.profile_id, r.overrides, profiles);
        await pool.query('UPDATE sites SET resolved_config = $2::jsonb, tags = $3, updated_at = now() WHERE id = $1', [
            r.id, JSON.stringify(resolved), resolved.tags,
        ]);
    }
    return rows.length;
}
export function errorText(err) {
    if (err instanceof z.ZodError)
        return err.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    return err instanceof Error ? err.message : String(err);
}
//# sourceMappingURL=service.js.map