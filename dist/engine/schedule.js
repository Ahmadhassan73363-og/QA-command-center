import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { asNumber } from '../checks/util.js';
import { getQueue } from './queue.js';
const keyFor = (siteId) => `site-${siteId}`;
export async function syncSiteSchedule(site) {
    try {
        const queue = getQueue();
        if (!site.is_active) {
            await queue.removeJobScheduler(keyFor(site.id));
            return;
        }
        const every = asNumber(site.resolved_config.schedule?.tier1_every_ms, config.tier1EveryMs);
        await queue.upsertJobScheduler(keyFor(site.id), { every }, { name: 'cycle', data: { siteId: site.id, trigger: 'schedule' } });
    }
    catch (err) {
        console.warn(`[schedule] Redis queue scheduler unavailable (serverless mode): ${err.message}`);
    }
}
export async function removeSiteSchedule(siteId) {
    try {
        await getQueue().removeJobScheduler(keyFor(siteId));
    }
    catch (err) {
        console.warn(`[schedule] Redis queue scheduler unavailable: ${err.message}`);
    }
}
/** Reconcile BullMQ schedulers with the sites table. Safe to run repeatedly. */
export async function syncAllSchedules() {
    try {
        const queue = getQueue();
        const { rows } = await pool.query('SELECT id, is_active, resolved_config FROM sites WHERE is_active');
        const wanted = new Set(rows.map((r) => keyFor(r.id)));
        const existing = (await queue.getJobSchedulers(0, -1));
        for (const s of existing) {
            const key = s.key ?? s.id;
            if (key?.startsWith('site-') && !wanted.has(key))
                await queue.removeJobScheduler(key);
        }
        for (const site of rows)
            await syncSiteSchedule(site);
        return rows.length;
    }
    catch (err) {
        console.warn(`[schedule] Sync all schedules skipped (Redis unavailable): ${err.message}`);
        return 0;
    }
}
//# sourceMappingURL=schedule.js.map