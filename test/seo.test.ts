import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasNoindex, robotsBlocksAll } from '../src/checks/seo.js';

test('robots: Disallow / for * blocks everything', () => {
  assert.equal(robotsBlocksAll('User-agent: *\nDisallow: /\n'), true);
});

test('robots: specific paths or other agents do not block all', () => {
  assert.equal(robotsBlocksAll('User-agent: *\nDisallow: /admin\n'), false);
  assert.equal(robotsBlocksAll('User-agent: BadBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n'), false);
});

test('robots: Allow / overrides Disallow / and comments are ignored', () => {
  assert.equal(robotsBlocksAll('User-agent: * # all\nDisallow: /\nAllow: /\n'), false);
});

test('robots: grouped agents share rules', () => {
  assert.equal(robotsBlocksAll('User-agent: Googlebot\nUser-agent: *\nDisallow: /\n'), true);
});

test('noindex via meta tag, either attribute order', () => {
  assert.equal(hasNoindex('<meta name="robots" content="noindex, nofollow">', null), true);
  assert.equal(hasNoindex("<meta content='NOINDEX' name='googlebot'>", null), true);
  assert.equal(hasNoindex('<meta name="description" content="noindex is a word">', null), false);
});

test('noindex via X-Robots-Tag header', () => {
  assert.equal(hasNoindex('<html></html>', 'noindex'), true);
  assert.equal(hasNoindex('<html></html>', 'nosnippet'), false);
});
