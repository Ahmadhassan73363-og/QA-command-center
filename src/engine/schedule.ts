import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { asNumber } from '../checks/util.js';
import type { ResolvedConfig } from '../profiles/resolve.js';
import { getQueue } from './queue.js';

interface SchedulableSite {
  id: number;
  is_active: boolean;
  resolved_config: ResolvedConfig;
}

const keyFor = (siteId: number) => `site-${siteId}`;

/**
 * BullMQ operations can hang rather than reject when Redis is unreachable (waitUntilReady()
 * doesn't respect the connection's own connectTimeout) — unlike enqueueCycle/enqueueConfirm in
 * queue.ts, nothing here previously guarded against that, so a site create/update/delete could
 * hang indefinitely instead of falling back. Same 1s timeout convention as queue.ts.
 */
function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 1_000)),
  ]);
}

export async function syncSiteSchedule(site: SchedulableSite): Promise<void> {
  try {
    const queue = getQueue();
    if (!site.is_active) {
      await withTimeout(queue.removeJobScheduler(keyFor(site.id)));
      return;
    }
    const every = asNumber(site.resolved_config.schedule?.tier1_every_ms, config.tier1EveryMs);
    await withTimeout(queue.upsertJobScheduler(
      keyFor(site.id),
      { every },
      { name: 'cycle', data: { siteId: site.id, trigger: 'schedule' } },
    ));
  } catch (err) {
    console.warn(`[schedule] Redis queue scheduler unavailable (serverless mode): ${(err as Error).message}`);
  }
}

export async function removeSiteSchedule(siteId: number): Promise<void> {
  try {
    await withTimeout(getQueue().removeJobScheduler(keyFor(siteId)));
  } catch (err) {
    console.warn(`[schedule] Redis queue scheduler unavailable: ${(err as Error).message}`);
  }
}

/** Reconcile BullMQ schedulers with the sites table. Safe to run repeatedly. */
export async function syncAllSchedules(): Promise<number> {
  try {
    const queue = getQueue();
    const { rows } = await pool.query<SchedulableSite>(
      'SELECT id, is_active, resolved_config FROM sites WHERE is_active',
    );
    const wanted = new Set(rows.map((r) => keyFor(r.id)));
    const existing = (await withTimeout(queue.getJobSchedulers(0, -1))) as Array<{ key?: string; id?: string }>;
    for (const s of existing) {
      const key = s.key ?? s.id;
      if (key?.startsWith('site-') && !wanted.has(key)) await withTimeout(queue.removeJobScheduler(key));
    }
    for (const site of rows) await syncSiteSchedule(site);
    return rows.length;
  } catch (err) {
    console.warn(`[schedule] Sync all schedules skipped (Redis unavailable): ${(err as Error).message}`);
    return 0;
  }
}
