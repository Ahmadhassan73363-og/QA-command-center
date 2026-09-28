import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ConfigError, GLOBAL_DEFAULTS, mergeLayer, profileChain, resolveConfig, type ProfileRow } from '../src/profiles/resolve.js';

const generic = {
  checks: { 'availability.http_status': true, 'seo.hreflang': true, 'performance.response_time': { path: '/' } },
  expected: { http_status: 200, security_headers: ['hsts', 'xcto'] },
  thresholds: { response_ms_warn: 800, response_ms_crit: 2000 },
  tags: ['web'],
};

test('objects deep-merge; later layer wins', () => {
  const r = resolveConfig([generic, { thresholds: { response_ms_warn: 1000 } }]);
  assert.equal(r.thresholds.response_ms_warn, 1000);
  assert.equal(r.thresholds.response_ms_crit, 2000);
});

test('arrays replace by default', () => {
  const r = resolveConfig([generic, { expected: { security_headers: ['csp'] } }]);
  assert.deepEqual(r.expected.security_headers, ['csp']);
});

test('+key appends to an inherited array and tags are de-duplicated', () => {
  const r = resolveConfig([generic, { '+tags': ['ecommerce', 'web'] }]);
  assert.deepEqual(r.tags, ['web', 'ecommerce']);
});

test('disable turns inherited checks off', () => {
  const r = resolveConfig([generic, { disable: ['seo.hreflang'] }]);
  assert.ok(!('seo.hreflang' in r.checks));
  assert.ok('availability.http_status' in r.checks);
});

test('a later layer can re-enable a disabled check', () => {
  const r = resolveConfig([generic, { disable: ['seo.hreflang'] }, { checks: { 'seo.hreflang': true } }]);
  assert.deepEqual(r.checks['seo.hreflang'], {});
});

test('checks: false disables; true normalises to {}; objects keep config', () => {
  const r = resolveConfig([generic, { checks: { 'availability.http_status': false } }]);
  assert.ok(!('availability.http_status' in r.checks));
  assert.deepEqual(r.checks['performance.response_time'], { path: '/' });
});

test('null removes an inherited key', () => {
  const r = resolveConfig([generic, { expected: { security_headers: null } }]);
  assert.ok(!('security_headers' in r.expected));
  assert.equal(r.expected.http_status, 200);
});

test('merging never mutates the input layers', () => {
  const copy = structuredClone(generic);
  mergeLayer(generic, { expected: { http_status: 301 }, '+tags': ['x'] }, true);
  assert.deepEqual(generic, copy);
});

test('global defaults supply retry policy', () => {
  const r = resolveConfig([GLOBAL_DEFAULTS, generic]);
  assert.deepEqual(r.retry.delaysMs, [15_000, 45_000]);
  assert.equal(r.retry.resolvePasses, 2);
});

test('invalid disable and check values are rejected', () => {
  assert.throws(() => resolveConfig([{ disable: 'seo.hreflang' }]), ConfigError);
  assert.throws(() => resolveConfig([{ checks: { x: 'yes' } }]), ConfigError);
  assert.throws(() => resolveConfig([{ '+tags': 'x' }]), ConfigError);
});

const profiles = new Map<string, ProfileRow>([
  ['generic', { id: 'generic', extends: null, config: { a: 1 } }],
  ['shopify', { id: 'shopify', extends: 'generic', config: { a: 2 } }],
  ['loop-a', { id: 'loop-a', extends: 'loop-b', config: {} }],
  ['loop-b', { id: 'loop-b', extends: 'loop-a', config: {} }],
]);

test('profile chain is root-first', () => {
  assert.deepEqual(profileChain('shopify', (id) => profiles.get(id)), [{ a: 1 }, { a: 2 }]);
});

test('cycles and unknown parents are rejected', () => {
  assert.throws(() => profileChain('loop-a', (id) => profiles.get(id)), /cycle/);
  assert.throws(() => profileChain('nope', (id) => profiles.get(id)), /Unknown profile/);
});

test('chains deeper than 5 are rejected', () => {
  const deep = new Map<string, ProfileRow>();
  for (let i = 0; i < 7; i++) deep.set(`p${i}`, { id: `p${i}`, extends: i ? `p${i - 1}` : null, config: {} });
  assert.throws(() => profileChain('p6', (id) => deep.get(id)), /deeper than 5/);
});
