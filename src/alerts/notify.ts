import { pool } from '../db/pool.js';
import { config } from '../config.js';
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
  type: 'slack' | 'webhook' | 'email';
  url?: string;
  to?: string | string[];
  from?: string;
}

/** "env:NAME" reads the secret from the environment so it never lives in the database. */
export function resolveSecret(value: string): string {
  return value.startsWith('env:') ? (process.env[value.slice(4)] ?? '') : value;
}

/**
 * Checks that mean "the whole site is unreachable" — duplicated from ROOT_CAUSE_CHECKS in
 * engine/incidents.ts (not imported) to avoid a circular import between the two modules.
 */
const SITE_DOWN_CHECKS = ['availability.dns', 'availability.http_status', 'api.health'];

/** True only when a site is confirmed down — not warnings (SSL/headers/etc.), not recoveries. */
function isSiteDownEvent(ev: AlertEvent): boolean {
  return ev.event === 'incident.opened' && ev.severity === 'critical' && SITE_DOWN_CHECKS.includes(ev.checkType);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function emailHtml(ev: AlertEvent): string {
  return `<div style="font-family:sans-serif;max-width:480px;">
    <h2 style="color:#ef4444;margin-bottom:4px;">🔴 ${escapeHtml(ev.site.name)} is down</h2>
    <p style="color:#3f3f46;"><strong>${escapeHtml(ev.checkType)}</strong>: ${escapeHtml(ev.summary)}</p>
    <p><a href="${escapeHtml(ev.site.url)}">${escapeHtml(ev.site.url)}</a></p>
    <p style="color:#a1a1aa;font-size:12px;">${escapeHtml(ev.at)} · region ${escapeHtml(ev.site.region)}</p>
  </div>`;
}

/** Delivers one "site is down" email via the Resend API. Never throws. */
async function sendEmail(ev: AlertEvent, ch: Channel): Promise<void> {
  if (!config.resendApiKey) {
    console.warn('[alert] email channel configured but RESEND_API_KEY is not set, skipping');
    return;
  }
  const raw = ch.to;
  // Each entry (or the resolved env var) may itself be a comma-separated list, e.g. ALERT_EMAIL_TO.
  const to = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map(resolveSecret)
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter(Boolean);
  if (!to.length) return; // no recipient configured yet — skip quietly, matches other channels

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${config.resendApiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: ch.from ?? config.alertEmailFrom,
        to,
        subject: `${ev.site.name} is down — ${ev.checkType}`,
        html: emailHtml(ev),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) console.error(`[alert] email responded ${res.status}: ${await res.text()}`);
  } catch (err) {
    console.error('[alert] email delivery failed:', (err as Error).message);
  }
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
    if (ch.type === 'email') {
      if (isSiteDownEvent(ev)) await sendEmail(ev, ch);
      continue;
    }
    const url = ch.url ? resolveSecret(ch.url) : '';
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
