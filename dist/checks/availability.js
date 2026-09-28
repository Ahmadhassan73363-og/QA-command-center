import { promises as dns } from 'node:dns';
import { registerCheck } from './registry.js';
import { asNumber, asString } from './util.js';
import { detectBotProtection } from '../lib/http.js';
registerCheck({
    type: 'availability.dns',
    displayName: 'DNS resolution',
    category: 'availability',
    cost: 'light',
    timeoutMs: 5_000,
    async execute(ctx) {
        const host = new URL(ctx.site.url).hostname;
        const start = performance.now();
        const addrs = await dns.lookup(host, { all: true });
        const ok = addrs.length > 0;
        return {
            status: ok ? 'pass' : 'fail',
            errorCode: ok ? undefined : 'dns_fail',
            responseTimeMs: Math.round(performance.now() - start),
            expected: { resolves: true },
            actual: { addresses: addrs.map((a) => a.address) },
        };
    },
});
registerCheck({
    type: 'availability.http_status',
    displayName: 'HTTP status',
    category: 'availability',
    cost: 'light',
    timeoutMs: 12_000,
    async execute(ctx) {
        const r = await ctx.http.probe(asString(ctx.config.expected.probe_path));
        const expected = asNumber(ctx.config.expected.http_status, 200);
        const base = {
            responseCode: r.status,
            responseTimeMs: r.elapsedMs,
            expected: { http_status: expected },
            actual: { http_status: r.status },
            metadata: { method: r.method, finalUrl: r.finalUrl, headFallback: r.headFallback },
        };
        if (detectBotProtection(r.status, r.headers)) {
            return {
                ...base,
                status: 'warn',
                errorCode: 'blocked_by_bot_protection',
                errorMessage: 'Challenged by bot protection; allowlist the monitor user-agent or X-Monitor-Token header',
            };
        }
        const ok = r.status === expected;
        return { ...base, status: ok ? 'pass' : 'fail', errorCode: ok ? undefined : 'http_status' };
    },
});
registerCheck({
    type: 'availability.redirect_chain',
    displayName: 'Redirect chain',
    category: 'availability',
    cost: 'light',
    timeoutMs: 12_000,
    async execute(ctx) {
        const r = await ctx.http.probe(asString(ctx.config.expected.probe_path));
        const maxHops = asNumber(ctx.config.expected.redirect_chain_max_hops, 3);
        const hops = r.hops.length - 1;
        const actual = { hops, chain: r.hops, finalUrl: r.finalUrl };
        const expected = { max_hops: maxHops, final_https: ctx.site.url.startsWith('https://') };
        if (r.status >= 300 && r.status < 400) {
            return { status: 'fail', errorCode: 'assertion_fail', expected, actual, errorMessage: 'Redirect loop or chain too long to follow' };
        }
        if (hops > maxHops) {
            return { status: 'fail', errorCode: 'assertion_fail', expected, actual, errorMessage: `${hops} redirects, max ${maxHops}` };
        }
        if (expected.final_https && !r.finalUrl.startsWith('https://')) {
            return { status: 'warn', errorCode: 'assertion_fail', expected, actual, errorMessage: 'Redirect chain ends on plain HTTP' };
        }
        return { status: 'pass', expected, actual };
    },
});
//# sourceMappingURL=availability.js.map