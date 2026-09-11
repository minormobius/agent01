/**
 * Shuffle quote — one thread of yours, quoting one of theirs per post.
 *
 * A repost passes a post on. A quote passes it on with a sentence attached.
 * Neither of them is what you want when somebody posts a SEVEN-POST THREAD and
 * you have a different thing to say about each of the seven. The choices today
 * are all bad: quote the root and write one lump about all of it, quote one
 * post and drop the other six, or reply seven times inside their thread, where
 * your reactions are scattered down somebody else's replies and nobody who
 * follows you ever sees them in order.
 *
 * A shuffle quote is the missing shape. It builds ONE thread in YOUR repo:
 *
 *     you #1   quotes  them #1
 *       ↳ you #2   quotes  them #2
 *           ↳ you #3   quotes  them #3
 *
 * Each of your posts is an ordinary `app.bsky.feed.post` carrying BOTH an
 * `app.bsky.embed.record` (the quote) and a `reply` (onto your own previous
 * post). Nothing here is a new lexicon or a new kind of record — every client
 * on the network already renders a quote-reply, which is the whole reason this
 * works as a "repost style" rather than as a feature only this app can show.
 *
 * The name is literal. The targets are a DECK: you drop the ones you have
 * nothing to say about, reorder the rest, and deal them out. Thread order is
 * only the default.
 *
 * ─── what this module owns, and what it deliberately does not ───
 *
 * Everything here is pure or injected, so `lib/shuffle.selftest.mjs` can run
 * the whole publish path in node with a fake `publish`. That matters more than
 * usual: the failure this code has to get right is a PARTIAL publish, and a
 * partial publish cannot be rehearsed against a real PDS — the rehearsal is
 * public. So `publish` is a parameter, never an import.
 */

/**
 * The hard cap on one shuffle.
 *
 * Not a rate limit — a PDS will take far more than this — but a judgement: past
 * roughly two dozen posts you are not reacting to a thread any more, you are
 * writing a thread of your own, and the composer stops being the right tool.
 * A capped plan says so rather than silently truncating.
 */
export const MAX_STEPS = 25;

/**
 * Flatten a `getThread()` result into one ordered list: ancestors (oldest
 * first), the focused post, then the replies depth-first as sources.js
 * flattened them.
 *
 * Deduped by URI, because the focused post appears in the ancestor walk of
 * nothing but is trivially easy to double up when a caller passes a thread it
 * has already massaged.
 *
 * @param {{ancestors: object[], post: object, replies: object[]}} thread
 * @returns {object[]}
 */
export function threadPosts(thread) {
  const out = [];
  const seen = new Set();
  for (const p of [...(thread?.ancestors || []), thread?.post, ...(thread?.replies || [])]) {
    if (!p?.uri || seen.has(p.uri)) continue;
    seen.add(p.uri);
    out.push(p);
  }
  return out;
}

/**
 * A quote needs the quoted post's CID, exactly like a like does —
 * `app.bsky.embed.record` with only a URI is rejected by the PDS. A target
 * without one cannot be dealt, and finding that out AFTER the reader has
 * written twelve reactions is the worst possible moment.
 *
 * @param {object} p
 * @returns {boolean}
 */
export function quotable(p) {
  return Boolean(p?.uri && p?.cid);
}

/**
 * Which posts get selected when the sheet opens.
 *
 * The case this feature exists for is a self-thread — one person, seven posts —
 * so the default is THAT AUTHOR'S posts, in thread order. Tap shuffle anywhere
 * in a tweetstorm and you get the tweetstorm.
 *
 * When the focused author has only the one post in the thread you are not
 * looking at a self-thread, you are looking at a conversation, and the useful
 * default is everybody: reacting to each participant in turn is the same shape
 * with a different deck.
 *
 * @param {object[]} posts - from threadPosts()
 * @param {string} focusUri - the post the reader tapped
 * @returns {object[]}
 */
export function defaultTargets(posts, focusUri) {
  const usable = posts.filter(quotable);
  const focus = usable.find((p) => p.uri === focusUri) || usable[0];
  if (!focus) return [];
  const mine = usable.filter((p) => p.did === focus.did);
  return mine.length > 1 ? mine : usable;
}

/**
 * Build the opening plan for a thread.
 *
 * `dropped` and `capped` are returned rather than swallowed. A composer that
 * quietly shows eight cards for an eleven-post thread is lying about what it is
 * about to publish, and the reader has no way to notice.
 *
 * @param {object} thread - a getThread() result
 * @param {string} focusUri
 * @returns {{posts: object[], steps: object[], dropped: number, capped: number}}
 */
export function planFrom(thread, focusUri) {
  const posts = threadPosts(thread);
  const chosen = defaultTargets(posts, focusUri);
  const capped = Math.max(0, chosen.length - MAX_STEPS);
  return {
    posts,
    steps: chosen.slice(0, MAX_STEPS).map(stepFor),
    dropped: posts.length - posts.filter(quotable).length,
    capped,
  };
}

/**
 * One card in the composer: a target, the text you will say about it, and
 * whatever has happened to it so far.
 *
 * `posted` is the load-bearing field. It is what makes a half-published shuffle
 * resumable instead of duplicable — see postShuffle().
 *
 * @param {object} p - a post from the thread
 * @returns {object}
 */
