import type { ResolvedConfig } from '../profiles/resolve.js';
import type { SiteHttp } from '../lib/http.js';

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'error';

/** The fixed error classes from Revised Spec v2. */
export const ERROR_CODES = [
  'dns_fail',
  'tcp_refused',
  'tcp_timeout',
  'tls_fail',
  'http_status',
  'timeout',
  'assertion_fail',
  'blocked_by_bot_protection',
  'selector_not_found',
  'worker_error',
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export interface CheckResult {
  status: CheckStatus;
  errorCode?: ErrorCode;
  responseCode?: number;
  responseTimeMs?: number;
  expected?: Record<string, unknown>;
  actual?: Record<string, unknown>;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export interface SiteRecord {
  id: number;
  name: string;
  url: string;
  region: string;
  profile_id: string;
  alert_policy_id: number | null;
  head_unsupported: boolean;
  is_active: boolean;
  tags: string[];
  resolved_config: ResolvedConfig;
}

export interface CheckContext {
  site: SiteRecord;
  config: ResolvedConfig;
  checkConfig: Record<string, unknown>;
  http: SiteHttp;
}

export interface CheckDefinition {
  type: string;
  displayName: string;
  category: string;
  cost: 'light' | 'medium' | 'heavy';
  timeoutMs: number;
  execute(ctx: CheckContext): Promise<CheckResult>;
}
