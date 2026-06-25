// gc — block-intelligence backend. Three questions over public ATProto block data:
//
//   1. relation / matrix  — does A block B?  (raw app.bsky.graph.block records,
//                            authoritative, no third party — bounded by the
//                            blocker's own outgoing block count)
//   2. who-blocks          — X's mutuals/followers who block Y
//                            (blockers(Y) ∩ relationship(X), the cheap direction)
//   3. blockers            — ALL users blocking Y
//
// Blocks live in each *blocker's* repo, so "everyone who blocks Y" can't come
// from raw records without crawling the whole network. Clearsky
// (https://clearsky.services) consumes the firehose and maintains exactly that
// index; it backs #3 and the blocker side of #2. #1 reads raw records directly.
//
// All inputs accept a handle or a DID. All DIDs returned are canonical.

const PUBLIC = 'https://public.api.bsky.app';
const CLEARSKY = 'https://api.clearsky.services/api/v1/anon';

// Tunables — keep a single request inside the Worker subrequest budget.
const LIMITS = {
  MAX_ACCOUNTS: 25,        // /matrix accounts
  MAX_TARGETS: 25,         // /matrix + targets
  WHOBLOCKS_MAX_PAGES: 60, // /who-blocks: cap blockers(Y) scanned at 60*100 = 6000
  CLEARSKY_CONCURRENCY: 5,
  WALK_CONCURRENCY: 6,
  BLOCK_PAGE_CAP: 400,     // ≈40k records per repo walk
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (status, msg) => { throw new ApiError(status, msg); };

// ── tiny utils ───────────────────────────────────────────────────────────────
async function mapPool(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  async function lane() { while (i < items.length) { const idx = i++; res[idx] = await fn(items[idx], idx); } }
  await Promise.all(Array.from({ length: Math.min(n, items.length || 1) }, lane));
  return res;
}
const cleanHandle = (raw) => String(raw || '').trim().replace(/^@/, '')
  .replace(/^at:\/\//, '').replace(/^https?:\/\/(bsky\.app\/profile\/)?/, '').split('/')[0];

function parseList(raw, cap) {
  const list = [...new Set(String(raw || '').split(/[\s,]+/).map(cleanHandle).filter(Boolean))];
  if (!list.length) bad(400, 'empty list');
  if (list.length > cap) bad(400, `too many entries (max ${cap})`);
  return list;
}

// ── identity ─────────────────────────────────────────────────────────────────
async function resolveActor(raw) {
  const s = cleanHandle(raw);
  if (!s) bad(400, 'empty handle');
  if (s.startsWith('did:')) return s;
  const r = await fetch(`${PUBLIC}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(s)}`);
  if (!r.ok) bad(404, `couldn't resolve "${s}"`);
  const d = await r.json();
  if (!d.did) bad(404, `couldn't resolve "${s}"`);
  return d.did;
}
async function profilesMap(dids) {
  const out = new Map();
  const uniq = [...new Set(dids)];
  await mapPool(Array.from({ length: Math.ceil(uniq.length / 25) }, (_, i) => uniq.slice(i * 25, i * 25 + 25)), 4, async (batch) => {
    if (!batch.length) return;
    const u = new URL(`${PUBLIC}/xrpc/app.bsky.actor.getProfiles`);
    batch.forEach((d) => u.searchParams.append('actors', d));
    try {
      const r = await fetch(u);
      if (!r.ok) return;
      const d = await r.json();
      for (const p of (d.profiles || [])) out.set(p.did, { did: p.did, handle: p.handle, displayName: p.displayName || null, avatar: p.avatar || null });
    } catch { /* skip */ }
  });
  return out;
}
const actorRef = (did, map) => ({ did, handle: (map.get(did) || {}).handle || null });
const actorCard = (did, map) => {
  const p = map.get(did) || {};
  return { did, handle: p.handle || null, displayName: p.displayName || null, avatar: p.avatar || null };
};

async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const r = await fetch(`https://plc.directory/${did}`);
    if (!r.ok) bad(502, 'PLC lookup failed');
    doc = await r.json();
  } else if (did.startsWith('did:web:')) {
    const host = did.slice('did:web:'.length).replace(/:/g, '/');
    const r = await fetch(`https://${host}/.well-known/did.json`);
    if (!r.ok) bad(502, 'did:web lookup failed');
    doc = await r.json();
  } else bad(400, 'unsupported DID method');
  const svc = (doc.service || []).find((s) => s.type === 'AtprotoPersonalDataServer' || s.id === '#atproto_pds');
  if (!svc) bad(502, 'no PDS in DID doc');
  return svc.serviceEndpoint;
}

