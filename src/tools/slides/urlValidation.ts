/**
 * Best-effort SSRF check on URLs that Google's Slides API will fetch
 * server-side (`createImage`'s `url` field). Blocks IP-literal hostnames
 * that resolve to private/loopback/link-local ranges.
 *
 * This is intentionally **string-level only** — we do not perform DNS
 * resolution. A hostname that resolves to an internal IP via DNS rebinding
 * is NOT blocked here. For multi-tenant deployments
 * (`MCP_TRANSPORT=httpStream`), additional egress controls at the network
 * layer are recommended (firewall rules, deny-list outbound).
 *
 * For stdio mode (single local user), this catches the easy footguns
 * (`http://10.0.0.5/...`, `http://169.254.169.254/...` cloud-metadata,
 * `http://localhost/...`).
 */

const PRIVATE_HOSTS = new Set(['localhost', '0.0.0.0', '::1', '::', 'metadata.google.internal']);

const PRIVATE_RANGES: Array<(parts: number[]) => boolean> = [
  // 10.0.0.0/8
  ([a]) => a === 10,
  // 127.0.0.0/8 (loopback)
  ([a]) => a === 127,
  // 169.254.0.0/16 (link-local incl. cloud metadata)
  ([a, b]) => a === 169 && b === 254,
  // 172.16.0.0/12
  ([a, b]) => a === 172 && b >= 16 && b <= 31,
  // 192.168.0.0/16
  ([a, b]) => a === 192 && b === 168,
  // 0.0.0.0/8 (current network — unspecified)
  ([a]) => a === 0,
];

function ipv4Parts(host: string): number[] | null {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = [+m[1], +m[2], +m[3], +m[4]];
  if (parts.some((p) => p > 255)) return null;
  return parts;
}

/**
 * Returns null if the URL is acceptable, or a human-readable reason if it
 * targets a private/loopback/link-local host.
 */
export function rejectionReasonForFetchableUrl(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Could not parse URL.';
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (PRIVATE_HOSTS.has(host)) {
    return `URL host "${host}" is reserved/private and not allowed for server-side image fetch.`;
  }

  // IPv6 loopback and link-local literals
  if (
    host.startsWith('fe80:') ||
    host === '::1' ||
    host.startsWith('fc') ||
    host.startsWith('fd')
  ) {
    return `URL host "${host}" is a private/loopback IPv6 address.`;
  }

  const v4 = ipv4Parts(host);
  if (v4 && PRIVATE_RANGES.some((rule) => rule(v4))) {
    return `URL host "${host}" is in a private/loopback/link-local IPv4 range.`;
  }

  return null;
}
