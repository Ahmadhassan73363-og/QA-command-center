import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { getCheck } from '../src/checks/index.js';
import { SiteHttp } from '../src/lib/http.js';
import { executeCheck } from '../src/engine/runner.js';
import type { CheckContext, SiteRecord } from '../src/checks/types.js';
import type { ResolvedConfig } from '../src/profiles/resolve.js';

let server: http.Server;
let base = '';
// robots.txt content is mutable per-test since seo.robots_txt always requests the literal path.
let robotsBody: string | null = null;

before(async () => {
  server = http.createServer((req, res) => {
    const url = req.url ?? '/';
    if (url === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html><body>ok</body></html>');
    if (url === '/blocked') return res.writeHead(403, { 'cf-mitigated': 'challenge' }).end('blocked');
    if (url === '/robots.txt') {
      return robotsBody == null ? res.writeHead(404).end('not found') : res.writeHead(200).end(robotsBody);
    }
    if (url === '/sitemap-valid') return res.writeHead(200, { 'content-type': 'application/xml' }).end('<urlset><url><loc>/</loc></url></urlset>');
    if (url === '/sitemap-bad') return res.writeHead(200, { 'content-type': 'text/html' }).end('<html>not a sitemap</html>');
    if (url === '/noindex') return res.writeHead(200, { 'content-type': 'text/html' }).end('<meta name="robots" content="noindex">');
    return res.writeHead(404).end('not found');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((r) => server.close(() => r())));

/**
 * Builds a CheckContext against the local test server. `path` becomes `expected.probe_path`,
 * which is what availability/performance/content checks actually read (they probe relative to
 * the site's base URL, they don't re-parse site.url) — NOT appended to site.url.
 */
function ctxFor(opts: {
  path?: string;
  expected?: Record<string, unknown>;
  thresholds?: Record<string, number>;
} = {}): CheckContext {
  const site: SiteRecord = {
    id: 1,
    name: 'test-site',
    url: base,
    region: 'global',
    profile_id: 'generic',
    alert_policy_id: null,
    head_unsupported: false,
    is_active: true,
    tags: [],
    resolved_config: {} as ResolvedConfig,
  };
  const config: ResolvedConfig = {
    checks: {},
    expected: { http_status: 200, redirect_chain_max_hops: 3, probe_path: opts.path ?? '/', ...opts.expected },
    thresholds: { response_ms_warn: 800, response_ms_crit: 2000, ...opts.thresholds },
    tags: [],
    retry: { delaysMs: [], resolvePasses: 1, flakyThreshold: 1 },
  };
  return { site, config, checkConfig: {}, http: new SiteHttp(base, false) };
}

// ---- availability.dns ---------------------------------------------------------

test('availability.dns passes for a resolvable host', async () => {
  const r = await getCheck('availability.dns')!.execute(ctxFor());
  assert.equal(r.status, 'pass');
  assert.equal(r.errorMessage, undefined);
});

test('availability.dns fails with the host name in the error message', async () => {
  // dns.lookup() rejects on NXDOMAIN — the check has no try/catch of its own, it relies on
  // executeCheck() (the real runner path) to turn the rejection into a CheckResult.
  const ctx = ctxFor();
  ctx.site.url = 'https://this-domain-does-not-exist-qa-test.invalid';
  const r = await executeCheck(getCheck('availability.dns')!, ctx);
  assert.equal(r.status, 'fail');
  assert.equal(r.errorCode, 'dns_fail');
  assert.match(r.errorMessage!, /this-domain-does-not-exist-qa-test\.invalid/);
});

// ---- availability.http_status ---------------------------------------------------

test('availability.http_status passes when the response matches the expected status', async () => {
  const r = await getCheck('availability.http_status')!.execute(ctxFor());
  assert.equal(r.status, 'pass');
  assert.equal(r.errorMessage, undefined);
});

test('availability.http_status fails and explains expected vs. received, with a friendly status note', async () => {
  const r = await getCheck('availability.http_status')!.execute(ctxFor({ path: '/missing' }));
  assert.equal(r.status, 'fail');
  assert.equal(r.errorCode, 'http_status');
  assert.equal(r.errorMessage, 'Expected HTTP 200 but received HTTP 404 (Not Found)');
});

test('availability.http_status reports bot protection as a warning, not a failure', async () => {
  const r = await getCheck('availability.http_status')!.execute(ctxFor({ path: '/blocked' }));
  assert.equal(r.status, 'warn');
  assert.equal(r.errorCode, 'blocked_by_bot_protection');
  assert.match(r.errorMessage!, /bot protection/i);
});

// ---- performance.response_time ---------------------------------------------------

test('performance.response_time passes comfortably under both thresholds', async () => {
  const r = await getCheck('performance.response_time')!.execute(ctxFor());
  assert.equal(r.status, 'pass');
  assert.equal(r.errorMessage, undefined);
});

test('performance.response_time warns above the warn threshold and names both values', async () => {
  const r = await getCheck('performance.response_time')!.execute(ctxFor({ thresholds: { response_ms_warn: -1, response_ms_crit: 100_000 } }));
  assert.equal(r.status, 'warn');
  assert.match(r.errorMessage!, /High latency: \d+ ms exceeds warning threshold of -1 ms/);
});

test('performance.response_time fails above the critical threshold', async () => {
  const r = await getCheck('performance.response_time')!.execute(ctxFor({ thresholds: { response_ms_warn: -1, response_ms_crit: -1 } }));
  assert.equal(r.status, 'fail');
  assert.match(r.errorMessage!, /Critical latency: \d+ ms exceeds critical threshold of -1 ms/);
});

// ---- seo.robots_txt ---------------------------------------------------------------

test('seo.robots_txt warns with the status code when robots.txt is missing', async () => {
  robotsBody = null;
  const r = await getCheck('seo.robots_txt')!.execute(ctxFor());
  assert.equal(r.status, 'warn');
  assert.equal(r.errorCode, 'http_status');
  assert.equal(r.errorMessage, '/robots.txt returned HTTP 404 (Not Found)');
});

test('seo.robots_txt passes when crawling is allowed', async () => {
  robotsBody = 'User-agent: *\nDisallow: /admin\n';
  const r = await getCheck('seo.robots_txt')!.execute(ctxFor());
  robotsBody = null;
  assert.equal(r.status, 'pass');
  assert.equal(r.errorMessage, undefined);
});

test('seo.robots_txt fails when robots.txt blocks every crawler', async () => {
  robotsBody = 'User-agent: *\nDisallow: /\n';
  const r = await getCheck('seo.robots_txt')!.execute(ctxFor());
  robotsBody = null;
  assert.equal(r.status, 'fail');
  assert.equal(r.errorCode, 'assertion_fail');
  assert.equal(r.errorMessage, 'robots.txt disallows all search engine crawlers from /');
});

// ---- seo.sitemap_xml ---------------------------------------------------------------

test('seo.sitemap_xml warns with the path and status when missing', async () => {
  const r = await getCheck('seo.sitemap_xml')!.execute(ctxFor());
  assert.equal(r.status, 'warn');
  assert.equal(r.errorCode, 'http_status');
  assert.equal(r.errorMessage, 'Sitemap at "/sitemap.xml" returned HTTP 404 (Not Found)');
});

test('seo.sitemap_xml warns when the response is not valid sitemap XML', async () => {
  const r = await getCheck('seo.sitemap_xml')!.execute(ctxFor({ expected: { sitemap_path: '/sitemap-bad' } }));
  assert.equal(r.status, 'warn');
  assert.equal(r.errorCode, 'assertion_fail');
  assert.equal(r.errorMessage, 'Response at "/sitemap-bad" is not valid XML (<urlset> or <sitemapindex> tag missing)');
});

test('seo.sitemap_xml passes for a valid urlset', async () => {
  const r = await getCheck('seo.sitemap_xml')!.execute(ctxFor({ expected: { sitemap_path: '/sitemap-valid' } }));
  assert.equal(r.status, 'pass');
  assert.equal(r.errorMessage, undefined);
});

// ---- content.noindex ---------------------------------------------------------------

test('content.noindex fails when the page is unexpectedly marked noindex', async () => {
  const r = await getCheck('content.noindex')!.execute(ctxFor({ path: '/noindex' }));
  assert.equal(r.status, 'fail');
  assert.equal(r.errorMessage, 'Page is marked noindex');
});

test('content.noindex passes when noindex is expected and present', async () => {
  const r = await getCheck('content.noindex')!.execute(ctxFor({ path: '/noindex', expected: { noindex: true } }));
  assert.equal(r.status, 'pass');
});
