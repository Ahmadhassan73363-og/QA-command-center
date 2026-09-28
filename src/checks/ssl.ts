import tls from 'node:tls';
import { registerCheck } from './registry.js';
import { asNumber } from './util.js';

interface PeerInfo {
  authorized: boolean;
  authorizationError?: string;
  validTo: string;
  issuer?: string;
}

function peerCertificate(host: string, port: number, timeoutMs: number): Promise<PeerInfo> {
  return new Promise((resolve, reject) => {
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: false, timeout: timeoutMs });
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      resolve({
        authorized: socket.authorized,
        authorizationError: socket.authorizationError ? String(socket.authorizationError) : undefined,
        validTo: cert.valid_to,
        issuer: [cert.issuer?.O].flat()[0],
      });
      socket.end();
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(Object.assign(new Error('TLS handshake timed out'), { code: 'ETIMEDOUT' }));
    });
    socket.once('error', reject);
  });
}

registerCheck({
  type: 'ssl.cert_expiry',
  displayName: 'TLS certificate',
  category: 'ssl',
  cost: 'light',
  timeoutMs: 8_000,
  async execute(ctx) {
    const url = new URL(ctx.site.url);
    if (url.protocol !== 'https:') {
      return { status: 'fail', errorCode: 'tls_fail', errorMessage: 'Site URL is not HTTPS' };
    }
    const warn = asNumber(ctx.config.thresholds.ssl_days_warn, 14);
    const crit = asNumber(ctx.config.thresholds.ssl_days_crit, 7);
    const peer = await peerCertificate(url.hostname, Number(url.port || 443), 4_000);
    const daysLeft = Math.floor((Date.parse(peer.validTo) - Date.now()) / 86_400_000);
    const expected = { valid: true, min_days: warn };
    const actual = { valid: peer.authorized, days_left: daysLeft, valid_to: peer.validTo, issuer: peer.issuer };
    if (!peer.authorized) {
      return { status: 'fail', errorCode: 'tls_fail', expected, actual, errorMessage: peer.authorizationError };
    }
    const status = daysLeft < crit ? 'fail' : daysLeft < warn ? 'warn' : 'pass';
    return {
      status,
      errorCode: status === 'pass' ? undefined : 'tls_fail',
      expected,
      actual,
      errorMessage: status === 'pass' ? undefined : `Certificate expires in ${daysLeft} days`,
    };
  },
});
