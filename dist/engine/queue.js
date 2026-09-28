import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';
export const QUEUE_NAME = 'tier1';
export const redisConnection = () => new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 800,
    retryStrategy: () => null,
    enableOfflineQueue: false,
});
let queue;
export function getQueue() {
    queue ??= new Queue(QUEUE_NAME, {
        connection: redisConnection(),
        defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
    });
    return queue;
}
export async function enqueueCycle(siteId, trigger) {
    if (process.env.VERCEL)
        return;
    try {
        await Promise.race([
            getQueue().add('cycle', { siteId, trigger }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 1000)),
        ]);
    }
    catch {
        // Redis unavailable, ignored
    }
}
export async function enqueueConfirm(job, delayMs) {
    if (process.env.VERCEL)
        return;
    try {
        const jobId = `confirm-${job.siteId}-${job.checkType}-${job.runId}-${job.attempt}`;
        await Promise.race([
            getQueue().add('confirm', job, { delay: delayMs, jobId }),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 1000)),
        ]);
    }
    catch {
        // Redis unavailable, ignored
    }
}
//# sourceMappingURL=queue.js.map