export function stepFor(p) {
  return {
    target: {
      uri: p.uri,
      cid: p.cid,
      did: p.did,
      handle: p.author?.handle || '',
      text: p.record?.text || '',
    },
    text: '',
    posted: null,
    error: null,
  };
}

/**
 * Where the next post in the chain attaches.
 *
 * A reply carries BOTH `root` and `parent`, and the root is the THREAD's root —
 * here, always your own first post, never the post you are quoting. Getting
 * this wrong detaches every post after the first in every client, and nothing
 * local will show you that it happened.
 *
 * The quote and the reply are independent: the quote points into their thread,
 * the reply points at your own previous post. Confusing the two would reply
 * into THEIR thread, which is a different (and much noisier) feature.
 *
 * @param {Array<{uri: string, cid: string}>} prior - your posts so far, in order
 * @returns {{uri: string, cid: string, root: {uri: string, cid: string}}|null}
 */
export function chain(prior) {
  if (!prior?.length) return null;
  const root = prior[0];
  const parent = prior[prior.length - 1];
  return { uri: parent.uri, cid: parent.cid, root: { uri: root.uri, cid: root.cid } };
}

/**
 * Publish the shuffle, one post at a time, and be resumable if it stops.
 *
 * SEQUENTIAL IS NOT A SIMPLIFICATION. Post n+1 replies to post n, so it cannot
 * be written until the PDS has answered with post n's `cid`. There is no
 * parallel version of this.
 *
 * WHAT HAPPENS WHEN IT BREAKS is the whole design. Halfway through a nine-post
 * shuffle the network drops, or the PDS rate-limits, and four posts are already
 * public. There is no undo for that, so the options are:
 *
 *   - retry the whole plan  → four duplicate posts, publicly
 *   - abandon it            → a thread that stops mid-sentence
 *   - CONTINUE from the break, chaining onto what actually landed
 *
 * Only the third is honest, and it is the only one this function offers. Each
 * step remembers its own `posted`, so calling postShuffle again with the same
 * array skips what is done, rebuilds the chain from it, and carries on. A step
 * that already landed is never republished, whatever else fails.
 *
 * It stops at the FIRST failure rather than skipping on. The chain is ordered:
 * continuing past a hole would silently attach your reaction to post 6 onto
 * your reaction to post 4, which reads as a missing post to everyone but you.
 *
 * @param {object[]} steps - from stepFor(); MUTATED with results as it goes
 * @param {object} opts
 * @param {(text: string, o: object) => Promise<{uri: string, cid: string}>} opts.publish
 * @param {(i: number, state: string, step: object) => void} [opts.onStep]
 * @param {number} [opts.delayMs] - breathing room between writes
 * @param {(ms: number) => Promise<void>} [opts.sleep]
 * @param {object} [opts.publishOpts] - merged into every publish call
 * @returns {Promise<{posted: number, failedAt: number, error: Error|null, done: boolean}>}
 */
export async function postShuffle(steps, opts = {}) {
  const {
    publish,
    onStep = () => {},
    delayMs = 400,
    sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
    publishOpts = {},
  } = opts;
  if (typeof publish !== 'function') throw new Error('postShuffle needs a publish()');
  if (!steps?.length) throw new Error('nothing to post');

  // Everything already on the network keeps its place in the chain. On a first
  // run this is empty; on a resume it is exactly the posts that landed.
  const prior = steps.filter((s) => s.posted).map((s) => s.posted);
  let posted = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.posted) continue;

    if (!quotable(step.target)) {
      const err = new Error('that post cannot be quoted — its cid is unknown here');
      step.error = err.message;
      onStep(i, 'failed', step);
      return { posted, failedAt: i, error: err, done: false };
    }

    step.error = null;
    onStep(i, 'posting', step);
    try {
      const res = await publish(step.text || '', {
        ...publishOpts,
        quote: { uri: step.target.uri, cid: step.target.cid },
        replyTo: chain(prior),
      });
      // A createRecord that answers without a cid cannot be replied to, so the
      // chain is already broken — say so here rather than letting the NEXT post
      // fail with a confusing validation error about a missing subject.
      if (!res?.uri || !res?.cid) throw new Error('the PDS returned no uri/cid — the chain cannot continue');
      step.posted = { uri: res.uri, cid: res.cid };
      prior.push(step.posted);
      posted++;
      onStep(i, 'done', step);
    } catch (err) {
      step.error = err?.message || String(err);
      onStep(i, 'failed', step);
      return { posted, failedAt: i, error: err, done: false };
    }

    if (delayMs && i < steps.length - 1) await sleep(delayMs);
  }

  return { posted, failedAt: -1, error: null, done: true };
}

/**
 * How far along a plan is, without re-deriving it at three call sites.
 *
 * @param {object[]} steps
 * @returns {{total: number, done: number, remaining: number, started: boolean, finished: boolean}}
 */
export function progress(steps) {
  const total = steps?.length || 0;
  const done = (steps || []).filter((s) => s.posted).length;
  return { total, done, remaining: total - done, started: done > 0, finished: total > 0 && done === total };
}
