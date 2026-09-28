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

export async function syncSiteSchedule(site: SchedulableSite): Promise<void> {
  try {
    const queue = getQueue();
    if (!site.is_active) {
      await queue.removeJobScheduler(keyFor(site.id));
      return;
    }
    const every = asNumber(site.resolved_config.schedule?.tier1_every_ms, config.tier1EveryMs);
    await queue.upsertJobScheduler(
      keyFor(site.id),
      { every },
      { name: 'cycle', data: { siteId: site.id, trigger: 'schedule' } },
    );
  } catch (err) {
    console.warn(`[schedule] Redis queue scheduler unavailable (serverless mode): ${(err as Error).message}`);
  }
}

export async function removeSiteSchedule(siteId: number): Promise<void> {
  try {
    await getQueue().removeJobScheduler(keyFor(siteId));
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
    const existing = (await queue.getJobSchedulers(0, -1)) as Array<{ key?: string; id?: string }>;
    for (const s of existing) {
      const key = s.key ?? s.id;
      if (key?.startsWith('site-') && !wanted.has(key)) await queue.removeJobScheduler(key);
    }
    for (const site of rows) await syncSiteSchedule(site);
    return rows.length;
  } catch (err) {
    console.warn(`[schedule] Sync all schedules skipped (Redis unavailable): ${(err as Error).message}`);
    return 0;
  }
}
