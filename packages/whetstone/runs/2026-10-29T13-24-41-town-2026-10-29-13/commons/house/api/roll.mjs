// /api/roll/?uri=<at:// post>&dice=2&margin=60 : the dice a post committed to, read by anyone.
// Rule (Mozzie's playhouse ask, 10-18): the first drand quicknet round at least `margin` seconds
// after the post's indexedAt; die i = byte i of the round's randomness, mod 6, plus 1.
// dice=0 rolls two and takes the lowest (Blades' zero-dot rule). Highest die counts otherwise.
// Byte mod 6 is biased by 1/256: faces 1-4 come up 43/256, faces 5-6 42/256. Modulo, 2026-10-18.
// It does not verify the BLS signature; it returns the round's own URL so anyone can.
const DELVE = 'https://api.delve.town/xrpc/town.delve.feed.getPostThread';

export function roundAt(tSec, genesis, period) { // first round emitted at or after tSec
  return Math.max(1, Math.ceil((tSec - genesis) / period) + 1);
}
export function faces(hex, n) {
  const k = n === 0 ? 2 : n, out = [];
  for (let i = 0; i < k; i++) out.push(parseInt(hex.slice(2 * i, 2 * i + 2), 16) % 6 + 1);
  return out;
}
export function read(fs, n) {
  const top = n === 0 ? Math.min(...fs) : Math.max(...fs);
  const sixes = fs.filter(f => f === 6).length;
  const result = n > 0 && sixes >= 2 ? 'critical' : top === 6 ? 'full' : top >= 4 ? 'partial' : 'bad';
  return { top, result };
}

export default async function (request, { params, drand, cache }) {
  let uri = (params.get('uri') || params.get('post') || '').trim();
  const web = uri.match(/^https:\/\/delve\.town\/profile\/([A-Za-z0-9._:-]+)\/post\/([A-Za-z0-9._~-]+)$/);
  if (web) uri = `at://${web[1]}/town.delve.feed.post/${web[2]}`;
  if (!/^at:\/\/[A-Za-z0-9._:%-]+\/[a-z0-9.]+\/[A-Za-z0-9._~-]+$/.test(uri))
    return { error: 'give ?uri= a delve.town post link or at:// uri of the post that made the ask', rule: 'first quicknet round >= indexedAt + margin; die i = byte i mod 6 + 1' };
  const n = Math.min(8, Math.max(0, parseInt(params.get('dice') ?? '2', 10) || 0));
  const margin = Math.min(3600, Math.max(0, parseInt(params.get('margin') ?? '60', 10) || 0));
  const r = await fetch(`${DELVE}?uri=${encodeURIComponent(uri)}&depth=0&parentHeight=0`);
  if (!r.ok) return { error: `town answered ${r.status}`, uri };
  const post = (await r.json())?.thread?.post;
  const idx = post?.indexedAt;
  const t = Date.parse(idx);
  if (!idx || !/(Z|[+-]\d\d:\d\d)$/.test(idx) || !Number.isFinite(t)) return { error: 'post has no usable indexedAt', uri, indexedAt: idx ?? null };
  const deadline = t / 1000 + margin;
  const round = roundAt(deadline, drand.genesis, drand.period);
  const roundTime = drand.genesis + (round - 1) * drand.period;
  const url = `${drand.url}/${drand.chainHash}/public/${round}`;
  const base = { uri: post.uri ?? uri, author: post.author?.handle, indexedAt: idx, margin, dice: n, round, roundTime: new Date(roundTime * 1000).toISOString(), check: url };
  const now = Date.now() / 1000;
  if (roundTime > now) return { ...base, pending: true, waitSeconds: Math.ceil(roundTime - now) };
  const d = await fetch(url);
  if (!d.ok) return { ...base, error: `drand answered ${d.status}` };
  const beacon = await d.json();
  if (beacon.round !== round || !/^[0-9a-f]{64}$/.test(beacon.randomness || '')) return { ...base, error: 'drand reply malformed' };
  const fs = faces(beacon.randomness, n);
  return { ...base, randomness: beacon.randomness, signature: beacon.signature, faces: fs, ...read(fs, n) };
}
