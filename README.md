# QA Command Center — Phase 1 (MVP)

Tier 1 website monitoring from the *Revised Spec v2*: config-driven profiles, ten
lightweight checks, fast-confirm retries, deduplicated incidents, and Slack/webhook alerts.
One Docker Compose stack; up to ~500 sites per worker.

## Quick start

```bash
cp .env.example .env          # set ADMIN_TOKEN and, optionally, SLACK_WEBHOOK_URL
docker compose up -d --build  # postgres, redis, migrate (one-shot), api, worker
curl localhost:3000/api/health
```

Add a site:

```bash
TOKEN=...   # your ADMIN_TOKEN
curl -X POST localhost:3000/api/sites \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"name":"Acme","url":"https://www.example.com","profile":"generic","tags":["critical"]}'
```

Or import several at once (add `?upsert=true` to update existing ones):

```bash
curl -X POST localhost:3000/api/sites/import \
  -H "Authorization: Bearer $TOKEN" -H 'content-type: text/yaml' \
  --data-binary @examples/sites.yaml
```

The first cycle starts immediately, then repeats every `TIER1_EVERY_MS` (10 min).
Open `http://localhost:3000/` for the status page (send the bearer token, or set
`STATUS_PAGE_PUBLIC=true` on a trusted network).

## Local development

```bash
npm install
npm test                  # unit tests (no database needed)
npm run migrate           # needs Postgres at DATABASE_URL
npm run dev:api           # and, in another shell:
npm run dev:worker
```

## How a failure becomes an alert

1. A scheduled check fails (attempt 1).
2. Retry after 15 s, then after a further 45 s. The retries are separate queue jobs, so another worker can pick them up.
3. All three fail → one incident opens (one per site + check, enforced by a unique index) → alert.
4. Any retry passes → the run is recorded as `flaky`. Three flaky runs in 24 h open a `warn` incident.
5. Two consecutive passing scheduled runs → auto-resolve → recovery alert.

**Root-cause suppression.** If `dns`, `http_status` or `api.health` is failing, incidents on
secondary checks (robots, sitemap, headers...) still open but send no alerts, and neither do
their recoveries. One outage = one alert.

Bot-protection challenges (`blocked_by_bot_protection`) are shown as warnings and never count
as downtime. `worker_error` means a bug in the monitor, not the site, and never alerts.

Per-site overrides: `retry: { delaysMs: [15000, 45000], resolvePasses: 2, flakyThreshold: 3 }`.

## Profiles and merge rules

Built-in profiles live in `profiles/*.yaml` and are loaded by `migrate`, which also
re-resolves every site. A site's config is resolved as
**global defaults → profile chain (root first) → site overrides**, and the result is stored
in `sites.resolved_config` (returned by `GET /api/sites/:id`).

| Rule | Example |
| --- | --- |
| Objects deep-merge; later wins | `thresholds: { response_ms_warn: 1000 }` |
| Arrays replace | `expected: { security_headers: [content-security-policy] }` |
| `+key` appends | `+tags: [ecommerce]` |
| `null` removes an inherited key | `expected: { sitemap_path: null }` |
| `disable` turns inherited checks off | `disable: [seo.robots_txt]` |
| A later layer can re-enable | `checks: { seo.robots_txt: true }` |

Chains deeper than 5 and cycles are rejected. Unknown check ids are rejected when a site
or profile is saved.

PATCH semantics: scalar fields replace. Sending any of `checks`, `expected`, `thresholds`,
`disable`, `schedule`, `retry` or `overrides` replaces the site's whole override layer.

## Checks

| Id | What it asserts | Key settings |
| --- | --- | --- |
| `availability.dns` | Hostname resolves | — |
| `availability.http_status` | Final status equals `expected.http_status` (HEAD, GET fallback) | `probe_path` |
| `availability.redirect_chain` | Hops ≤ `redirect_chain_max_hops`; ends on HTTPS | |
| `performance.response_time` | Time to final response under warn/crit | `thresholds.response_ms_*` |
| `ssl.cert_expiry` | Certificate valid, days left over warn/crit | `thresholds.ssl_days_*` |
| `technical.security_headers` | Listed headers present (warn only) | `expected.security_headers` |
| `seo.robots_txt` | Exists; doesn't block all crawlers | `expected.robots_allow_all` |
| `seo.sitemap_xml` | Returns a urlset or sitemapindex | `expected.sitemap_path` |
| `content.noindex` | Page is not noindex (or is, for staging) | `expected.noindex` |
| `api.health` | Status and optional body substring | `health_path`, `health_status`, `health_body_contains` |

### Adding a check

Create a file in `src/checks/`, call `registerCheck({ type, displayName, category, cost,
timeoutMs, execute })`, and import it from `src/checks/index.ts`. `execute` receives
`ctx.http` (a per-cycle client that dedupes identical requests), `ctx.config` (the resolved
config) and returns `{ status, errorCode?, expected?, actual?, ... }`. Throwing is fine:
network errors are classified automatically, and anything else becomes `worker_error`.

## API

All routes except `/api/health` need `Authorization: Bearer $ADMIN_TOKEN`.

| Method | Path | |
| --- | --- | --- |
| GET | `/api/health` | Postgres + Redis reachable |
| GET | `/api/profiles`, `/api/profiles/:id` | Built-in profiles |
| GET | `/api/checks` | Registered check types |
| GET, POST | `/api/sites` | List, create |
| GET, PATCH, DELETE | `/api/sites/:id` | Read, update, delete |
| POST | `/api/sites/import[?upsert=true]` | YAML/JSON: one site, a list, or `{ sites: [...] }` |
| GET | `/api/sites/:id/checks?type=&limit=` | Result history |
| GET | `/api/incidents?status=active\|open\|acked\|resolved` | |
| POST | `/api/incidents/:id/ack`, `/api/incidents/:id/resolve` | |
| POST | `/api/runs` | `{ "siteIds": [1,2] }` or empty for all; runs now |
| GET | `/` | Status page |

## Alert channels

The `default` policy (seeded by the migration) posts to `SLACK_WEBHOOK_URL` and
`ALERT_WEBHOOK_URL`. Channel URLs in `alert_policies.channels` may be `env:NAME` so secrets
stay out of the database. The generic webhook receives JSON:
`{ event, incidentId, site, checkType, severity, errorCode, summary, expected, actual, at }`.

## Layout

```
src/
  api/          Fastify server + status page
  checks/       registry, types, one file per category
  engine/       queue, runner (cycles + fast confirm), incidents, schedules
  profiles/     merge/resolve rules, YAML loader
  sites/        site CRUD, import, re-resolution
  alerts/       Slack + webhook delivery
  db/           pool, migrations runner, monthly partitions
  lib/http.ts   probes, HEAD fallback, error classes, bot-protection detection
migrations/     SQL
profiles/       built-in profiles (generic, api)
test/           unit tests (node:test)
```

## Not in the MVP

Browser QA (Playwright), adapters, regional checks, the Next.js dashboard, RBAC/SSO,
email/Teams/PagerDuty, quiet hours and escalation, Lighthouse, reports/SLA and WebSocket
progress. The schema reserves `quiet_hours`, `escalate_after_min`, `adapter_config_enc`
and `probe_region` for these.
