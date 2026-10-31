/**
 * What sharing a dweet asks the authorization server for, and how to tell
 * whether it was granted.
 *
 * Written after an infinite sign-in loop (2026-09-25): a moving post asked for
 * `rpc:com.atproto.server.getServiceAuth`, and that string can never be
 * granted. Two reasons, both read out of the atproto source rather than
 * guessed:
 *
 *  1. `RpcPermission` REQUIRES an `aud` parameter
 *     (packages/oauth/oauth-scopes/src/scopes/rpc-permission.ts). Without one
 *     the parser returns null, the server drops the token from the grant, the
 *     page sees it missing, and escalates again. Forever.
 *  2. It names the wrong method anyway. The PDS's `getServiceAuth` authorizes
 *     with `permissions.assertRpc({ aud, lxm })` for the token being MINTED
 *     (packages/pds/src/api/com/atproto/server/getServiceAuth.ts). So the
 *     scope is `rpc:<the method the token is for>?aud=<its audience>`.
 *
 * `aud` in a scope must be `*` or a `did#service` reference, and it is
 * compared to the minted token's `aud` string exactly. The tokens here are
 * minted for bare DIDs (the video service, the reader's PDS), which no
 * `did#…` value can equal, so these are `aud=*`: one method, any audience.
 * (Only `rpc:*?aud=*` is forbidden.)
 *
 * Pure, so `scopes.selftest.mjs` pins every rule in node.
 */

/** A still: one post, one picture. Both tokens are in the live ceiling. */
export const STILL_SCOPES = ['repo:app.bsky.feed.post', 'blob:image/*'];

/**
 * A moving post also mints two service-auth tokens, exactly as the official
 * client does (social-app src/lib/media/video/upload.shared.ts):
 *   getUploadLimits  aud did:web:video.bsky.app
 *   uploadBlob       aud did:web:<the reader's PDS host>  — the video service
 *                    uses it to write the blob into the reader's own repo
 */
export const LIMITS_LXM = 'app.bsky.video.getUploadLimits';
export const UPLOAD_LXM = 'com.atproto.repo.uploadBlob';
export const VIDEO_SCOPES = [
  ...STILL_SCOPES,
  `rpc:${LIMITS_LXM}?aud=*`,
  `rpc:${UPLOAD_LXM}?aud=*`,
];

/** `prefix[:positional][?params]` → parts. Mirrors ScopeStringSyntax.fromString. */
export function parseScope(token) {
  const s = String(token);
  const q = s.indexOf('?');
  const c = s.indexOf(':');
  const end = [q, c].filter((i) => i !== -1).reduce((a, b) => Math.min(a, b), Infinity);
  if (end === Infinity) return { prefix: s, positional: undefined, params: new URLSearchParams() };
  const prefix = s.slice(0, end);
  let positional;
  if (c !== -1 && (q === -1 || c < q)) {
    positional = decodeURIComponent(q === -1 ? s.slice(c + 1) : s.slice(c + 1, q));
  }
  const params = new URLSearchParams(q !== -1 ? s.slice(q + 1) : '');
  return { prefix, positional, params };
}

/** The values of a multi-valued param, with the positional folded in. */
const values = (p, key) => [...(p.positional !== undefined ? [p.positional] : []), ...p.params.getAll(key)];

const mimeCovers = (have, want) => {
  if (have === '*/*' || have === want) return true;
  if (have.endsWith('/*')) return want.startsWith(have.slice(0, -1));
  return false;
};

/**
 * Does one granted token cover one required token? Semantically, not by
 * string — an authorization server is free to hand a scope back in an
 * equivalent form (merged `lxm` lists, reordered params), and a byte compare
 * would read that as missing and loop.
 */
export function tokenCovers(granted, required) {
  if (granted === required) return true;
  const g = parseScope(granted);
  const r = parseScope(required);
  if (g.prefix === 'transition' && g.positional === 'generic') {
    // The app-password-equivalent grant: repo writes, blobs, and service auth
    // for anything but chat.
    if (r.prefix === 'repo' || r.prefix === 'blob') return true;
    if (r.prefix === 'rpc') return !values(r, 'lxm').some((l) => l.startsWith('chat.bsky.'));
    return false;
  }
  if (g.prefix !== r.prefix) return false;
  if (r.prefix === 'repo') {
    const gc = values(g, 'collection');
    const gActions = g.params.getAll('action');
    const rActions = r.params.getAll('action');
    const all = ['create', 'update', 'delete'];
    const have = gActions.length ? gActions : all;
    const want = rActions.length ? rActions : all;
    return values(r, 'collection').every((c) => gc.includes('*') || gc.includes(c))
      && want.every((a) => have.includes(a));
  }
  if (r.prefix === 'blob') {
    const ga = values(g, 'accept');
    return values(r, 'accept').every((w) => ga.some((h) => mimeCovers(h, w)));
  }
  if (r.prefix === 'rpc') {
    const gl = values(g, 'lxm');
    const gAud = g.params.get('aud');
    const rAud = r.params.get('aud');
    const audOk = gAud === '*' || (gAud != null && gAud === rAud);
    return audOk && values(r, 'lxm').every((l) => gl.includes('*') || gl.includes(l));
  }
  return false;
}

/** The required tokens the granted scope string does NOT cover. */
export function missing(grantedScope, required) {
  const have = String(grantedScope || '').split(/\s+/).filter(Boolean);
  return required.filter((r) => !have.some((g) => tokenCovers(g, r)));
}

/**
 * Required tokens the auth worker's ceiling does not list. The authorization
 * server grants nothing outside client-metadata.json, and it matches that list
 * by string — so this one IS a string compare, deliberately.
 */
export function beyondCeiling(ceilingScope, required) {
  const ceiling = new Set(String(ceilingScope || '').split(/\s+/).filter(Boolean));
  return required.filter((t) => !ceiling.has(t));
}

/**
 * The loop breaker. An escalation is a redirect; if we come back from one and
 * the grant STILL does not cover what we asked for, asking again can only
 * produce the same answer. So one escalation per need per window, recorded
 * across the redirect, and after that the page says what was refused.
 *
 * `store` is sessionStorage in the page (injected for the selftest). Every
 * access is guarded: storage that throws must degrade to "ask once", never
 * to "ask forever".
 */
const ESCALATION_KEY = 'dweet.escalated';
const ESCALATION_WINDOW_MS = 10 * 60 * 1000;

export function recentlyEscalated(store, required, now = Date.now()) {
  try {
    const rec = JSON.parse(store.getItem(ESCALATION_KEY) || 'null');
    return !!rec && rec.need === required.join(' ') && now - rec.at < ESCALATION_WINDOW_MS;
  } catch { return false; }
}
export function markEscalated(store, required, now = Date.now()) {
  try { store.setItem(ESCALATION_KEY, JSON.stringify({ need: required.join(' '), at: now })); } catch { /* ask once anyway */ }
}
export function clearEscalated(store) {
  try { store.removeItem(ESCALATION_KEY); } catch { /* nothing to clear */ }
}

/** `did:web:<host>` for a PDS URL — the audience of an uploadBlob token. */
export function pdsAudience(pdsUrl) {
  return `did:web:${new URL(pdsUrl).hostname}`;
}
