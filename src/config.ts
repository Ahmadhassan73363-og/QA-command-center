import os from 'node:os';

try {
  // Built-in .env loader in Node 20+
  if (typeof process.loadEnvFile === 'function') {
    process.loadEnvFile();
  }
} catch {
  // Ignore if .env doesn't exist (e.g. in container with env passed directly)
}

const env = (key: string, fallback: string): string => process.env[key] ?? fallback;

export const config = {
  databaseUrl: env('DATABASE_URL', 'postgres://qa:qa@localhost:5432/qa'),
  redisUrl: env('REDIS_URL', 'redis://localhost:6379'),
  port: Number(env('PORT', '3000')),
  adminToken: env('ADMIN_TOKEN', ''),
  statusPagePublic: env('STATUS_PAGE_PUBLIC', 'false') === 'true',
  userAgent: env('MONITOR_USER_AGENT', 'QACommandCenter/2.0 (+https://example.com/monitor)'),
  monitorToken: env('MONITOR_TOKEN', ''),
  workerConcurrency: Number(env('WORKER_CONCURRENCY', '50')),
  workerId: env('WORKER_ID', os.hostname()),
  probeRegion: env('PROBE_REGION', 'local'),
  tier1EveryMs: Number(env('TIER1_EVERY_MS', String(10 * 60 * 1000))),
  // Local/dev only: path to a real Chrome/Chromium/Edge binary for screenshot capture.
  // On Vercel/AWS Lambda, @sparticuz/chromium supplies its own binary instead.
  chromePath: env('CHROME_PATH', ''),
  // Email alerts (Resend), sent only for confirmed "site is down" incidents — see notify.ts.
  resendApiKey: env('RESEND_API_KEY', ''),
  alertEmailFrom: env('ALERT_EMAIL_FROM', 'QA Command Center <onboarding@resend.dev>'),
};
