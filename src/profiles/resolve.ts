/**
 * Profile inheritance and merge semantics (Revised Spec v2, "Profile inheritance").
 *
 * Layers, each deep-merged over the last:
 *   global defaults -> profile chain (root first) -> site overrides
 *
 * - Objects deep-merge key by key; the later layer wins.
 * - Arrays replace. A key prefixed with "+" appends instead ("+tags": [critical]).
 * - null removes an inherited key.
 * - Top-level `disable: [check.id, ...]` turns inherited checks off. A later layer can
 *   switch one back on by setting it in `checks` again.
 * - In `checks`, `true` means "run with no extra config", `false` means "off".
 */

export type Layer = Record<string, unknown>;

export interface RetryPolicy {
  delaysMs: number[];
  resolvePasses: number;
  flakyThreshold: number;
}

export interface ResolvedConfig {
  checks: Record<string, Record<string, unknown>>;
  expected: Record<string, unknown>;
  thresholds: Record<string, number>;
  tags: string[];
  retry: RetryPolicy;
  schedule?: { tier1_every_ms?: number };
  [key: string]: unknown;
}

export interface ProfileRow {
  id: string;
  extends: string | null;
  config: Layer;
}

export class ConfigError extends Error {
  readonly statusCode = 400;
}

export const GLOBAL_DEFAULTS: Layer = {
  checks: {},
  expected: { http_status: 200, redirect_chain_max_hops: 3 },
  thresholds: { response_ms_warn: 800, response_ms_crit: 2000, ssl_days_warn: 14, ssl_days_crit: 7 },
  tags: [],
  retry: { delaysMs: [15_000, 45_000], resolvePasses: 2, flakyThreshold: 3 },
};

const MAX_DEPTH = 5;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

export function mergeLayer(base: Layer, layer: Layer, topLevel = false): Layer {
  const out: Layer = structuredClone(base);
  for (const [rawKey, value] of Object.entries(layer)) {
    if (topLevel && rawKey === 'disable') continue;
    if (rawKey.startsWith('+')) {
      const key = rawKey.slice(1);
      if (!Array.isArray(value)) throw new ConfigError(`"${rawKey}" must be a list`);
      const existing = out[key];
      out[key] = [...(Array.isArray(existing) ? existing : []), ...structuredClone(value)];
      continue;
    }
    if (value === null) {
      delete out[rawKey];
      continue;
    }
    const current = out[rawKey];
    out[rawKey] =
      isPlainObject(value) && isPlainObject(current)
        ? mergeLayer(current, value)
        : structuredClone(value);
  }
  return out;
}

export function resolveConfig(layers: Layer[]): ResolvedConfig {
  let acc: Layer = {};
  for (const layer of layers) {
    acc = mergeLayer(acc, layer, true);
    const disable = layer.disable;
    if (disable !== undefined) {
      if (!Array.isArray(disable) || !disable.every((d) => typeof d === 'string')) {
        throw new ConfigError('"disable" must be a list of check ids');
      }
      const checks = isPlainObject(acc.checks) ? acc.checks : {};
      for (const id of disable) checks[id] = false;
      acc.checks = checks;
    }
  }

  const checks: Record<string, Record<string, unknown>> = {};
  for (const [id, value] of Object.entries(isPlainObject(acc.checks) ? acc.checks : {})) {
    if (value === false) continue;
    if (value === true) checks[id] = {};
    else if (isPlainObject(value)) checks[id] = value;
    else throw new ConfigError(`Check "${id}" must be true, false or an object`);
  }

  const tags = Array.isArray(acc.tags) ? [...new Set(acc.tags.map(String))] : [];
  return { ...acc, checks, tags } as ResolvedConfig;
}

/** Walk `extends` from `id` to the root. Returns configs root-first. */
export function profileChain(id: string, get: (id: string) => ProfileRow | undefined): Layer[] {
  const chain: Layer[] = [];
  const seen: string[] = [];
  let current: string | null = id;
  while (current) {
    if (seen.includes(current)) {
      throw new ConfigError(`Profile inheritance cycle: ${[...seen, current].join(' -> ')}`);
    }
    seen.push(current);
    if (seen.length > MAX_DEPTH) throw new ConfigError(`Profile chain deeper than ${MAX_DEPTH} at "${id}"`);
    const profile = get(current);
    if (!profile) throw new ConfigError(`Unknown profile "${current}"`);
    chain.unshift(profile.config);
    current = profile.extends;
  }
  return chain;
}

export function unknownChecks(resolved: ResolvedConfig, known: Set<string>): string[] {
  return Object.keys(resolved.checks).filter((id) => !known.has(id));
}
