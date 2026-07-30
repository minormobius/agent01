// bsky.mjs — the small part of ATProto that a posting script actually needs.
//
// Extracted from the primitives in scripts/bsky-hello.mjs so the ideas bot does
// not carry a third copy. Deliberately narrow: log in, build facets, create a
// post. Anything richer belongs in packages/atproto/pds.js.
//
// Pure functions (facets, graphemes, renderPost) are separated from the network
// so scripts/lib/bsky.selftest.mjs can drive them on a bare `node` run.

export const PDS = 'https://bsky.social/xrpc';
export const APPVIEW = 'https://public.api.bsky.app/xrpc';

/** Bluesky counts graphemes, not UTF-16 code units, and the limit is 300.
 *  `"é".length` and `[..."é"].length` disagree for combining sequences, and
 *  emoji make it worse — so count the way the server does. */
export function graphemes(text) {
  if (typeof Intl?.Segmenter === 'function') {
    return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length;
  }
  return [...text].length; // node without ICU — over-counts combining marks, never under
}

/** Rich-text facets, by BYTE offset into the UTF-8 encoding — not the string.
 *  Without these a URL is inert text and a @handle is not a link.
 *
 *  Throws on a target that is missing or appears twice: a facet applied to the
 *  wrong occurrence is a link pointing somewhere the author did not choose, and
 *  silently picking the first match is how that happens. */
export function facets(text, links = {}, mentions = {}) {
  const buf = Buffer.from(text, 'utf8');
  const out = [];
  const at = (needle) => {
    const n = Buffer.from(needle, 'utf8');
    const i = buf.indexOf(n);
    if (i === -1) throw new Error(`facet target not found in text: ${needle}`);
    if (buf.indexOf(n, i + 1) !== -1) throw new Error(`facet target is ambiguous (appears twice): ${needle}`);
    return { byteStart: i, byteEnd: i + n.length };
  };
  for (const [needle, uri] of Object.entries(links)) {
    out.push({ index: at(needle), features: [{ $type: 'app.bsky.richtext.facet#link', uri }] });
  }
  for (const [needle, did] of Object.entries(mentions)) {
    out.push({ index: at(needle), features: [{ $type: 'app.bsky.richtext.facet#mention', did }] });
  }
  return out.sort((a, b) => a.index.byteStart - b.index.byteStart);
}

export async function xrpc(base, method, { token, body, params } = {}) {
  const url = new URL(`${base}/${method}`);
  for (const [k, v] of Object.entries(params || {})) url.searchParams.set(k, v);
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${res.status}: ${json.error || ''} ${json.message || ''}`.trim());
  return json;
}

export async function login(handle, appPassword) {
  const session = await xrpc(PDS, 'com.atproto.server.createSession', {
    body: { identifier: handle, password: appPassword },
  });
  // The handle in the secret is a label; the session is the truth. One handle has
  // already changed hands on this project once (see workers/bsky-bot/CLAUDE.md),
  // so report the mismatch rather than assuming the secret is right.
  if (session.handle !== handle) {
    console.log(`::warning::secret says "${handle}" but the account answers to "${session.handle}"`);
  }
  return session;
}

/** An app.bsky.embed.external card. A CARD IS NOT TEXT, and that distinction is
 *  the whole reason this exists: an inline `arxiv.org/abs/2607.26034` costs 24
 *  graphemes of a 300-grapheme budget, and the first real review run lost all
 *  four of its concepts to overshooting by 7 to 19. An embed costs zero. The
 *  citation stops competing with the idea for room.
 *
 *  Bluesky does NOT fetch Open Graph tags — the client composing the post
 *  supplies the card — which is why the title and description are passed in
 *  rather than discovered. bsky-reply.mjs has done this for the "it's live"
 *  replies from the start; this is the same shape for the outbound half.
 * @param {{uri: string, title: string, description: string}} card */
export function externalEmbed({ uri, title, description }) {
  if (!uri || !title) throw new Error('an external embed needs at least a uri and a title');
  return {
    $type: 'app.bsky.embed.external',
    // Bluesky truncates both in the rendered card; trimming here keeps the
    // record honest about what it is actually claiming to show.
    external: { uri, title: title.slice(0, 300), description: (description || uri).slice(0, 1000) },
  };
}

export async function createPost(session, { text, links = {}, mentions = {}, embed = null }) {
  const len = graphemes(text);
  if (len > 300) throw new Error(`post is ${len} graphemes, limit is 300`);
  const created = await xrpc(PDS, 'com.atproto.repo.createRecord', {
    token: session.accessJwt,
    body: {
      repo: session.did,
      collection: 'app.bsky.feed.post',
      record: {
        $type: 'app.bsky.feed.post',
        text,
        createdAt: new Date().toISOString(),
        facets: facets(text, links, mentions),
        ...(embed ? { embed } : {}),
      },
    },
  });
  const rkey = created.uri.split('/').pop();
  return { uri: created.uri, cid: created.cid, rkey, url: `https://bsky.app/profile/${session.handle}/post/${rkey}`, graphemes: len };
}
