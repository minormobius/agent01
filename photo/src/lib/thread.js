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
 * Fetch a full thread from the public API.
 * Returns the thread tree with all replies.
 */
export async function fetchThread(uri, { depth = 100, parentHeight = 100 } = {}) {
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
 * Flatten a thread tree into a linear array of posts, ordered chronologically.
 * Each post includes: uri, cid, author, record, embed, replyCount, likeCount, repostCount, depth.
 *
 * The root is depth 0. Direct replies are depth 1, etc.
 * We walk the tree depth-first to produce a reading-order list.
 */
export function flattenThread(thread) {
  const posts = [];

  // Walk parent chain first (above the target post)
  const ancestors = [];
  let node = thread.parent;
  while (node && node.$type === 'app.bsky.feed.defs#threadViewPost') {
    ancestors.push(node);
    node = node.parent;
  }
  ancestors.reverse();

  // Add ancestors
  for (const a of ancestors) {
    posts.push(normalizePost(a, posts.length));
  }

  // Add the target post
  if (thread.$type === 'app.bsky.feed.defs#threadViewPost') {
    posts.push(normalizePost(thread, posts.length));

    // Walk replies depth-first
    walkReplies(thread, posts);
  }

  return posts;
}

function walkReplies(node, posts) {
  if (!node.replies || node.replies.length === 0) return;

  // Sort replies by creation date
  const sorted = [...node.replies]
    .filter(r => r.$type === 'app.bsky.feed.defs#threadViewPost')
    .sort((a, b) => {
      const ta = a.post?.record?.createdAt || '';
      const tb = b.post?.record?.createdAt || '';
      return ta.localeCompare(tb);
    });

  for (const reply of sorted) {
    posts.push(normalizePost(reply, posts.length));
    walkReplies(reply, posts);
  }
}

function normalizePost(node, index) {
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
    text: post.record?.text || '',
    createdAt: post.record?.createdAt || '',
    facets: post.record?.facets || [],
    embed: post.embed || null,
    likeCount: post.likeCount || 0,
    repostCount: post.repostCount || 0,
    replyCount: post.replyCount || 0,
    // Preserve reply ref for threading UI
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
