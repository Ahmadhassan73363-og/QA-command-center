import { pool } from '../db/pool.js';
import type { CheckResult, SiteRecord } from '../checks/types.js';
import { eventFor, notify } from '../alerts/notify.js';

export function summarize(displayName: string, r: CheckResult): string {
  if (r.errorMessage) return `${displayName}: ${r.errorMessage}`;
  return `${displayName}: expected ${JSON.stringify(r.expected ?? {})}, got ${JSON.stringify(r.actual ?? {})}`;
}

/** Checks whose failure means the whole site is unreachable. */
export const ROOT_CAUSE_CHECKS = ['availability.dns', 'availability.http_status', 'api.health'];

/** True when a root-cause check's latest result for this site (last 5 min) is failing. */
async function rootCauseFailing(siteId: number): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM (
       SELECT DISTINCT ON (check_type) status FROM check_results
       WHERE site_id = $1 AND check_type = ANY($2) AND checked_at > now() - interval '5 minutes'
       ORDER BY check_type, checked_at DESC
     ) latest WHERE status IN ('fail', 'error') LIMIT 1`,
    [siteId, ROOT_CAUSE_CHECKS],
  );
  return rows.length > 0;
}

/**
 * Open (or keep open) the single incident for site + check. Alerts only when newly opened.
 * Secondary checks (robots, sitemap, headers...) that fail while the site itself is down open
 * silently, so one outage produces one alert, and their recoveries stay silent too.
 */
export async function openIncident(
  site: SiteRecord,
  checkType: string,
  summary: string,
  result: CheckResult,
  severity: 'warn' | 'critical',
): Promise<void> {
  const silent = !ROOT_CAUSE_CHECKS.includes(checkType) && (await rootCauseFailing(site.id));
  const { rows } = await pool.query<{ id: number; inserted: boolean }>(
    `INSERT INTO incidents (site_id, check_type, severity, status, error_code, summary, notified)
     VALUES ($1, $2, $3, 'open', $4, $5, $6)
     ON CONFLICT (site_id, check_type) WHERE status IN ('open', 'acked')
     DO UPDATE SET consecutive_passes = 0,
       severity = CASE WHEN EXCLUDED.severity = 'critical' THEN 'critical' ELSE incidents.severity END
     RETURNING id, (xmax = 0) AS inserted`,
    [site.id, checkType, severity, result.errorCode ?? null, silent ? `${summary} (site unreachable; alert suppressed)` : summary, !silent],
  );
  const row = rows[0];
  if (row?.inserted && !silent) {
    await notify(site, eventFor(site, {
      event: 'incident.opened',
      incidentId: row.id,
      checkType,
      severity,
      errorCode: result.errorCode,
      summary,
      expected: result.expected,
      actual: result.actual,
    }));
  }
}

/** A failed scheduled run interrupts any recovery streak immediately. */
export async function resetPasses(siteId: number, checkType: string): Promise<void> {
  await pool.query(
    `UPDATE incidents SET consecutive_passes = 0
     WHERE site_id = $1 AND check_type = $2 AND status IN ('open', 'acked')`,
    [siteId, checkType],
  );
}

/** Count a passing scheduled run; auto-resolve after `resolvePasses` in a row. */
export async function recordPass(site: SiteRecord, checkType: string): Promise<void> {
  const needed = site.resolved_config.retry.resolvePasses;
  const { rows } = await pool.query<{ id: number; severity: 'warn' | 'critical'; summary: string; resolved: boolean; notified: boolean }>(
    `UPDATE incidents
       SET consecutive_passes = consecutive_passes + 1,
           status = CASE WHEN consecutive_passes + 1 >= $3 THEN 'resolved' ELSE status END,
           resolved_at = CASE WHEN consecutive_passes + 1 >= $3 THEN now() ELSE resolved_at END
     WHERE site_id = $1 AND check_type = $2 AND status IN ('open', 'acked')
     RETURNING id, severity, summary, notified, (status = 'resolved') AS resolved`,
    [site.id, checkType, needed],
  );
  const row = rows[0];
  if (row?.resolved && row.notified) {
    await notify(site, eventFor(site, {
      event: 'incident.resolved',
      incidentId: row.id,
      checkType,
      severity: row.severity,
      summary: `Recovered after ${needed} passing runs. Was: ${row.summary}`,
    }));
  }
}
