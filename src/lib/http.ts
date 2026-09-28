import { config } from '../config.js';
import type { ErrorCode } from '../checks/types.js';

export interface Hop {
  url: string;
  status: number;
}

export interface ProbeResult {
  hops: Hop[];
  status: number;
  headers: Headers;
  finalUrl: string;
  elapsedMs: number;
  method: 'HEAD' | 'GET';
  body?: string;
  headFallback: boolean;
}

interface ProbeOptions {
  method?: 'HEAD' | 'GET';
  maxHops?: number;
  timeoutMs?: number;
  readBody?: boolean;
}

const MAX_BODY_CHARS = 2_000_000;
const HEAD_REJECTED = new Set([403, 405, 501]);

function requestHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'user-agent': config.userAgent, accept: '*/*' };
  if (config.monitorToken) headers['x-monitor-token'] = config.monitorToken;
  return headers;
}

/** One request chain, following redirects manually so every hop is recorded. */
export async function probe(url: string, opts: ProbeOptions = {}): Promise<ProbeResult> {
  const method = opts.method ?? 'GET';
  const maxHops = opts.maxHops ?? 10;
  const signal = AbortSignal.timeout(opts.timeoutMs ?? 10_000);
  const hops: Hop[] = [];
  const start = performance.now();
  let current = url;

  for (;;) {
    const res = await fetch(current, { method, redirect: 'manual', headers: requestHeaders(), signal });
    hops.push({ url: current, status: res.status });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location && hops.length <= maxHops) {
      await res.body?.cancel();
      current = new URL(location, current).href;
      continue;
    }
    const elapsedMs = Math.round(performance.now() - start);
    let body: string | undefined;
    if (opts.readBody && method === 'GET') body = (await res.text()).slice(0, MAX_BODY_CHARS);
    else await res.body?.cancel();
    return { hops, status: res.status, headers: res.headers, finalUrl: current, elapsedMs, method, body, headFallback: false };
  }
}

/** HEAD first; on 403/405/501 or a reset connection, repeat as GET. */
export async function probePreferHead(url: string, opts: Omit<ProbeOptions, 'method'> = {}): Promise<ProbeResult> {
  let headStatus: number | undefined;
  try {
    const head = await probe(url, { ...opts, method: 'HEAD' });
    if (!HEAD_REJECTED.has(head.status)) return head;
    headStatus = head.status;
  } catch (err) {
    if (errorCodeOf(err) !== 'ECONNRESET' && errorCodeOf(err) !== 'UND_ERR_SOCKET') throw err;
  }
  const get = await probe(url, { ...opts, method: 'GET' });
  return { ...get, headFallback: get.status !== headStatus };
}

export function errorCodeOf(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } } | undefined;
  return e?.cause?.code ?? e?.code;
}

/** Map a thrown network error to a fixed error class, or null if it isn't a network error. */
export function classifyError(err: unknown): ErrorCode | null {
  const name = (err as Error | undefined)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') return 'timeout';
  const code = errorCodeOf(err) ?? '';
  if (['ENOTFOUND', 'EAI_AGAIN', 'EAI_NONAME', 'ENODATA'].includes(code)) return 'dns_fail';
  if (['ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_SOCKET'].includes(code)) return 'tcp_refused';
  if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT'].includes(code)) return 'tcp_timeout';
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|DEPTH_ZERO/i.test(code)) return 'tls_fail';
  if (name === 'TypeError' && (err as Error).message === 'fetch failed') return 'tcp_refused';
  return null;
}

/** Recognise a bot-protection challenge rather than a real outage. Conservative on purpose. */
export function detectBotProtection(status: number, headers: Headers, body?: string): boolean {
  if (![403, 429, 503].includes(status)) return false;
  if (headers.get('cf-mitigated')) return true;
  if (headers.get('x-datadome') || /datadome=/i.test(headers.get('set-cookie') ?? '')) return true;
  if (status === 403 && /akamaighost/i.test(headers.get('server') ?? '')) return true;
  if (body && /\/cdn-cgi\/challenge-platform\/|captcha-delivery\.com/i.test(body)) return true;
  return false;
}

/** Per-cycle HTTP client for one site. Memoises so checks sharing a URL make one request. */
export class SiteHttp {
  headFallbackUsed = false;
  private memo = new Map<string, Promise<ProbeResult>>();

  constructor(private readonly baseUrl: string, private readonly headUnsupported: boolean) {}

  url(path = ''): string {
    return path ? new URL(path, this.baseUrl).href : this.baseUrl;
  }

  /** Status/timing probe: HEAD with GET fallback unless the site is known not to support HEAD. */
  probe(path = ''): Promise<ProbeResult> {
    return this.cached(`probe:${path}`, async () => {
      const result = this.headUnsupported
        ? await probe(this.url(path), { method: 'GET' })
        : await probePreferHead(this.url(path));
      if (result.headFallback) this.headFallbackUsed = true;
      return result;
    });
  }

  /** Full GET with body, for content checks. */
  get(path = ''): Promise<ProbeResult> {
    return this.cached(`get:${path}`, () => probe(this.url(path), { method: 'GET', readBody: true }));
  }

  private cached(key: string, fn: () => Promise<ProbeResult>): Promise<ProbeResult> {
    let p = this.memo.get(key);
    if (!p) {
      p = fn();
      this.memo.set(key, p);
    }
    return p;
  }
}
