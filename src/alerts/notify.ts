import { pool } from '../db/pool.js';
import type { SiteRecord } from '../checks/types.js';

export interface AlertEvent {
  event: 'incident.opened' | 'incident.resolved';
  incidentId: number;
  site: { id: number; name: string; url: string; region: string; profile: string };
  checkType: string;
  severity: 'warn' | 'critical';
  errorCode?: string | null;
  summary: string;
  expected?: unknown;
  actual?: unknown;
  at: string;
}

interface Channel {
  type: 'slack' | 'webhook';
  url: string;
}

/** "env:NAME" reads the secret from the environment so it never lives in the database. */
export function resolveSecret(value: string): string {
  return value.startsWith('env:') ? (process.env[value.slice(4)] ?? '') : value;
}

async function channelsFor(policyId: number | null): Promise<Channel[]> {
  const { rows } = await pool.query<{ channels: Channel[] }>(
    `SELECT channels FROM alert_policies
     WHERE ($1::bigint IS NOT NULL AND id = $1) OR ($1::bigint IS NULL AND name = 'default')
     LIMIT 1`,
    [policyId],
  );
  return rows[0]?.channels ?? [];
}

export function slackMessage(ev: AlertEvent): { text: string } {
  const icon = ev.event === 'incident.resolved' ? ':large_green_circle:' : ev.severity === 'critical' ? ':red_circle:' : ':large_yellow_circle:';
  const verb = ev.event === 'incident.resolved' ? 'Recovered' : ev.severity === 'critical' ? 'Critical' : 'Warning';
  const lines = [
    `${icon} *${verb}: ${ev.site.name}* (${ev.site.profile} · ${ev.site.region}) — \`${ev.checkType}\``,
    ev.summary,
    ev.site.url,
  ];
  return { text: lines.join('\n') };
}

export function eventFor(
  site: SiteRecord,
  base: Omit<AlertEvent, 'site' | 'at'>,
): AlertEvent {
  return {
    ...base,
    site: { id: site.id, name: site.name, url: site.url, region: site.region, profile: site.profile_id },
    at: new Date().toISOString(),
  };
}

/** Deliver to every configured channel. Failures are logged, never thrown. */
export async function notify(site: SiteRecord, ev: AlertEvent): Promise<void> {
  for (const ch of await channelsFor(site.alert_policy_id)) {
    const url = resolveSecret(ch.url);
    if (!url) continue;
    const body = ch.type === 'slack' ? slackMessage(ev) : ev;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) console.error(`[alert] ${ch.type} responded ${res.status}`);
    } catch (err) {
      console.error(`[alert] ${ch.type} delivery failed:`, (err as Error).message);
    }
  }
}
