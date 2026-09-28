import { timingSafeEqual } from 'node:crypto';
import Fastify, { type FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { listChecks } from '../checks/index.js';
import { enqueueCycle, getQueue } from '../engine/queue.js';
import { runCycle } from '../engine/runner.js';
import { renderStatusPage } from './statusPage.js';
import { captureScreenshot } from '../lib/screenshot.js';
import {
  createSite, deleteSite, errorText, getSite, importSites, listSites, updateSite, type SiteRow,
} from '../sites/service.js';

if (!config.adminToken && !process.env.VERCEL) {
  console.error('ADMIN_TOKEN is required');
}

export const app = Fastify({ logger: false });
const expectedAuth = Buffer.from(`Bearer ${config.adminToken}`);

function authorized(header: string | undefined): boolean {
  if (!config.adminToken) return true;
  const got = Buffer.from(header ?? '');
  return got.length === expectedAuth.length && timingSafeEqual(got, expectedAuth);
}

app.addContentTypeParser(
  ['text/yaml', 'application/yaml', 'application/x-yaml', 'text/plain'],
  { parseAs: 'string' },
  (_req, body, done) => done(null, body),
);

app.addHook('onRequest', async (req, reply) => {
  const path = req.url.split('?')[0];
  if (path === '/api/health' || path === '/api/config/info' || path === '/api/cron') return;
  if (path === '/' && config.statusPagePublic) return;
  if (config.statusPagePublic) return;

  const header = req.headers.authorization
    ?? (req.headers['x-admin-token'] ? `Bearer ${req.headers['x-admin-token']}` : undefined);
  if (!authorized(header)) {
    await reply.code(401).send({ error: 'unauthorized' });
  }
});

app.setErrorHandler((err, _req, reply) => {
  const status = err instanceof z.ZodError ? 400 : (err as { statusCode?: number }).statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  return reply.code(status).send({ error: status >= 500 ? 'internal error' : errorText(err) });
});

const idParam = z.object({ id: z.coerce.number().int().positive() });
const notFound = (reply: FastifyReply, what: string) => reply.code(404).send({ error: `${what} not found` });

// ---- Status page & Config ----------------------------------------------------
app.get('/', async (_req, reply) => reply.type('text/html; charset=utf-8').send(await renderStatusPage()));

app.get('/api/config/info', async () => ({
  statusPagePublic: config.statusPagePublic,
  adminToken: config.statusPagePublic ? config.adminToken : undefined,
  probeRegion: config.probeRegion,
  workerConcurrency: config.workerConcurrency,
  dbHost: config.databaseUrl.includes('neon.tech') ? 'Neon Cloud PostgreSQL' : 'Local PostgreSQL',
}));

// ---- Health ------------------------------------------------------------------
app.get('/api/health', async (_req, reply) => {
  try {
    await pool.query('SELECT 1');
    return { ok: true, database: 'connected' };
  } catch (err) {
    return reply.code(503).send({ ok: false, error: (err as Error).message });
  }
});

// ---- Cron Endpoint for Vercel / Scheduled Jobs -------------------------------
app.all('/api/cron', async (_req, reply) => {
  const { rows: sites } = await pool.query<{ id: number }>('SELECT id FROM sites WHERE is_active = true');
  const results = [];
  for (const s of sites) {
    try {
      await runCycle(s.id, 'schedule');
      results.push({ id: s.id, status: 'ok' });
    } catch (err) {
      results.push({ id: s.id, status: 'error', error: (err as Error).message });
    }
  }
  return reply.send({ ok: true, count: sites.length, results });
});

// ---- Dashboard Aggregated Stats ----------------------------------------------
app.get('/api/dashboard/stats', async () => {
  const sites = (
    await pool.query(`
      SELECT s.id, s.name, s.url, s.region, s.profile_id, s.tags, s.is_active, s.created_at,
        COALESCE(
          json_agg(
            json_build_object(
              'check_type', r.check_type,
              'status', r.status,
              'response_code', r.response_code,
              'response_time_ms', r.response_time_ms,
              'error_code', r.error_code,
              'error_message', r.error_message,
              'actual_value', r.actual_value,
              'expected_value', r.expected_value,
              'metadata', r.metadata,
              'checked_at', r.checked_at
            ) ORDER BY r.check_type
          ) FILTER (WHERE r.check_type IS NOT NULL),
          '[]'
        ) AS checks,
        COALESCE(
          (
            SELECT json_agg(run_data)
            FROM (
              SELECT r.id, r.started_at,
                COUNT(c.id)::int AS total,
                COUNT(CASE WHEN c.status = 'pass' THEN 1 END)::int AS passed,
                COUNT(CASE WHEN c.status = 'warn' THEN 1 END)::int AS warned,
                COUNT(CASE WHEN c.status IN ('fail','error') THEN 1 END)::int AS failed,
                AVG(c.response_time_ms)::int AS latency_ms
              FROM runs r
              JOIN check_results c ON c.run_id = r.id
              WHERE c.site_id = s.id
              GROUP BY r.id, r.started_at
              ORDER BY r.started_at DESC
              LIMIT 15
            ) run_data
          ),
          '[]'
        ) AS recent_runs
      FROM sites s
      LEFT JOIN LATERAL (
        SELECT DISTINCT ON (check_type)
          check_type, status, response_code, response_time_ms, error_code,
          error_message, actual_value, expected_value, metadata, checked_at
        FROM check_results
        WHERE site_id = s.id AND checked_at > now() - interval '2 days'
        ORDER BY check_type, checked_at DESC
      ) r ON true
      GROUP BY s.id
      ORDER BY s.is_active DESC, s.name ASC
    `)
  ).rows;

  const incidents = (
    await pool.query(`
      SELECT i.id, i.site_id, s.name AS site_name, s.url AS site_url,
             i.check_type, i.severity, i.status, i.summary, i.opened_at, i.acked_at
      FROM incidents i
      JOIN sites s ON s.id = i.site_id
      WHERE i.status IN ('open', 'acked')
      ORDER BY i.opened_at DESC
      LIMIT 100
    `)
  ).rows;

  const profiles = (
    await pool.query('SELECT id, name, description, is_builtin FROM site_profiles ORDER BY id')
  ).rows;

  const totalSites = sites.length;
  const activeSites = sites.filter((s: { is_active: boolean }) => s.is_active).length;

  let totalChecks = 0;
  let passedChecks = 0;
  let warnChecks = 0;
  let failChecks = 0;
  let latencySum = 0;
  let latencyCount = 0;

  for (const s of sites) {
    for (const c of s.checks) {
      totalChecks++;
      if (c.status === 'pass') passedChecks++;
      else if (c.status === 'warn') warnChecks++;
      else if (c.status === 'fail' || c.status === 'error') failChecks++;
      if (c.response_time_ms != null && c.response_time_ms > 0) {
        latencySum += Number(c.response_time_ms);
        latencyCount++;
      }
    }
  }

  const avgLatencyMs = latencyCount > 0 ? Math.round(latencySum / latencyCount) : 0;
  const healthPercent = totalChecks > 0 ? Math.round(((passedChecks * 100) + (warnChecks * 50)) / totalChecks) : 100;

  return {
    overview: {
      totalSites,
      activeSites,
      healthPercent,
      avgLatencyMs,
      totalChecks24h: totalChecks,
      activeIncidents: incidents.length,
      criticalIncidents: incidents.filter((i: { severity: string }) => i.severity === 'critical').length,
      warningIncidents: incidents.filter((i: { severity: string }) => i.severity === 'warn').length,
    },
    sites,
    incidents,
    profiles,
  };
});

// ---- Site History Timeline Endpoint -----------------------------------------
app.get('/api/sites/:id/history', async (req) => {
  const { id } = idParam.parse(req.params);
  const { rows } = await pool.query(
    `SELECT 
        r.id AS run_id,
        r.trigger,
        r.started_at,
        r.finished_at,
        COUNT(c.id)::int AS total_checks,
        COUNT(CASE WHEN c.status = 'pass' THEN 1 END)::int AS passed_checks,
        COUNT(CASE WHEN c.status = 'warn' THEN 1 END)::int AS warn_checks,
        COUNT(CASE WHEN c.status IN ('fail', 'error') THEN 1 END)::int AS fail_checks,
        AVG(c.response_time_ms)::int AS avg_ms
     FROM runs r
     JOIN check_results c ON c.run_id = r.id
     WHERE c.site_id = $1
     GROUP BY r.id, r.trigger, r.started_at, r.finished_at
     ORDER BY r.started_at DESC
     LIMIT 50`,
    [id],
  );
  return rows;
});

// ---- Single Run Checks Endpoint ---------------------------------------------
app.get('/api/runs/:runId/checks', async (req) => {
  const { runId } = req.params as { runId: string };
  const { rows } = await pool.query(
    `SELECT id, check_type, status, attempt, error_code, response_code, response_time_ms,
            expected_value, actual_value, error_message, metadata, probe_region, checked_at
     FROM check_results WHERE run_id = $1 ORDER BY check_type ASC`,
    [runId],
  );
  return rows;
});

// ---- Instant Audit / Test URL Endpoint ---------------------------------------
app.post('/api/audit', async (req, reply) => {
  const schema = z.object({
    url: z.string().min(1),
    name: z.string().optional(),
    profile: z.string().default('generic'),
    region: z.string().default('global'),
    tags: z.array(z.string()).default([]),
  });
  const data = schema.parse(req.body ?? {});

  let rawUrl = data.url.trim();
  if (!/^https?:\/\//i.test(rawUrl)) {
    rawUrl = 'https://' + rawUrl;
  }
  const u = new URL(rawUrl);
  const normalizedUrl = `${u.protocol}//${u.host.toLowerCase()}${u.pathname === '/' ? '' : u.pathname.replace(/\/+$/, '')}`;
  const siteName = data.name?.trim() || u.hostname;

  // Find or create site
  const existing = (await pool.query<SiteRow>('SELECT * FROM sites WHERE url = $1 AND region = $2', [normalizedUrl, data.region])).rows[0];
  let site: SiteRow;
  if (existing) {
    site = existing;
    if (!site.is_active) {
      site = await updateSite(site.id, { is_active: true });
    }
  } else {
    site = await createSite({
      name: siteName,
      url: normalizedUrl,
      profile: data.profile || 'generic',
      region: data.region || 'global',
      tags: data.tags.length ? data.tags : ['audit'],
    });
  }

  // Run the QA audit cycle immediately
  await runCycle(site.id, 'manual');

  // Retrieve fresh check results
  const { rows: checks } = await pool.query(
    `SELECT DISTINCT ON (check_type)
        check_type, status, attempt, error_code, response_code, response_time_ms,
        expected_value, actual_value, error_message, metadata, probe_region, checked_at
     FROM check_results
     WHERE site_id = $1
     ORDER BY check_type, checked_at DESC`,
    [site.id],
  );

  const passed = checks.filter((c) => c.status === 'pass').length;
  const warned = checks.filter((c) => c.status === 'warn').length;
  const failed = checks.filter((c) => c.status === 'fail' || c.status === 'error').length;
  const total = checks.length;
  const score = total ? Math.round(((passed * 100) + (warned * 50)) / total) : 100;
  const avgResponseMs = checks.find((c) => c.check_type === 'performance.response_time')?.response_time_ms ?? null;
  const status = failed > 0 ? 'crit' : warned > 0 ? 'warn' : 'ok';

  return reply.code(200).send({
    site,
    checks,
    summary: {
      passed,
      warned,
      failed,
      total,
      score,
      status,
      avgResponseMs,
    },
  });
});

// ---- Profiles & checks ---------------------------------------------------------
app.get('/api/profiles', async () =>
  (await pool.query('SELECT id, name, description, extends, adapter, is_builtin, config FROM site_profiles ORDER BY id')).rows);

app.get('/api/profiles/:id', async (req, reply) => {
  const { id } = req.params as { id: string };
  const { rows } = await pool.query('SELECT * FROM site_profiles WHERE id = $1', [id]);
  return rows[0] ?? notFound(reply, 'profile');
});

app.get('/api/checks', async () =>
  listChecks().map(({ type, displayName, category, cost, timeoutMs }) => ({ type, displayName, category, cost, timeoutMs })));

// ---- Sites -------------------------------------------------------------------
app.get('/api/sites', async () => listSites());
app.post('/api/sites', async (req, reply) => reply.code(201).send(await createSite(req.body)));
app.get('/api/sites/:id', async (req) => getSite(idParam.parse(req.params).id));
app.patch('/api/sites/:id', async (req) => updateSite(idParam.parse(req.params).id, req.body));
app.delete('/api/sites/:id', async (req, reply) => {
  await deleteSite(idParam.parse(req.params).id);
  return reply.code(204).send();
});

app.post('/api/sites/:id/run', async (req, reply) => {
  const id = idParam.parse(req.params).id;
  const site = await getSite(id);
  await runCycle(site.id, 'manual');

  const { rows: checks } = await pool.query(
    `SELECT DISTINCT ON (check_type)
        check_type, status, attempt, error_code, response_code, response_time_ms,
        expected_value, actual_value, error_message, metadata, probe_region, checked_at
     FROM check_results
     WHERE site_id = $1
     ORDER BY check_type, checked_at DESC`,
    [site.id],
  );
  return reply.send({ ok: true, siteId: id, checks });
});

app.post('/api/sites/:id/toggle', async (req) => {
  const { id } = idParam.parse(req.params);
  const site = await getSite(id);
  return updateSite(id, { is_active: !site.is_active });
});

app.post('/api/sites/import', async (req) => {
  const upsert = (req.query as { upsert?: string }).upsert === 'true';
  const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  return { results: await importSites(text, upsert) };
});

app.get('/api/sites/:id/checks', async (req) => {
  const { id } = idParam.parse(req.params);
  const q = z.object({ type: z.string().optional(), limit: z.coerce.number().int().min(1).max(1000).default(100) })
    .parse(req.query);
  const { rows } = await pool.query(
    `SELECT id, run_id, check_type, status, attempt, error_code, response_code, response_time_ms, expected_value,
            actual_value, error_message, metadata, probe_region, checked_at
     FROM check_results WHERE site_id = $1 AND ($2::text IS NULL OR check_type = $2)
     ORDER BY checked_at DESC LIMIT $3`,
    [id, q.type ?? null, q.limit],
  );
  return rows;
});

// ---- Site Screenshot (real headless-browser capture, not an embedded iframe) -----
// Navigating directly bypasses X-Frame-Options/CSP entirely; a small in-memory cache
// keeps repeated dashboard polls from re-launching Chromium every few seconds.
const SCREENSHOT_TTL_MS = 5 * 60_000;
const screenshotCache = new Map<number, { at: number; buf: Buffer }>();

app.get('/api/sites/:id/screenshot', async (req, reply) => {
  const { id } = idParam.parse(req.params);
  const { refresh } = z.object({ refresh: z.coerce.boolean().default(false) }).parse(req.query);

  const cached = screenshotCache.get(id);
  if (!refresh && cached && Date.now() - cached.at < SCREENSHOT_TTL_MS) {
    return reply.type('image/png').header('cache-control', 'public, max-age=300').send(cached.buf);
  }

  const site = await getSite(id);
  try {
    const buf = await captureScreenshot(site.url);
    screenshotCache.set(id, { at: Date.now(), buf });
    return reply.type('image/png').header('cache-control', 'public, max-age=300').send(buf);
  } catch (err) {
    app.log.error(err);
    return reply.code(502).send({ error: `screenshot capture failed: ${errorText(err)}` });
  }
});

// ---- Incidents -----------------------------------------------------------------
app.get('/api/incidents', async (req) => {
  const { status } = z.object({ status: z.enum(['open', 'acked', 'resolved', 'suppressed', 'active']).default('active') })
    .parse(req.query);
  const statuses = status === 'active' ? ['open', 'acked'] : [status];
  const { rows } = await pool.query(
    `SELECT i.*, s.name AS site_name, s.url AS site_url FROM incidents i JOIN sites s ON s.id = i.site_id
     WHERE i.status = ANY($1) ORDER BY i.opened_at DESC LIMIT 500`,
    [statuses],
  );
  return rows;
});

const transition = (sql: string) => async (req: { params: unknown }, reply: FastifyReply) => {
  const { rows } = await pool.query(sql, [idParam.parse(req.params).id]);
  return rows[0] ?? reply.code(409).send({ error: 'incident not found or not in a state that allows this' });
};
app.post('/api/incidents/:id/ack', transition(
  `UPDATE incidents SET status = 'acked', acked_at = now() WHERE id = $1 AND status = 'open' RETURNING *`));
app.post('/api/incidents/:id/resolve', transition(
  `UPDATE incidents SET status = 'resolved', resolved_at = now() WHERE id = $1 AND status IN ('open','acked') RETURNING *`));

// ---- Manual runs ---------------------------------------------------------------
app.post('/api/runs', async (req, reply) => {
  const { siteIds } = z.object({ siteIds: z.array(z.number().int().positive()).optional() }).parse(req.body ?? {});
  const ids = siteIds ?? (await pool.query<{ id: number }>('SELECT id FROM sites WHERE is_active')).rows.map((r) => r.id);
  for (const id of ids) {
    try {
      await enqueueCycle(id, 'manual');
    } catch {
      await runCycle(id, 'manual');
    }
  }
  return reply.code(202).send({ queued: ids.length });
});

app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not found' }));

// Start listening if not running in serverless / Vercel
if (!process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && !process.env.VERCEL_ENV && !process.env.NOW_REGION) {
  await app.listen({ port: config.port, host: '0.0.0.0' });
}
