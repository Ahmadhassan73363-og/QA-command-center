import { registerCheck } from './registry.js';
import { asNumber, asString } from './util.js';
registerCheck({
    type: 'api.health',
    displayName: 'API health endpoint',
    category: 'api',
    cost: 'light',
    timeoutMs: 12_000,
    async execute(ctx) {
        const e = ctx.config.expected;
        const path = asString(e.health_path, '/health');
        const wantStatus = asNumber(e.health_status, 200);
        const wantBody = asString(e.health_body_contains);
        const r = await ctx.http.get(path);
        const bodyOk = !wantBody || (r.body ?? '').includes(wantBody);
        const ok = r.status === wantStatus && bodyOk;
        return {
            status: ok ? 'pass' : 'fail',
            errorCode: ok ? undefined : r.status !== wantStatus ? 'http_status' : 'assertion_fail',
            responseCode: r.status,
            responseTimeMs: r.elapsedMs,
            expected: { path, http_status: wantStatus, ...(wantBody ? { body_contains: wantBody } : {}) },
            actual: { http_status: r.status, body_matched: bodyOk },
        };
    },
});
//# sourceMappingURL=api.js.map