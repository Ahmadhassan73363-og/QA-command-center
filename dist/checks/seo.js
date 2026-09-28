import { registerCheck } from './registry.js';
import { asString } from './util.js';
/** True when robots.txt blocks every crawler from the whole site. */
export function robotsBlocksAll(text) {
    let agents = [];
    let inRules = false;
    let disallowRoot = false;
    let allowRoot = false;
    for (const raw of text.split(/\r?\n/)) {
        const line = raw.replace(/#.*/, '').trim();
        const idx = line.indexOf(':');
        if (!line || idx < 0)
            continue;
        const field = line.slice(0, idx).trim().toLowerCase();
        const value = line.slice(idx + 1).trim();
        if (field === 'user-agent') {
            if (inRules) {
                agents = [];
                inRules = false;
            }
            agents.push(value.toLowerCase());
        }
        else if (field === 'disallow' || field === 'allow') {
            inRules = true;
            if (!agents.includes('*'))
                continue;
            if (field === 'disallow' && value === '/')
                disallowRoot = true;
            if (field === 'allow' && value === '/')
                allowRoot = true;
        }
    }
    return disallowRoot && !allowRoot;
}
/** True when the page tells search engines not to index it (meta tag or X-Robots-Tag). */
export function hasNoindex(html, xRobotsTag) {
    if (xRobotsTag && /noindex/i.test(xRobotsTag))
        return true;
    for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
        const tag = m[0];
        if (/name\s*=\s*["']?(robots|googlebot)["']?/i.test(tag) && /content\s*=\s*["'][^"']*noindex/i.test(tag)) {
            return true;
        }
    }
    return false;
}
registerCheck({
    type: 'seo.robots_txt',
    displayName: 'robots.txt',
    category: 'seo',
    cost: 'light',
    timeoutMs: 12_000,
    async execute(ctx) {
        const r = await ctx.http.get('/robots.txt');
        if (r.status !== 200) {
            return { status: 'warn', errorCode: 'http_status', responseCode: r.status, expected: { http_status: 200 }, actual: { http_status: r.status } };
        }
        const allowAll = ctx.config.expected.robots_allow_all !== false;
        const blocked = robotsBlocksAll(r.body ?? '');
        const bad = allowAll && blocked;
        return {
            status: bad ? 'fail' : 'pass',
            errorCode: bad ? 'assertion_fail' : undefined,
            responseCode: r.status,
            expected: { blocks_all_crawlers: !allowAll },
            actual: { blocks_all_crawlers: blocked },
            errorMessage: bad ? 'robots.txt disallows all crawlers from /' : undefined,
        };
    },
});
registerCheck({
    type: 'seo.sitemap_xml',
    displayName: 'Sitemap',
    category: 'seo',
    cost: 'light',
    timeoutMs: 15_000,
    async execute(ctx) {
        const path = asString(ctx.config.expected.sitemap_path, '/sitemap.xml');
        const r = await ctx.http.get(path);
        const isXml = /<(urlset|sitemapindex)[\s>]/i.test(r.body ?? '');
        const ok = r.status === 200 && isXml;
        return {
            status: ok ? 'pass' : 'warn',
            errorCode: ok ? undefined : r.status === 200 ? 'assertion_fail' : 'http_status',
            responseCode: r.status,
            expected: { path, http_status: 200, sitemap_xml: true },
            actual: { http_status: r.status, sitemap_xml: isXml },
        };
    },
});
registerCheck({
    type: 'content.noindex',
    displayName: 'Noindex guard',
    category: 'content',
    cost: 'light',
    timeoutMs: 12_000,
    async execute(ctx) {
        const page = await ctx.http.get(asString(ctx.config.expected.probe_path));
        const found = hasNoindex(page.body ?? '', page.headers.get('x-robots-tag'));
        const expectedNoindex = ctx.config.expected.noindex === true;
        const ok = found === expectedNoindex;
        return {
            status: ok ? 'pass' : 'fail',
            errorCode: ok ? undefined : 'assertion_fail',
            responseCode: page.status,
            expected: { noindex: expectedNoindex },
            actual: { noindex: found },
            errorMessage: ok ? undefined : found ? 'Page is marked noindex' : 'Page expected to be noindex but is indexable',
        };
    },
});
//# sourceMappingURL=seo.js.map