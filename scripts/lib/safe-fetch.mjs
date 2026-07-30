// safe-fetch.mjs — fetch a URL a stranger chose, without letting them aim the
// runner at something that is not on the public internet.
//
// WHY THIS EXISTS NOW. lab-fetch-refs.mjs has always followed URLs out of a
// build request, and the request is written by whoever tagged the bot. That was
// three links from one named person. It is now up to eight, and the thread —
// everybody in it — can contribute them. Widening who picks the target is
// exactly the moment to start checking where the target is.
//
// WHAT A RUNNER LOOKS LIKE FROM INSIDE. The job holds a GITHUB_TOKEN with
// contents:write, the Cloudflare deploy credentials, and the Bluesky app
// password, and it can reach whatever else is listening on localhost. A fetch
// that follows `http://127.0.0.1:8080/` or a cloud metadata address is a
// request made with all of that standing behind it. GitHub's hosted runners are
// not especially exposed — Azure IMDS wants a header this never sends — but
// "not especially exposed" is not a property to build on, and self-hosted
// runners have none of that comfort.
//
// SO: resolve the host, refuse anything that is not a public address, and
// CHECK AGAIN ON EVERY REDIRECT. Checking only the URL you were handed is the
// classic hole — a public host is allowed to answer `302 Location:
// http://169.254.169.254/`, and a fetch that follows redirects itself will take
// it without telling you.
//
// WHAT THIS DOES NOT STOP, stated plainly rather than left to be discovered:
// DNS rebinding. The name is resolved, the addresses are checked, and then the
// request is made by name — so a resolver that answers differently the second
// time can still slip through the gap. Closing it properly means connecting to
// a pinned IP while keeping SNI and certificate validation honest, which is a
// custom agent and a good deal more machinery. The cheap mitigations are here;
// the expensive one is not, and pretending otherwise would be worse than saying
// so.

import { lookup } from 'node:dns/promises';

/** Turn an IPv4 string into a 32-bit number, or null if it is not one. */
function v4(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip ?? ''));
  if (!m) return null;
  const o = m.slice(1).map(Number);
  if (o.some((n) => n > 255)) return null;
  return ((o[0] << 24) >>> 0) + (o[1] << 16) + (o[2] << 8) + o[3];
}

/** [network, prefix-length] pairs that must never be reached. */
const V4_BLOCKED = [
  ['0.0.0.0', 8],        // "this host on this network"
  ['10.0.0.0', 8],       // RFC1918
  ['100.64.0.0', 10],    // CGNAT — a real path to a provider's internals
  ['127.0.0.0', 8],      // loopback: everything else listening on the runner
  ['169.254.0.0', 16],   // link-local, and the cloud metadata address
  ['172.16.0.0', 12],    // RFC1918
  ['192.0.0.0', 24],     // IETF protocol assignments
  ['192.0.2.0', 24],     // TEST-NET-1
  ['192.88.99.0', 24],   // 6to4 relay anycast
  ['192.168.0.0', 16],   // RFC1918
  ['198.18.0.0', 15],    // benchmarking
  ['198.51.100.0', 24],  // TEST-NET-2
  ['203.0.113.0', 24],   // TEST-NET-3
  ['224.0.0.0', 4],      // multicast
  ['240.0.0.0', 4],      // reserved, includes 255.255.255.255
];

export function isPublicV4(ip) {
  const n = v4(ip);
  if (n === null) return false;
  for (const [net, bits] of V4_BLOCKED) {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    if ((n & mask) >>> 0 === (v4(net) & mask) >>> 0) return false;
  }
  return true;
}

/** Expand an IPv6 string to its eight 16-bit groups, or null.
 *
 *  PARSED, NOT PATTERN-MATCHED, and the difference is not academic. The first
 *  version tested for the literal prefix "::ffff:" followed by a dotted quad —
 *  and `new URL('http://[::ffff:127.0.0.1]/').hostname` hands back
 *  `[::ffff:7f00:1]`, because WHATWG normalises the embedded v4 into hex. The
 *  string check saw an ordinary v6 address and allowed loopback through. Its
 *  own selftest caught it, which is the argument for writing the nasty cases
 *  down before the code. */
