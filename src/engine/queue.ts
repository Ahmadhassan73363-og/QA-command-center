import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from '../config.js';

export const QUEUE_NAME = 'tier1';

/**
 * Some BullMQ/ioredis internals (e.g. waitUntilReady(), used by upsertJobScheduler/
 * removeJobScheduler) reject via paths that bypass both the raw connection's and the Queue's
 * 'error' listeners below — and bypass every try/catch around code that calls into them, since
 * the rejection isn't tied to whichever specific await is in flight. This codebase already
 * treats "Redis unavailable" as a fully expected, handled condition everywhere it's used (see
 * enqueueCycle, syncSiteSchedule, etc.), so don't let this one well-understood failure shape
 * crash a serverless invocation. Anything else still crashes normally, same as with no handler.
 */
function isRedisUnavailable(err: unknown): boolean {
  const e = err as { code?: string; errors?: Array<{ code?: string }> } | undefined;
  const codes = [e?.code, ...(e?.errors?.map((x) => x.code) ?? [])];
  return codes.some((c) => c === 'ECONNREFUSED' || c === 'ETIMEDOUT' || c === 'ENOTFOUND');
}
process.on('unhandledRejection', (err) => {
  if (isRedisUnavailable(err)) {
    console.warn(`[queue] suppressed unhandled redis-connection rejection: ${(err as Error)?.message || err}`);
    return;
  }
  console.error('Unhandled rejection:', err);
  process.exit(1);
});

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

export const redisConnection = (): Redis => {
  const conn = new Redis(config.redisUrl, {
    maxRetriesPerRequest: 1,
    connectTimeout: 800,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });
  // ioredis emits 'error' as a plain EventEmitter event, separate from any command's promise.
  // With zero listeners, Node treats it as an uncaught exception and crashes the process —
  // this happens regardless of try/catch around code that calls into the queue, since the
  // emission isn't tied to whichever specific await is in flight. Every caller here already
  // treats "Redis unavailable" as an expected, handled condition (see enqueueCycle/
  // syncSiteSchedule), so this listener just needs to exist, not do anything.
  conn.on('error', (err) => console.warn(`[queue] redis connection error: ${err.message}`));
  return conn;
};

let queue: Queue | undefined;

export function getQueue(): Queue {
  if (!queue) {
    queue = new Queue(QUEUE_NAME, {
      connection: redisConnection(),
      defaultJobOptions: { removeOnComplete: 1000, removeOnFail: 5000 },
    });
    // BullMQ opens its own additional (duplicated) Redis connections internally for blocking
    // ops/events — those don't inherit the listener on the connection above, but Queue itself
    // re-emits their errors as its own 'error' event. Same reasoning as redisConnection(): must
    // exist, doesn't need to do anything beyond not crash the process.
    queue.on('error', (err) => console.warn(`[queue] bullmq queue error: ${err.message}`));
  }
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
