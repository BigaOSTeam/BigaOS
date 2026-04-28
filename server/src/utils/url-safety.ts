/**
 * URL safety helpers — defense against SSRF.
 *
 * Tile-server URLs and similar settings are user-configurable, so we can't
 * pin them to a fixed hostname. Instead we require http(s) and reject any
 * IP-literal host that points at private, loopback, link-local, multicast,
 * or unspecified ranges. This is best-effort: a hostname that resolves to
 * a private IP via DNS is not blocked here (full DNS resolution would
 * impose latency on every request and is still racy due to DNS rebinding).
 */

const PRIVATE_IPV4_RE = /^(10\.|127\.|169\.254\.|0\.|255\.255\.255\.255$)/;
function isPrivateIPv4(host: string): boolean {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return false;
  if (PRIVATE_IPV4_RE.test(host)) return true;
  // 172.16.0.0/12
  const parts = host.split('.').map(Number);
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  // 192.168.0.0/16
  if (parts[0] === 192 && parts[1] === 168) return true;
  // 224.0.0.0/4 multicast
  if (parts[0] >= 224 && parts[0] <= 239) return true;
  return false;
}

function isPrivateIPv6(host: string): boolean {
  // IPv6 literals come wrapped in brackets in URL.hostname (URL strips them),
  // but URL leaves the bare address in .hostname. Lower-case for comparison.
  const h = host.toLowerCase();
  if (!h.includes(':')) return false;
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('fc') || h.startsWith('fd')) return true; // ULA fc00::/7
  if (h.startsWith('fe80')) return true; // link-local
  if (h.startsWith('ff')) return true; // multicast
  // IPv4-mapped (::ffff:127.0.0.1 etc.)
  if (h.includes('.')) {
    const v4 = h.split(':').pop() || '';
    if (isPrivateIPv4(v4)) return true;
  }
  return false;
}

/**
 * Parse and validate an outbound HTTP(S) URL. Throws on disallowed inputs.
 * Returns the parsed URL on success.
 */
export function assertSafeOutboundUrl(raw: string, label = 'url'): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${label} is not a valid URL`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must be http(s)`);
  }
  const host = parsed.hostname;
  if (!host) {
    throw new Error(`${label} missing host`);
  }
  if (host === 'localhost') {
    throw new Error(`${label} host not allowed: ${host}`);
  }
  if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
    throw new Error(`${label} host not allowed: ${host}`);
  }
  return parsed;
}