export function expandV6(ip) {
  let s = String(ip ?? '').toLowerCase().split('%')[0];     // drop any zone id
  if (!s.includes(':')) return null;

  // A trailing dotted quad is legal in either form; fold it into two groups.
  const dotted = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (dotted) {
    const n = v4(dotted[2]);
    if (n === null) return null;
    s = dotted[1] + ((n >>> 16) & 0xffff).toString(16) + ':' + (n & 0xffff).toString(16);
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null;

  let groups;
  if (tail === null) {
    groups = head;
  } else {
    const gap = 8 - head.length - tail.length;
    if (gap < 0) return null;
    groups = [...head, ...Array(gap).fill('0'), ...tail];
  }
  if (groups.length !== 8) return null;

  const out = groups.map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return out.some(Number.isNaN) ? null : out;
}

export function isPublicV6(ip) {
  const g = expandV6(ip);
  if (!g) return false;

  // IPv4-mapped (::ffff:a.b.c.d) and NAT64 (64:ff9b::a.b.c.d) carry a v4
  // address inside a v6 one. Judge the address traffic actually reaches, or
  // ::ffff:127.0.0.1 walks straight past a v6-only check.
  const zeroHead = g.slice(0, 5).every((x) => x === 0);
  const isNat64 = g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0);
  if ((zeroHead && g[5] === 0xffff) || isNat64) {
    const n = ((g[6] << 16) >>> 0) + g[7];
    return isPublicV4([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'));
  }

  if (g.every((x) => x === 0)) return false;                        // ::   unspecified
  if (zeroHead && g[5] === 0 && g[6] === 0 && g[7] === 1) return false; // ::1  loopback
  if ((g[0] & 0xfe00) === 0xfc00) return false;                     // fc00::/7  unique-local
  if ((g[0] & 0xffc0) === 0xfe80) return false;                     // fe80::/10 link-local
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;             // documentation
  if ((g[0] & 0xff00) === 0xff00) return false;                     // ff00::/8  multicast
  return true;
}

export const isPublicAddress = (ip) => (String(ip).includes(':') ? isPublicV6(ip) : isPublicV4(ip));

/** Why a URL was refused, or null if it is fine to request.
 *  Synchronous checks only — no DNS. Exported so the selftest can be offline. */
export function urlObjection(url) {
  let u;
  try { u = new URL(String(url)); } catch { return 'not a URL'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return `scheme ${u.protocol} is not http(s)`;
  // Credentials in a URL are never what a citation looks like, and they are how
  // a fetch gets talked into authenticating to something.
  if (u.username || u.password) return 'URL carries credentials';
  const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80);
  if (port !== 80 && port !== 443) return `port ${port} is not 80 or 443`;
  // A bare IP is never a citation either; it is somebody aiming.
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if ((v4(host) !== null || host.includes(':')) && !isPublicAddress(host)) {
    return `${host} is not a public address`;
  }
  return null;
}

/** Resolve and check every address a host answers with. One private answer is
 *  enough to refuse: a name with both is a name being used to get in. */
export async function hostObjection(hostname) {
  const host = String(hostname).replace(/^\[|\]$/g, '');
  if (v4(host) !== null || host.includes(':')) {
    return isPublicAddress(host) ? null : `${host} is not a public address`;
  }
  let addrs;
  try {
    addrs = await lookup(host, { all: true });
  } catch (err) {
    return `cannot resolve ${host}: ${String(err.code || err.message || err)}`;
  }
  if (!addrs.length) return `${host} resolves to nothing`;
  for (const { address } of addrs) {
    if (!isPublicAddress(address)) return `${host} resolves to ${address}, which is not public`;
  }
  return null;
}

/**
 * Fetch, following redirects BY HAND so each hop is checked before it is taken.
 * Returns a Response, or throws with a reason worth putting in a warning.
 *
 * @param {string} url
 * @param {{timeoutMs?: number, maxHops?: number, headers?: Record<string,string>,
 *          onHop?: (url: string) => void}} [opts]
 */
export async function safeFetch(url, opts = {}) {
  const { timeoutMs = 20000, maxHops = 5, headers = {}, onHop } = opts;
  let current = String(url);

  for (let hop = 0; hop <= maxHops; hop++) {
    const objection = urlObjection(current) || await hostObjection(new URL(current).hostname);
    if (objection) throw new Error(`refused ${current}: ${objection}`);
    if (onHop) onHop(current);

    const res = await fetch(current, {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'manual',          // the whole point — we take the hops ourselves
      headers,
    });

    if (res.status < 300 || res.status > 399) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    current = new URL(location, current).toString();   // relative Location is legal
  }
  throw new Error(`refused ${url}: more than ${maxHops} redirects`);
}
