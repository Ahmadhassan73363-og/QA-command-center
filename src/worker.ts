import { Worker } from 'bullmq';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { ensurePartitions, rotateOldData } from './db/partitions.js';
import { QUEUE_NAME, redisConnection, type ConfirmJob, type CycleJob } from './engine/queue.js';
import { runConfirm, runCycle } from './engine/runner.js';
import { syncAllSchedules } from './engine/schedule.js';

await ensurePartitions();
await rotateOldData();
console.log(`[worker] ${config.workerId} scheduled ${await syncAllSchedules()} sites`);

const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    if (job.name === 'cycle') {
      const data = job.data as CycleJob;
      return runCycle(data.siteId, data.trigger ?? 'schedule');
    }
    if (job.name === 'confirm') return runConfirm(job.data as ConfirmJob);
    throw new Error(`Unknown job "${job.name}"`);
  },
  { connection: redisConnection(), concurrency: config.workerConcurrency },
);

worker.on('failed', (job, err) => console.error(`[worker] job ${job?.name} ${job?.id} failed:`, err.message));

// Reconcile schedules (catches sites changed while the API couldn't reach Redis) and keep partitions ahead.
const timers = [
  setInterval(() => syncAllSchedules().catch((e) => console.error('[worker] schedule sync', e)), 5 * 60_000),
  setInterval(() => ensurePartitions().catch((e) => console.error('[worker] partitions', e)), 24 * 3_600_000),
  setInterval(() => rotateOldData().catch((e) => console.error('[worker] rotation', e)), 24 * 3_600_000),
];

async function shutdown(): Promise<void> {
  timers.forEach(clearInterval);
  await worker.close();
  await pool.end();
  process.exit(0);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
