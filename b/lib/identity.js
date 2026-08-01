// identity.js — handle → DID → PDS, and a public profile.
//
// Two unauthenticated calls against the public appview and plc.directory. Every
// tool here that has to reach an account's own server needs them, and they were
// being written out again in each one.
//
// Deliberately NOT a vendored copy of photo's `src/lib/resolve.js`, even though
// it does the same job: that file is bundled by Vite and this surface has no
// build step, so a byte-identical copy would carry a sync obligation
// (`scripts/sync-dataviz.mjs`) for forty lines of two fetch calls against a
// frozen public API. If a third surface needs it, promote it to `packages/`
// and vendor it properly — that is the point at which the bookkeeping pays.

const PUBLIC_API = 'https://public.api.bsky.app';
const PLC = 'https://plc.directory';

/** handle (or DID) → `{ did, handle, pdsUrl }`. */
export async function resolveHandle(input) {
  const raw = String(input || '').replace(/^@/, '').trim();
  if (!raw) throw new Error('no handle given');

  let did = raw;
  if (!raw.startsWith('did:')) {
    const res = await fetch(
      `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(raw)}`,
    );
    if (!res.ok) throw new Error(`no such handle: ${raw}`);
    ({ did } = await res.json());
  }
  return { did, handle: raw, pdsUrl: await resolvePds(did) };
}

/** DID → the PDS that actually holds the repo. */
export async function resolvePds(did) {
  let doc;
  if (did.startsWith('did:plc:')) {
    const res = await fetch(`${PLC}/${did}`);
    if (!res.ok) throw new Error(`could not resolve ${did}`);
    doc = await res.json();
  } else if (did.startsWith('did:web:')) {
    const res = await fetch(`https://${did.slice('did:web:'.length)}/.well-known/did.json`);
    if (!res.ok) throw new Error(`could not resolve ${did}`);
    doc = await res.json();
  } else {
    throw new Error(`unsupported DID method: ${did}`);
  }
  const service = (doc.service || []).find((s) => s.id === '#atproto_pds');
  if (!service) throw new Error(`no PDS listed for ${did}`);
  return service.serviceEndpoint;
}

/** Avatar, display name, canonical handle. Never throws — it is decoration. */
export async function fetchProfile(actor) {
  try {
    const res = await fetch(`${PUBLIC_API}/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(actor)}`);
    if (!res.ok) return null;
    const p = await res.json();
    return { did: p.did, handle: p.handle, displayName: p.displayName || '', avatar: p.avatar || '' };
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────── showing a person ──

/**
 * The one way this surface names an account: avatar, then `@handle`.
 *
 * A DID is a key, not a name. `did:plc:cp5hnfgqbgjdbizyqyp4zgdl` tells a reader
 * nothing, does not fit a phone, and is not what they typed — yet two signed-in
 * bars here rendered `user.handle || user.did`, so the one case where the
 * fallback fires is the one case where the label is useless. This resolves
 * instead, and falls back to a *shortened* DID only if the network is gone.
 *
 * Returns a DOM node, and fills the avatar in asynchronously — the handle is
 * usually known immediately and should not wait on a picture.
 *
 * @param {{did?: string, handle?: string, avatar?: string}} who
 */
export function identityChip(who, { link = true } = {}) {
  const wrap = document.createElement('span');
  wrap.className = 'id-chip';
  const img = document.createElement('img');
  img.className = 'id-chip-av';
  img.alt = '';
  img.loading = 'lazy';
  img.hidden = true;
  const name = document.createElement(link ? 'a' : 'span');
  name.className = 'id-chip-name';
  if (link) { name.target = '_blank'; name.rel = 'noopener noreferrer'; }
  wrap.append(img, name);

  const set = (p) => {
    const handle = p?.handle || who.handle || shortDid(who.did);
    name.textContent = `@${handle}`;
    if (link) name.href = `https://bsky.app/profile/${p?.handle || who.handle || who.did || ''}`;
    if (p?.avatar) { img.src = p.avatar; img.hidden = false; }
  };
  set(who.avatar || who.handle ? who : null);
  const actor = who.handle || who.did;
  if (actor && !who.avatar) fetchProfile(actor).then((p) => { if (p) set(p); });
  return wrap;
}

/** `did:plc:cp5hnfgq…zgdl` — still a DID, but one that fits a line. */
export function shortDid(did) {
  const d = String(did || '');
  if (d.length <= 24) return d || 'unknown';
  return `${d.slice(0, 16)}…${d.slice(-4)}`;
}

/** The styles the chip needs, injected once. Themed off the host page's vars. */
export function ensureChipStyle() {
  if (document.getElementById('id-chip-style')) return;
  const st = document.createElement('style');
  st.id = 'id-chip-style';
  st.textContent = `
.id-chip{display:inline-flex;align-items:center;gap:.4rem;min-width:0}
.id-chip-av{width:20px;height:20px;border-radius:50%;object-fit:cover;flex-shrink:0}
.id-chip-name{color:inherit;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.id-chip-name:hover{text-decoration:underline}`;
  document.head.appendChild(st);
}
