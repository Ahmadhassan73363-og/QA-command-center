import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { getCheck } from '../checks/index.js';
import { classifyError, SiteHttp } from '../lib/http.js';
import { enqueueConfirm } from './queue.js';
import { openIncident, recordPass, resetPasses, summarize } from './incidents.js';
export async function loadSite(id) {
    const { rows } = await pool.query(`SELECT id, name, url, region, profile_id, alert_policy_id, head_unsupported, is_active, tags, resolved_config
     FROM sites WHERE id = $1`, [id]);
    return rows[0] ?? null;
}
/** Run one check with a hard timeout. Never throws. */
export async function executeCheck(def, ctx) {
    let timer;
    try {
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(() => reject(Object.assign(new Error(`Check exceeded ${def.timeoutMs} ms`), { name: 'TimeoutError' })), def.timeoutMs);
        });
        return await Promise.race([def.execute(ctx), timeout]);
    }
    catch (err) {
        const code = classifyError(err);
        return {
            status: code ? 'fail' : 'error',
            errorCode: code ?? 'worker_error',
            errorMessage: err instanceof Error ? err.message : String(err),
        };
    }
    finally {
        clearTimeout(timer);
    }
}
async function saveResult(siteId, checkType, runId, attempt, r, statusOverride) {
    const json = (v) => (v === undefined ? null : JSON.stringify(v));
    await pool.query(`INSERT INTO check_results (site_id, run_id, check_type, status, attempt, error_code, response_code,
       response_time_ms, expected_value, actual_value, error_message, metadata, worker_id, probe_region)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12::jsonb,$13,$14)`, [
        siteId, runId, checkType, statusOverride ?? r.status, attempt, r.errorCode ?? null, r.responseCode ?? null,
        r.responseTimeMs ?? null, json(r.expected), json(r.actual), r.errorMessage ?? null, json(r.metadata),
        config.workerId, config.probeRegion,
    ]);
}
const severityOf = (r) => (r.status === 'warn' ? 'warn' : 'critical');
/** A scheduled cycle: every enabled check for one site, then fast-confirm any failures. */
export async function runCycle(siteId, trigger) {
    const site = await loadSite(siteId);
    if (!site?.is_active)
        return;
    const runId = randomUUID();
    await pool.query('INSERT INTO runs (id, trigger, tier) VALUES ($1, $2, 1)', [runId, trigger]);
    const cfg = site.resolved_config;
    const http = new SiteHttp(site.url, site.head_unsupported);
    await Promise.all(Object.entries(cfg.checks).map(async ([type, checkConfig]) => {
        const def = getCheck(type);
        if (!def) {
            console.error(`[runner] site ${site.id}: unknown check "${type}" in resolved config`);
            return;
        }
        const result = await executeCheck(def, { site, config: cfg, checkConfig, http });
        await saveResult(site.id, type, runId, 1, result);
        if (result.status === 'pass')
            return recordPass(site, type);
        if (result.errorCode === 'worker_error') {
            console.error(`[runner] worker_error site=${site.id} check=${type}: ${result.errorMessage}`);
            return;
        }
        if (result.errorCode === 'blocked_by_bot_protection')
            return; // amber, never downtime
        await resetPasses(site.id, type);
        try {
            await enqueueConfirm({ siteId: site.id, checkType: type, attempt: 2, runId }, cfg.retry.delaysMs[0] ?? 15_000);
        }
        catch (err) {
            console.warn(`[runner] confirm queue unavailable, skipping retry: ${err.message}`);
        }
    }));
    if (http.headFallbackUsed && !site.head_unsupported) {
        await pool.query('UPDATE sites SET head_unsupported = true WHERE id = $1', [site.id]);
    }
    await pool.query('UPDATE runs SET finished_at = now() WHERE id = $1', [runId]);
}
/** A fast-confirm retry. Any pass → "flaky"; failing every attempt → incident. */
export async function runConfirm(job) {
    const site = await loadSite(job.siteId);
    const def = getCheck(job.checkType);
    const checkConfig = site?.resolved_config.checks[job.checkType];
    if (!site?.is_active || !def || !checkConfig)
        return;
    const cfg = site.resolved_config;
    const http = new SiteHttp(site.url, site.head_unsupported);
    const result = await executeCheck(def, { site, config: cfg, checkConfig, http });
    if (result.status === 'pass') {
        await saveResult(site.id, job.checkType, job.runId, job.attempt, result, 'flaky');
        await checkFlaky(site, def.displayName, job.checkType, result);
        return;
    }
    await saveResult(site.id, job.checkType, job.runId, job.attempt, result);
    if (result.errorCode === 'blocked_by_bot_protection' || result.errorCode === 'worker_error')
        return;
    const delays = cfg.retry.delaysMs;
    if (job.attempt <= delays.length) {
        await enqueueConfirm({ ...job, attempt: job.attempt + 1 }, delays[job.attempt - 1] ?? 45_000);
        return;
    }
    await openIncident(site, job.checkType, summarize(def.displayName, result), result, severityOf(result));
}
async function checkFlaky(site, displayName, checkType, result) {
    const { rows } = await pool.query(`SELECT count(*)::int AS n FROM check_results
     WHERE site_id = $1 AND check_type = $2 AND status = 'flaky' AND checked_at > now() - interval '24 hours'`, [site.id, checkType]);
    const n = rows[0]?.n ?? 0;
    if (n >= site.resolved_config.retry.flakyThreshold) {
        await openIncident(site, checkType, `${displayName}: failed intermittently ${n} times in 24 h`, result, 'warn');
    }
}
//# sourceMappingURL=runner.js.map