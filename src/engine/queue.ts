import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';

export const QUEUE_NAME = 'tier1';

export interface CycleJob {
  siteId: number;
  trigger: 'schedule' | 'manual';
}

export interface ConfirmJob {
  siteId: number;
  checkType: string;
  attempt: number;
  runId: string;
}

export const redisConnection = (): Redis => new Redis(config.redisUrl, {
  maxRetriesPerRequest: 1,
  connectTimeout: 800,
  retryStrategy: () => null,
  enableOfflineQueue: false,
});

let queue: Queue | undefined;

export function getQueue(): Queue {
  queue ??= new Queue(QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return queue;
}

/** Returns true once actually enqueued. Never throws — callers must run the cycle directly on false. */
export async function enqueueCycle(siteId: number, trigger: CycleJob['trigger']): Promise<boolean> {
  if (process.env.VERCEL) return false;
  try {
    await Promise.race([
      getQueue().add('cycle', { siteId, trigger } satisfies CycleJob),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 1000)),
    ]);
    return true;
  } catch {
    return false; // Redis unavailable
  }
}

export async function enqueueConfirm(job: ConfirmJob, delayMs: number): Promise<void> {
  if (process.env.VERCEL) return;
  try {
    const jobId = `confirm-${job.siteId}-${job.checkType}-${job.runId}-${job.attempt}`;
    await Promise.race([
      getQueue().add('confirm', job, { delay: delayMs, jobId }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 1000)),
    ]);
  } catch {
    // Redis unavailable, ignored
  }
}
