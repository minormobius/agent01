// palm/share.js — post the card to Bluesky, through the shared OAuth worker.
//
// THE RULE THIS ENFORCES: you may only post a card for the account you are
// signed in as. `com.atproto.sync.getRepo` is public, so anyone's palm can be
// READ — but publishing a reading about someone else, under a number that looks
// like a verdict, is the harassment vector the page warns about. Reading is
// open; making a claim is not. That is a check in code here, not a line of copy.
//
// The auth library is imported LAZILY and only on the first share attempt, so a
// visit that just reads a palm never loads it — the same rule lathe applies to
// read-only toys. It is staged into the assets dir at deploy time by
// deploy-b.yml (and gitignored under b/), so this import cannot be resolved in
// the sandbox; the failure path is a message, not a broken page.

import { svgToPng } from './radar.js';
import { linkFacets, textLength } from '../coin/compose.js';

// Exactly what posting a card needs and nothing else, so the consent screen is
// two lines. Blob scope is asked for at sign-in rather than escalated later,
// because an escalation redirect mid-share would drop the rendered card.
export const PALM_SCOPE = 'atproto repo:app.bsky.feed.post blob:image/*';

const BLOB_MAX = 950_000;                 // Bluesky rejects blobs around 1 MB
const POST_MAX = 300;                     // graphemes
const PENDING = 'palm:share-intent';

let authPromise = null;

/** The shared AuthClient, loaded on demand. */
export function getAuth() {
  if (!authPromise) {
    authPromise = import('/packages/oauth-client/auth.js')
      .then(async (m) => {
        const auth = new m.AuthClient();
        await auth.init().catch(() => {});
        return auth;
      })
      .catch(() => { authPromise = null; throw new Error('the sign-in library is not available here'); });
  }
  return authPromise;
}

// ── the card as a blob ───────────────────────────────────────────────────────
// PNG rather than JPEG: the card is flat colour and hard edges, which JPEG turns
// to mush exactly where the numbers are. Step the RESOLUTION down until it fits
// the blob ceiling instead of stepping quality down.
//
// The ladder starts at 800, not at the card's native 1080, because 1080 does not
// fit and never will: measured at 1258 KB against a 950 KB ceiling, since the
// radial background is a gradient and gradients are what PNG compresses worst.
// Starting high would mean every share paid for a doomed render first. 800 lands
// around 740 KB with real headroom; the rest of the ladder is there for a card
// whose text happens to run longer.
const SIZES = [800, 680, 560];

async function cardBlob(svg) {
  let last = null;
  for (const size of SIZES) {
    const blob = await svgToPng(svg, size);
    last = { blob, size };
    if (blob.size <= BLOB_MAX) return last;
  }
  return last;
}

// ── what the post says ───────────────────────────────────────────────────────
export function cardText(scored, handle, postCount) {
  const url = `https://b.mino.mobi/palm/?u=${encodeURIComponent(handle)}`;
  const lines = scored.axes.map((a) => `${a.label.toLowerCase()} ${a.pct === null ? '—' : Math.round(a.pct)}`).join(' · ');
  const n = postCount.toLocaleString('en-US');

  // Longest first; fall back as the grapheme budget runs out. A truncated
  // disclaimer is worse than a shorter post, so the "not a detector" clause is
  // the last thing dropped and the link is never dropped at all.
  const candidates = [
    `${scored.composite} — ${scored.band.name}.\n\n${lines}\n\nSix lines read off all ${n} of my posts. A percentile among ${scored.pool} accounts, not an AI detector.\n\n${url}`,
    `${scored.composite} — ${scored.band.name}.\n\n${lines}\n\nRead off all ${n} of my posts. A percentile, not an AI detector.\n\n${url}`,
    `${scored.composite} — ${scored.band.name}.\n\n${lines}\n\nA percentile, not an AI detector.\n\n${url}`,
    `${scored.composite} — ${scored.band.name}.\n\n${url}`,
  ];
  return candidates.find((t) => textLength(t) <= POST_MAX) || candidates[candidates.length - 1];
}

/** Alt text carries the same numbers, and the same caveat, for anyone who cannot see the card. */
export function cardAlt(scored, handle) {
  const spokes = scored.axes
    .map((a) => `${a.label} (${a.gloss}) ${a.pct === null ? 'unmeasured' : Math.round(a.pct) + 'th percentile'}`)
    .join('; ');
  return `A six-spoke radar chart of stylometric readings for @${handle}. ${spokes}. `
    + `Composite ${scored.composite} of 100, "${scored.band.name}". `
    + `The scale runs from Pan (least machine-like) to the Loom (most). `
    + `These are percentiles among ${scored.pool} real accounts, not a probability that anything was machine-written.`;
}

// ── the share intent, across the sign-in redirect ────────────────────────────
// Signing in navigates away and comes back, so the fact that you were trying to
// share has to outlive the page. It is a FLAG, not an instruction: on return the
// reading re-runs (instantly, from the IndexedDB cache) and the button is left
// armed. Posting to someone's account without a second click would be wrong
// however clearly they asked for it a redirect ago.
export function rememberIntent(handle) {
  try { sessionStorage.setItem(PENDING, handle); } catch { /* private mode */ }
}
export function takeIntent() {
  try {
    const v = sessionStorage.getItem(PENDING);
    if (v) sessionStorage.removeItem(PENDING);
    return v;
  } catch { return null; }
}

/**
 * Sign in as `handle` for the sole purpose of posting its own card.
 * Navigates away; the page comes back through the OAuth callback.
 */
export async function signIn(handle) {
  const auth = await getAuth();
  rememberIntent(handle);
  await auth.login(String(handle).replace(/^@/, ''), { scope: PALM_SCOPE });
}

/**
 * Post the card. Refuses unless the signed-in DID is the DID that was read.
 * @returns {Promise<{uri, cid, blobBytes, size}>}
 */
export async function postCard({ svg, scored, handle, did, postCount }) {
  const auth = await getAuth();

  const user = auth.getUser();
  if (!user) throw new Error('not signed in');
  if (user.did !== did) {
    throw new Error('you can only post your own palm — signed in as a different account');
  }
  if (!auth.hasScope('app.bsky.feed.post')) await auth.ensureScope(PALM_SCOPE);

  const { blob, size } = await cardBlob(svg);
  if (blob.size > BLOB_MAX) throw new Error('the card came out too large to upload');

  const blobRef = await auth.pds.uploadBlob(await blob.arrayBuffer(), 'image/png');
  const text = cardText(scored, handle, postCount);

  const record = {
    $type: 'app.bsky.feed.post',
    text,
    createdAt: new Date().toISOString(),
    langs: ['en'],
    embed: {
      $type: 'app.bsky.embed.images',
      images: [{
        alt: cardAlt(scored, handle),
        image: blobRef,
        aspectRatio: { width: size, height: size },
      }],
    },
  };
  const facets = linkFacets(text);
  if (facets.length) record.facets = facets;

  const res = await auth.pds.createRecord('app.bsky.feed.post', record);
  return { ...res, blobBytes: blob.size, size };
}
