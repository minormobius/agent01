// mappa/lib/world-share.js — turn a world into a shareable artifact and back.
//
// A mappa world is a pure function of its CONFIG = { seed, genome, n }, so the
// config IS the world — a few hundred bytes that regenerate the whole planet,
// deterministically, anywhere. Two transports:
//
//   • a URL permalink  (?w=<token>)  — zero auth, works today, the copy-link path
//   • an ATProto record (com.minomobi.mappa.world) — published to YOUR PDS via the
//     shared AuthClient; discovery later via a feed generator / a "best worlds" shelf
//
// The encode/decode + record-shaping is pure and node-testable. The PDS write is
// guarded (dynamic import of the shared OAuth client) so the share never breaks the
// engine if auth isn't present. DAG-CBOR has no float type, so the continuous genome
// knobs are stored as fixed-point integers (×1000) in the record and divided back.

import { resolveHandle, resolvePds } from '../../packages/atproto/pds.js';

export const COLLECTION = 'com.minomobi.mappa.world';

// genome fields, with how each maps to the fixed-point record form.
// scale 1000 → continuous knob stored as round(value*1000); scale 1 → integer.
const GENOME = {
  oceanFraction: 1000, waterFrac: 1000, axialTilt: 1000, rotationRate: 1000,
  solar: 1000, planetRadius: 1000, plateCount: 1, age: 1,
};

// ---- base64url that works in both node and the browser ----------------------
const b64uEnc = s => {
  const b = (typeof btoa !== 'undefined') ? btoa(unescape(encodeURIComponent(s)))
    : Buffer.from(s, 'utf8').toString('base64');
  return b.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64uDec = t => {
  const b = t.replace(/-/g, '+').replace(/_/g, '/');
  return (typeof atob !== 'undefined') ? decodeURIComponent(escape(atob(b)))
    : Buffer.from(b, 'base64').toString('utf8');
};

// strip null/undefined genome keys → only the overridden ("pinned") knobs travel
function cleanGenome(genome) {
  const g = {};
  if (genome) for (const k in GENOME) if (genome[k] != null) g[k] = genome[k];
  return g;
}

// ---- URL permalink ----------------------------------------------------------
// config { seed, genome, n } → opaque token; n omitted when default.
export function encodeConfig({ seed, genome, n } = {}) {
  const o = { s: seed >>> 0 };
  const g = cleanGenome(genome);
  if (Object.keys(g).length) o.g = g;
  if (n) o.n = n;
  return b64uEnc(JSON.stringify(o));
}
export function decodeConfig(token) {
  let o; try { o = JSON.parse(b64uDec(token)); } catch { return null; }
  if (o == null || typeof o.s !== 'number') return null;
  const genome = {};
  if (o.g) for (const k in GENOME) if (o.g[k] != null) genome[k] = o.g[k];
  return { seed: o.s >>> 0, genome, n: o.n || undefined };
}

// ---- ATProto record ---------------------------------------------------------
export function configToRecord(config, meta = {}) {
  const g = cleanGenome(config.genome), gi = {};
  for (const k in g) gi[k] = Math.round(g[k] * GENOME[k]);   // fixed-point
  const rec = {
    $type: COLLECTION,
    seed: config.seed >>> 0,
    createdAt: new Date().toISOString(),
  };
  if (Object.keys(gi).length) rec.genome = gi;
  if (config.n) rec.n = config.n;
  if (meta.title) rec.title = String(meta.title).slice(0, 120);
  if (meta.descriptor) rec.descriptor = String(meta.descriptor).slice(0, 240);
  if (typeof meta.score === 'number') rec.score = Math.max(0, Math.min(100, Math.round(meta.score)));
  if (meta.flags && meta.flags.length) rec.flags = meta.flags.slice(0, 12).map(String);
  if (meta.note) rec.note = String(meta.note).slice(0, 600);
  return rec;
}
export function recordToConfig(rec) {
  if (!rec || typeof rec.seed !== 'number') return null;
  const genome = {};
  if (rec.genome) for (const k in GENOME) if (rec.genome[k] != null) genome[k] = rec.genome[k] / GENOME[k];
  return { seed: rec.seed >>> 0, genome, n: rec.n || undefined };
}

// ---- PDS publish (browser, guarded) -----------------------------------------
// Uses the shared OAuth client (packages/oauth-client/auth.js). If the visitor is
// signed in anywhere on *.mino.mobi the SSO cookie carries here; otherwise this
// kicks off login. Returns { uri, cid } of the created record, or throws.
export async function publishWorld(config, meta, handleForLogin) {
  const { AuthClient } = await import('../../packages/oauth-client/auth.js');
  const auth = new AuthClient();
  await auth.init();
  if (!auth.getUser()) {
    if (!handleForLogin) throw new Error('sign-in required');
    await auth.login(handleForLogin); // redirects out; resumes via init() on return
    return null;
  }
  const rec = configToRecord(config, meta);
  return auth.pds.createRecord(COLLECTION, rec);
}

// ---- PDS load (public, no auth) ---------------------------------------------
// Accept an at:// URI or a handle/did + rkey; resolve the repo's PDS and read the
// record straight from com.atproto.repo.getRecord. Returns the decoded config + meta.
export async function loadWorld(ref, rkey) {
  let repo, rk = rkey;
  if (typeof ref === 'string' && ref.startsWith('at://')) {
    const m = ref.slice(5).split('/'); repo = m[0]; rk = m[2];
  } else repo = ref;
  const did = repo.startsWith('did:') ? repo : await resolveHandle(repo);
  const pds = await resolvePds(did);
  const url = `${pds}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}`
    + `&collection=${COLLECTION}&rkey=${encodeURIComponent(rk)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('record fetch failed: ' + res.status);
  const data = await res.json();
  const rec = data.value || data.record || data;
  return { config: recordToConfig(rec), record: rec, uri: data.uri || ref };
}

// list a repo's published worlds (newest first) — the discovery primitive.
// Returns [{ uri, rkey, config, record, title, descriptor, score }]. Public, no auth.
export async function listWorlds(repo, limit = 50) {
  const did = repo.startsWith('did:') ? repo : await resolveHandle(repo);
  const pds = await resolvePds(did);
  const url = `${pds}/xrpc/com.atproto.repo.listRecords?repo=${encodeURIComponent(did)}`
    + `&collection=${COLLECTION}&limit=${limit}&reverse=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('list failed: ' + res.status);
  const data = await res.json();
  return (data.records || []).map(r => ({
    uri: r.uri, rkey: (r.uri || '').split('/').pop(),
    config: recordToConfig(r.value), record: r.value,
    title: r.value.title, descriptor: r.value.descriptor, score: r.value.score,
  })).filter(x => x.config);
}
