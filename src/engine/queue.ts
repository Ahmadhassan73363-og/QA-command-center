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

export const redisConnection = (): Redis => new Redis(config.redisUrl, { maxRetriesPerRequest: null });

let queue: Queue | undefined;

export function getQueue(): Queue {
  queue ??= new Queue(QUEUE_NAME, {
    connection: redisConnection(),
    defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
  });
  return queue;
}

export async function enqueueCycle(siteId: number, trigger: CycleJob['trigger']): Promise<void> {
  await getQueue().add('cycle', { siteId, trigger } satisfies CycleJob);
}

export async function enqueueConfirm(job: ConfirmJob, delayMs: number): Promise<void> {
  // Deterministic id: a duplicate confirm for the same run + attempt is ignored.
  const jobId = `confirm-${job.siteId}-${job.checkType}-${job.runId}-${job.attempt}`;
  await getQueue().add('confirm', job, { delay: delayMs, jobId });
}
