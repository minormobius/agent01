// Thread fetching: resolve a Bluesky post URL or AT-URI to a full thread tree
// Uses the public API — no auth needed for reading

const PUBLIC_API = 'https://public.api.bsky.app';

/**
 * Parse a Bluesky post URL or AT-URI into an AT-URI.
 * Accepts:
 *   - https://bsky.app/profile/{handle}/post/{rkey}
 *   - at://did:plc:xxx/app.bsky.feed.post/rkey
 */
export function parsePostInput(input) {
  input = input.trim();

  // Already an AT-URI
  if (input.startsWith('at://')) return { uri: input };

  // bsky.app URL
  const m = input.match(/bsky\.app\/profile\/([^/]+)\/post\/([^/?#]+)/);
  if (m) {
    const [, handleOrDid, rkey] = m;
    return { handleOrDid, rkey };
  }

  return null;
}

/**
 * Resolve a parsed input to a full AT-URI.
 */
export async function resolvePostUri({ uri, handleOrDid, rkey }) {
  if (uri) return uri;

  // Need to resolve handle to DID
  let did = handleOrDid;
  if (!did.startsWith('did:')) {
    const res = await fetch(
      `${PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(did)}`
    );
    if (!res.ok) throw new Error(`Could not resolve handle: ${did}`);
    const data = await res.json();
    did = data.did;
  }

  return `at://${did}/app.bsky.feed.post/${rkey}`;
}

/**
 * Fetch a single page of thread data from the public API.
 */
async function fetchThreadPage(uri, { depth = 10, parentHeight = 100 } = {}) {
  const params = new URLSearchParams({
    uri,
    depth: String(depth),
    parentHeight: String(parentHeight),
  });

  const res = await fetch(
    `${PUBLIC_API}/xrpc/app.bsky.feed.getPostThread?${params}`
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch thread: ${res.status} ${text}`);
  }
  const data = await res.json();
  return data.thread;
}

/**
 * Fetch a full thread, chasing the OP's deepest reply chain.
 *
 * The API caps depth at ~10 per call. When we hit a truncated leaf
 * where the OP has replies, we re-fetch from that post to continue
 * deeper. Non-OP branches are kept but not chased.
 *
 * onProgress({ fetched, depth }) is called after each continuation fetch.
 */
export async function fetchThread(uri, { onProgress } = {}) {
  const root = await fetchThreadPage(uri, { depth: 10, parentHeight: 100 });

  // Determine the OP (root author of the thread)
  let opDid = null;
  if (root.$type === 'app.bsky.feed.defs#threadViewPost') {
    // Walk up to the true root
    let top = root;
    while (top.parent && top.parent.$type === 'app.bsky.feed.defs#threadViewPost') {
      top = top.parent;
    }
    opDid = top.post?.author?.did;
  }

  if (!opDid) return root;

  // Chase the OP's deepest path by re-fetching from truncated leaves
  const seen = new Set();
  let fetches = 1;

  async function chaseOpReplies(node) {
    if (!node || node.$type !== 'app.bsky.feed.defs#threadViewPost') return;
    if (seen.has(node.post?.uri)) return;
    seen.add(node.post?.uri);

    const replies = node.replies || [];

    // Find OP's replies among children
    const opReplies = replies.filter(
      r => r.$type === 'app.bsky.feed.defs#threadViewPost' && r.post?.author?.did === opDid
    );

    // For each OP reply, check if it has replies that need chasing
    for (const reply of opReplies) {
      await chaseOpReplies(reply);
    }

    // If no OP replies but the OP has a replyCount > 0 at a leaf, or
    // if we see OP replies that themselves have replyCount but no replies array,
    // we need to continue fetching
    for (let i = 0; i < replies.length; i++) {
      const reply = replies[i];
      if (reply.$type !== 'app.bsky.feed.defs#threadViewPost') continue;
      if (reply.post?.author?.did !== opDid) continue;

      const hasChildren = reply.replies && reply.replies.length > 0;
      const expectsChildren = reply.post?.replyCount > 0;

      if (!hasChildren && expectsChildren && !seen.has('fetched:' + reply.post.uri)) {
        seen.add('fetched:' + reply.post.uri);
        fetches++;
        if (onProgress) onProgress({ fetched: fetches });

        try {
          const deeper = await fetchThreadPage(reply.post.uri, { depth: 10, parentHeight: 0 });
          if (deeper.$type === 'app.bsky.feed.defs#threadViewPost') {
            // Graft the deeper replies onto this node
            reply.replies = deeper.replies || [];
            // Continue chasing from the new data
            await chaseOpReplies(reply);
          }
        } catch {
          // If a continuation fetch fails, keep what we have
        }
      }
    }
  }

  await chaseOpReplies(root);
  return root;
}

/**
 * Flatten a thread tree into a linear array of posts.
 *
 * Prioritizes the OP's self-reply chain: at each level, OP replies are
 * walked first (sorted by date), then non-OP replies. This produces a
 * reading order where the OP's narrative runs uninterrupted at the top,
 * with other participants' replies collected after.
 *
 * The `isOp` flag on each normalized post marks OP authorship for UI styling.
 */
export function flattenThread(thread) {
  const posts = [];

  // Determine OP
  let opDid = null;
  let top = thread;
  while (top.parent && top.parent.$type === 'app.bsky.feed.defs#threadViewPost') {
    top = top.parent;
  }
  if (top.$type === 'app.bsky.feed.defs#threadViewPost') {
    opDid = top.post?.author?.did;
  }

  // Walk parent chain first (above the target post)
  const ancestors = [];
  let node = thread.parent;
  while (node && node.$type === 'app.bsky.feed.defs#threadViewPost') {
    ancestors.push(node);
    node = node.parent;
  }
  ancestors.reverse();

  for (const a of ancestors) {
    posts.push(normalizePost(a, posts.length, opDid));
  }

  // Add the target post and walk replies
  if (thread.$type === 'app.bsky.feed.defs#threadViewPost') {
    posts.push(normalizePost(thread, posts.length, opDid));
    walkReplies(thread, posts, opDid);
  }

  return posts;
}

function walkReplies(node, posts, opDid) {
  if (!node.replies || node.replies.length === 0) return;

  const valid = node.replies.filter(
    r => r.$type === 'app.bsky.feed.defs#threadViewPost'
  );

  // Partition: OP replies first, then others
  const opReplies = valid
    .filter(r => r.post?.author?.did === opDid)
    .sort((a, b) => (a.post?.record?.createdAt || '').localeCompare(b.post?.record?.createdAt || ''));

  const otherReplies = valid
    .filter(r => r.post?.author?.did !== opDid)
    .sort((a, b) => (a.post?.record?.createdAt || '').localeCompare(b.post?.record?.createdAt || ''));

  // Walk OP chain first (uninterrupted narrative)
  for (const reply of opReplies) {
    posts.push(normalizePost(reply, posts.length, opDid));
    walkReplies(reply, posts, opDid);
  }

  // Then other replies
  for (const reply of otherReplies) {
    posts.push(normalizePost(reply, posts.length, opDid));
    walkReplies(reply, posts, opDid);
  }
}

function normalizePost(node, index, opDid) {
  const post = node.post;
  return {
    index,
    uri: post.uri,
    cid: post.cid,
    author: {
      did: post.author.did,
      handle: post.author.handle,
      displayName: post.author.displayName || post.author.handle,
      avatar: post.author.avatar,
    },
    isOp: post.author.did === opDid,
    text: post.record?.text || '',
    createdAt: post.record?.createdAt || '',
    facets: post.record?.facets || [],
    embed: post.embed || null,
    likeCount: post.likeCount || 0,
    repostCount: post.repostCount || 0,
    replyCount: post.replyCount || 0,
    replyTo: post.record?.reply?.parent?.uri || null,
  };
}

/**
 * Extract all media items from a post's embed.
 * Returns array of { type, ...data } objects.
 */
export function extractMedia(embed) {
  if (!embed) return [];
  const items = [];

  const processEmbed = (emb) => {
    if (!emb) return;

    const t = emb.$type;

    // Images
    if (t === 'app.bsky.embed.images#view') {
      for (const img of emb.images || []) {
        items.push({
          type: 'image',
          thumb: img.thumb,
          fullsize: img.fullsize,
          alt: img.alt || '',
          aspectRatio: img.aspectRatio || null,
        });
      }
    }

    // Video
    if (t === 'app.bsky.embed.video#view') {
      items.push({
        type: 'video',
        thumbnail: emb.thumbnail,
        playlist: emb.playlist, // HLS m3u8 URL
        alt: emb.alt || '',
        aspectRatio: emb.aspectRatio || null,
        cid: emb.cid,
      });
    }

    // External link (preview card)
    if (t === 'app.bsky.embed.external#view') {
      const ext = emb.external;
      if (ext) {
        items.push({
          type: 'external',
          uri: ext.uri,
          title: ext.title || '',
          description: ext.description || '',
          thumb: ext.thumb || null,
        });
      }
    }

    // Quote post (record embed)
    if (t === 'app.bsky.embed.record#view') {
      const rec = emb.record;
      if (rec && rec.$type === 'app.bsky.embed.record#viewRecord') {
        items.push({
          type: 'quote',
          uri: rec.uri,
          cid: rec.cid,
          author: {
            did: rec.author?.did,
            handle: rec.author?.handle,
            displayName: rec.author?.displayName || rec.author?.handle,
            avatar: rec.author?.avatar,
          },
          text: rec.value?.text || '',
          createdAt: rec.value?.createdAt || '',
          embeds: rec.embeds ? rec.embeds.flatMap(e => extractMedia(e)) : [],
        });
      }
    }

    // Record with media (quote + images/video)
    if (t === 'app.bsky.embed.recordWithMedia#view') {
      processEmbed(emb.media);
      processEmbed(emb.record);
    }
  };

  processEmbed(embed);
  return items;
}