// Walk one repo's public blocks, collecting which of `wantDids` it blocks (with
// the block date). Early-stops once all wanted DIDs are found.
async function outgoingBlocks(did, wantDids) {
  const pds = await resolvePds(did);
  const want = new Set(wantDids);
  const found = new Map(); // blockedDid -> blockedAt
  let cursor = '';
  for (let page = 0; page < LIMITS.BLOCK_PAGE_CAP; page++) {
    const u = new URL(`${pds}/xrpc/com.atproto.repo.listRecords`);
    u.searchParams.set('repo', did);
    u.searchParams.set('collection', 'app.bsky.graph.block');
    u.searchParams.set('limit', '100');
    if (cursor) u.searchParams.set('cursor', cursor);
    const r = await fetch(u);
    if (!r.ok) { if (r.status === 400) return found; bad(502, `listRecords → ${r.status}`); }
    const d = await r.json();
    for (const rec of (d.records || [])) {
      const subj = rec.value && rec.value.subject;
      if (subj && want.has(subj)) { found.set(subj, rec.value.createdAt || null); if (found.size === want.size) return found; }
    }
    if (!d.cursor || !(d.records || []).length) return found;
    cursor = d.cursor;
  }
  return found;
}

// ── Clearsky (the block index) ───────────────────────────────────────────────
async function clearskyTotal(did) {
  const r = await fetch(`${CLEARSKY}/single-blocklist/total/${encodeURIComponent(did)}`);
  if (!r.ok) bad(502, `clearsky total → ${r.status}`);
  const d = await r.json();
  return (d && d.data && Number(d.data.count)) || 0;
}
async function clearskyPage(did, page) {
  const base = `${CLEARSKY}/single-blocklist/${encodeURIComponent(did)}`;
  const r = await fetch(page > 1 ? `${base}/${page}` : base);
  if (!r.ok) return null;
  const d = await r.json();
  return (d && d.data && d.data.blocklist) || [];
}
// Collect up to maxPages of blockers(did) → Map(blockerDid -> blockedDate). Sets
// `truncated` if more exist beyond the cap.
async function clearskyBlockers(did, maxPages) {
  const total = await clearskyTotal(did);
  const pagesAvail = Math.ceil(total / 100);
  const pages = Math.min(pagesAvail, maxPages);
  const map = new Map();
  const nums = Array.from({ length: pages }, (_, i) => i + 1);
  await mapPool(nums, LIMITS.CLEARSKY_CONCURRENCY, async (p) => {
    const list = await clearskyPage(did, p);
    if (list) for (const e of list) if (e && e.did) map.set(e.did, e.blocked_date || null);
  });
  return { map, total, truncated: pagesAvail > pages };
}

// getRelationships(actor, others) → Map(otherDid -> {following, followedBy}).
async function relationships(actorDid, otherDids) {
  const out = new Map();
  const batches = Array.from({ length: Math.ceil(otherDids.length / 30) }, (_, i) => otherDids.slice(i * 30, i * 30 + 30));
  await mapPool(batches, LIMITS.CLEARSKY_CONCURRENCY, async (batch) => {
    if (!batch.length) return;
    const u = new URL(`${PUBLIC}/xrpc/app.bsky.graph.getRelationships`);
    u.searchParams.set('actor', actorDid);
    batch.forEach((d) => u.searchParams.append('others', d));
    try {
      const r = await fetch(u);
      if (!r.ok) return;
      const d = await r.json();
      for (const rel of (d.relationships || [])) if (rel.did) out.set(rel.did, { following: !!rel.following, followedBy: !!rel.followedBy });
    } catch { /* skip */ }
  });
  return out;
}

// ── handlers (return plain JSON-able objects) ────────────────────────────────

// #1a — does A block B?
export async function relation(params) {
  const subjectRaw = params.get('subject'), targetRaw = params.get('target');
  if (!subjectRaw || !targetRaw) bad(400, 'subject and target are required');
  const [aDid, bDid] = await Promise.all([resolveActor(subjectRaw), resolveActor(targetRaw)]);
  if (aDid === bDid) bad(400, 'subject and target are the same account');
  const found = await outgoingBlocks(aDid, [bDid]);
  const map = await profilesMap([aDid, bDid]);
  return {
    subject: actorRef(aDid, map),
    target: actorRef(bDid, map),
    blocks: found.has(bDid),
    blockedAt: found.get(bDid) || null,
    source: 'records',
  };
}

// #1 — matrix: which of `accounts` block which of `targets`.
export async function matrix(params) {
  const accounts = parseList(params.get('accounts'), LIMITS.MAX_ACCOUNTS);
  const targets = parseList(params.get('targets'), LIMITS.MAX_TARGETS);
  const accDids = await mapPool(accounts, 8, (a) => resolveActor(a).catch(() => null));
  const tgtDids = await mapPool(targets, 8, (t) => resolveActor(t).catch(() => null));
  const targetDids = [...new Set(tgtDids.filter(Boolean))];
  if (!targetDids.length) bad(400, 'no targets could be resolved');
  const rows = await mapPool(accDids, LIMITS.WALK_CONCURRENCY, async (did, i) => {
    if (!did) return { input: accounts[i], did: null, unreadable: true, blocks: [] };
    try {
      const found = await outgoingBlocks(did, targetDids);
      return { did, blocks: [...found.entries()].map(([d, at]) => ({ did: d, blockedAt: at })) };
    } catch { return { did, unreadable: true, blocks: [] }; }
  });
  const map = await profilesMap([...accDids.filter(Boolean), ...targetDids]);
  return {
    targets: targetDids.map((d) => actorRef(d, map)),
    accounts: rows.map((r) => ({
      ...actorRef(r.did, map),
      input: r.input,
      unreadable: !!r.unreadable,
      blocks: (r.blocks || []).map((b) => ({ ...actorRef(b.did, map), blockedAt: b.blockedAt })),
    })),
    source: 'records',
  };
}

