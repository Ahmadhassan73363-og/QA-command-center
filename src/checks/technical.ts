import { registerCheck } from './registry.js';
import { asString, asStringArray } from './util.js';

const DEFAULT_HEADERS = ['strict-transport-security', 'x-content-type-options'];

registerCheck({
  type: 'technical.security_headers',
  displayName: 'Security headers',
  category: 'technical',
  cost: 'light',
  timeoutMs: 12_000,
  async execute(ctx) {
    const page = await ctx.http.get(asString(ctx.config.expected.probe_path));
    const required = asStringArray(ctx.config.expected.security_headers, DEFAULT_HEADERS).map((h) => h.toLowerCase());
    const missing = required.filter((h) => !page.headers.has(h));
    return {
      status: missing.length ? 'warn' : 'pass',
      errorCode: missing.length ? 'assertion_fail' : undefined,
      responseCode: page.status,
      expected: { present: required },
      actual: { missing },
      errorMessage: missing.length ? `Missing: ${missing.join(', ')}` : undefined,
    };
  },
});
