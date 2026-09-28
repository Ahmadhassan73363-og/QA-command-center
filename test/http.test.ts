import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { classifyError, detectBotProtection, probe, probePreferHead, SiteHttp } from '../src/lib/http.js';

let server: http.Server;
let base = '';
let hits = 0;

before(async () => {
  server = http.createServer((req, res) => {
    hits++;
    const url = req.url ?? '/';
    if (url === '/no-head') {
      if (req.method === 'HEAD') return res.writeHead(405).end();
      return res.writeHead(200, { 'content-type': 'text/html' }).end('<h1>ok</h1>');
    }
    if (url === '/r1') return res.writeHead(301, { location: '/r2' }).end();
    if (url === '/r2') return res.writeHead(302, { location: `${base}/final` }).end();
    if (url === '/final') return res.writeHead(200).end('final');
    if (url === '/loop') return res.writeHead(302, { location: '/loop' }).end();
    if (url === '/ua') return res.writeHead(200).end(String(req.headers['user-agent']));
    res.writeHead(404).end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(() => new Promise<void>((r) => server.close(() => r())));

test('HEAD rejected with 405 falls back to GET', async () => {
  const r = await probePreferHead(`${base}/no-head`);
  assert.equal(r.status, 200);
  assert.equal(r.method, 'GET');
  assert.equal(r.headFallback, true);
});

test('redirects are followed manually and every hop recorded', async () => {
  const r = await probe(`${base}/r1`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.hops.map((h) => h.status), [301, 302, 200]);
  assert.equal(r.finalUrl, `${base}/final`);
});

test('redirect loops stop at maxHops with a 3xx final status', async () => {
  const r = await probe(`${base}/loop`, { maxHops: 4 });
  assert.equal(r.status, 302);
  assert.equal(r.hops.length, 5);
});

test('requests carry the monitor user-agent', async () => {
  const r = await probe(`${base}/ua`, { readBody: true });
  assert.match(r.body ?? '', /^QACommandCenter\//);
});

test('SiteHttp memoises identical requests within a cycle', async () => {
  const client = new SiteHttp(base, false);
  const before = hits;
  await Promise.all([client.get('/final'), client.get('/final'), client.get('/final')]);
  assert.equal(hits - before, 1);
});

test('network errors map to fixed error classes', async () => {
  await assert.rejects(probe('http://127.0.0.1:1/'), (err) => classifyError(err) === 'tcp_refused');
  assert.equal(classifyError(Object.assign(new Error('x'), { name: 'TimeoutError' })), 'timeout');
  assert.equal(classifyError({ cause: { code: 'ENOTFOUND' } }), 'dns_fail');
  assert.equal(classifyError({ code: 'CERT_HAS_EXPIRED' }), 'tls_fail');
  assert.equal(classifyError(new RangeError('bug')), null);
});

test('bot protection detection is conservative', () => {
  assert.equal(detectBotProtection(403, new Headers({ 'cf-mitigated': 'challenge' })), true);
  assert.equal(detectBotProtection(403, new Headers({ server: 'AkamaiGHost' })), true);
  assert.equal(detectBotProtection(503, new Headers({ server: 'cloudflare' })), false);
  assert.equal(detectBotProtection(200, new Headers({ 'cf-mitigated': 'challenge' })), false);
});
