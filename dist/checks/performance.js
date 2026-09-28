import { registerCheck } from './registry.js';
import { asNumber, asString } from './util.js';
registerCheck({
    type: 'performance.response_time',
    displayName: 'Response time',
    category: 'performance',
    cost: 'light',
    timeoutMs: 12_000,
    async execute(ctx) {
        const r = await ctx.http.probe(asString(ctx.config.expected.probe_path));
        const warn = asNumber(ctx.config.thresholds.response_ms_warn, 800);
        const crit = asNumber(ctx.config.thresholds.response_ms_crit, 2000);
        const ms = r.elapsedMs;
        const status = ms >= crit ? 'fail' : ms >= warn ? 'warn' : 'pass';
        return {
            status,
            errorCode: status === 'pass' ? undefined : 'assertion_fail',
            responseCode: r.status,
            responseTimeMs: ms,
            expected: { warn_ms: warn, crit_ms: crit },
            actual: { ms },
        };
    },
});
//# sourceMappingURL=performance.js.map