import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';
export const QUEUE_NAME = 'tier1';
export const redisConnection = () => new Redis(config.redisUrl, { maxRetriesPerRequest: null });
let queue;
export function getQueue() {
    queue ??= new Queue(QUEUE_NAME, {
        connection: redisConnection(),
        defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
    });
    return queue;
}
export async function enqueueCycle(siteId, trigger) {
    await getQueue().add('cycle', { siteId, trigger });
}
export async function enqueueConfirm(job, delayMs) {
    // Deterministic id: a duplicate confirm for the same run + attempt is ignored.
    const jobId = `confirm-${job.siteId}-${job.checkType}-${job.runId}-${job.attempt}`;
    await getQueue().add('confirm', job, { delay: delayMs, jobId });
}
//# sourceMappingURL=queue.js.map