// #2 — X's mutuals/followers who block Y. blockers(Y) from the index, filtered by
// each blocker's relationship to X (cheap: bounded by Y's blocker count).
export async function whoBlocks(params) {
  const ofRaw = params.get('of'), targetRaw = params.get('target') || params.get('blocks');
  if (!ofRaw || !targetRaw) bad(400, 'of and target are required');
  const scope = params.get('scope') === 'followers' ? 'followers' : 'mutuals';
  const maxPages = Math.min(parseInt(params.get('maxPages') || '', 10) || LIMITS.WHOBLOCKS_MAX_PAGES, LIMITS.WHOBLOCKS_MAX_PAGES);
  const [xDid, yDid] = await Promise.all([resolveActor(ofRaw), resolveActor(targetRaw)]);
  if (xDid === yDid) bad(400, 'of and target are the same account');

  const { map: blockerDates, total, truncated } = await clearskyBlockers(yDid, maxPages);
  const blockerDids = [...blockerDates.keys()];
  const rel = await relationships(xDid, blockerDids);
  const matches = blockerDids.filter((d) => {
    const rl = rel.get(d);
    if (!rl) return false;
    return scope === 'followers' ? rl.followedBy : (rl.followedBy && rl.following);
  });
  const profs = await profilesMap([xDid, yDid, ...matches]);
  matches.sort((a, b) => new Date(blockerDates.get(b) || 0) - new Date(blockerDates.get(a) || 0));
  return {
    of: actorRef(xDid, profs),
    target: actorRef(yDid, profs),
    scope,
    count: matches.length,
    blockersOfTarget: total,
    scanned: blockerDids.length,
    truncated,
    results: matches.map((d) => ({ ...actorCard(d, profs), blockedAt: blockerDates.get(d) || null })),
    source: 'clearsky+records',
  };
}

// #3 — all users blocking Y (one Clearsky page at a time, handles hydrated).
export async function blockers(params) {
  const subjectRaw = params.get('subject');
  if (!subjectRaw) bad(400, 'subject is required');
  const page = Math.max(parseInt(params.get('page') || '1', 10) || 1, 1);
  const yDid = await resolveActor(subjectRaw);
  const [total, list] = await Promise.all([clearskyTotal(yDid), clearskyPage(yDid, page)]);
  if (list === null) bad(502, 'clearsky blocklist unavailable');
  const dids = list.map((e) => e.did).filter(Boolean);
  const profs = await profilesMap([yDid, ...dids]);
  return {
    subject: actorRef(yDid, profs),
    total,
    page,
    pageSize: 100,
    nextPage: page * 100 < total ? page + 1 : null,
    blockers: list.filter((e) => e.did).map((e) => ({ ...actorCard(e.did, profs), blockedAt: e.blocked_date || null })),
    source: 'clearsky',
  };
}

// Self-describing discovery doc.
export function discovery(origin) {
  const base = `${origin}/api/gc`;
  return {
    service: 'gc — Bluesky block intelligence',
    description: 'Read-only public-data API for three block questions. No auth; CORS open.',
    dataSources: {
      records: 'raw app.bsky.graph.block records on each blocker\'s PDS (authoritative, bounded)',
      clearsky: 'clearsky.services firehose-built block index (for network-wide blocker sets)',
    },
    endpoints: [
      { path: '/api/gc/relation', params: { subject: 'handle|did', target: 'handle|did' }, returns: 'does subject block target', source: 'records', example: `${base}/relation?subject=alice.bsky.social&target=bob.bsky.social` },
      { path: '/api/gc/matrix', params: { accounts: 'csv handle|did (≤25)', targets: 'csv handle|did (≤25)' }, returns: 'which accounts block which targets', source: 'records', example: `${base}/matrix?accounts=alice.bsky.social,carol.bsky.social&targets=bob.bsky.social` },
      { path: '/api/gc/who-blocks', params: { of: 'handle|did', target: 'handle|did', scope: 'mutuals|followers (default mutuals)', maxPages: `int ≤${LIMITS.WHOBLOCKS_MAX_PAGES} (optional)` }, returns: "of's mutuals/followers who block target", source: 'clearsky+records', example: `${base}/who-blocks?of=alice.bsky.social&target=bob.bsky.social&scope=mutuals` },
      { path: '/api/gc/blockers', params: { subject: 'handle|did', page: 'int ≥1 (default 1, 100/page)' }, returns: 'all users blocking subject', source: 'clearsky', example: `${base}/blockers?subject=bob.bsky.social&page=1` },
    ],
    attribution: 'Network-wide blocker data via clearsky.services.',
  };
}

export const GC_LIMITS = LIMITS;
