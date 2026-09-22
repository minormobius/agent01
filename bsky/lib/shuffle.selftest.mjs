/**
 * Known-answer tests for lib/shuffle.js.
 *
 *   node bsky/lib/shuffle.selftest.mjs
 *
 * This file matters more than most of the suite, because the failures it covers
 * are PUBLIC and PERMANENT. A shuffle publishes real posts to a real repo, one
 * after another, and the two ways it can go wrong are:
 *
 *   - a bad chain — `root` or `parent` pointing at the wrong record. Every
 *     post after the first detaches, in every client, and NOTHING local shows
 *     it: the app has all the posts in hand and draws them in the order it
 *     already knows. You find out when somebody else opens the thread.
 *   - a bad resume — re-publishing a step that already landed. There is no
 *     undo; the duplicate is simply out there.
 *
 * Neither throws. Both are ordinary-looking objects with the wrong URI in them,
 * which is why the assertions below are all about IDENTITY — which record
 * points at which — rather than about whether a call succeeded.
 */
import { MAX_STEPS, threadPosts, quotable, defaultTargets, planFrom, stepFor,
         chain, postShuffle, progress, hasImages } from './shuffle.js';

let fails = 0;
const ok = (name, cond) => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}`);
  if (!cond) fails++;
};

console.log('lib/shuffle.selftest\n');

// A thread shaped like sources.js hands one over: alice posts a 3-post
// self-thread, bob butts in once.
const post = (n, did, handle, text) => ({
  uri: `at://${did}/app.bsky.feed.post/p${n}`,
  cid: `cid${n}`,
  did,
  record: { text },
  author: { did, handle },
});
const alice = 'did:plc:alice';
const bob = 'did:plc:bob';
const THREAD = {
  ancestors: [post(1, alice, 'alice.test', 'one')],
  post: post(2, alice, 'alice.test', 'two'),
  replies: [post(3, alice, 'alice.test', 'three'), post(4, bob, 'bob.test', 'hi')],
};

// ─── 1. flattening ───────────────────────────────────────────────
{
  const posts = threadPosts(THREAD);
  ok('threadPosts is ancestors, focus, then replies',
    posts.map((p) => p.record.text).join(',') === 'one,two,three,hi');
  ok('threadPosts dedupes by uri',
    threadPosts({ ...THREAD, replies: [...THREAD.replies, THREAD.post] }).length === 4);
  ok('threadPosts survives an empty thread', threadPosts({}).length === 0);
}

// ─── 2. the deck ─────────────────────────────────────────────────
{
  // Tapping shuffle anywhere in a self-thread should deal that self-thread —
  // not the interloper's reply, which is a different conversation.
  const deck = defaultTargets(threadPosts(THREAD), THREAD.post.uri);
  ok('a self-thread deals only that author', deck.length === 3);
  ok('…in thread order', deck.map((p) => p.record.text).join(',') === 'one,two,three');

  // Tapping it on bob, who has ONE post here, is not a self-thread — it is a
  // conversation, and the useful deck is everybody.
  const conv = defaultTargets(threadPosts(THREAD), THREAD.replies[1].uri);
  ok('a lone author deals the whole conversation', conv.length === 4);

  // A post with no cid cannot be quoted at all. Dropping it at PLAN time is the
  // point: discovering it after the reader has written twelve reactions is the
  // worst possible moment to find out.
  const noCid = { ...post(9, alice, 'alice.test', 'blocked'), cid: undefined };
  const plan = planFrom({ ...THREAD, replies: [...THREAD.replies, noCid] }, THREAD.post.uri);
  ok('an uncidded post is never dealt', plan.steps.every((s) => s.target.uri !== noCid.uri));
  ok('…and the plan says one was dropped', plan.dropped === 1);
  ok('quotable() wants both halves', quotable({ uri: 'x', cid: 'y' }) && !quotable({ uri: 'x' }));
}

// ─── 3. the cap is reported, not silently applied ────────────────
{
  const many = Array.from({ length: MAX_STEPS + 4 }, (_, i) => post(100 + i, alice, 'alice.test', `#${i}`));
  const plan = planFrom({ ancestors: [], post: many[0], replies: many.slice(1) }, many[0].uri);
  ok(`the cap holds at ${MAX_STEPS}`, plan.steps.length === MAX_STEPS);
  ok('…and the overflow is counted, not hidden', plan.capped === 4);
}

// ─── 4. the chain ────────────────────────────────────────────────
{
  ok('the first post replies to nothing', chain([]) === null);
  const mine = [{ uri: 'at://me/1', cid: 'c1' }, { uri: 'at://me/2', cid: 'c2' }];
  const c = chain(mine);
  ok('parent is my PREVIOUS post', c.parent === undefined && c.uri === 'at://me/2');
  ok('root is my FIRST post, never the parent', c.root.uri === 'at://me/1');
  ok('the cid rides along on both', c.cid === 'c2' && c.root.cid === 'c1');
}

// ─── 5. a whole run, checked record by record ────────────────────
//
// The quote must point into THEIR thread and the reply into MINE. Swapping the
// two is the single most plausible bug in this file and it publishes a reply
// storm into somebody else's thread, so it is asserted per post.
{
  const calls = [];
  const publish = async (text, o) => {
    calls.push({ text, ...o });
    return { uri: `at://me/app.bsky.feed.post/m${calls.length}`, cid: `mc${calls.length}` };
  };
  const steps = planFrom(THREAD, THREAD.post.uri).steps;
  steps.forEach((s, i) => { s.text = `reaction ${i + 1}`; });

  const res = await postShuffle(steps, { publish, delayMs: 0 });
  ok('every step posted', res.done && res.posted === 3);
  ok('the text of each post is its own', calls.map((c) => c.text).join('|') === 'reaction 1|reaction 2|reaction 3');
  ok('post 1 quotes their post 1', calls[0].quote.uri.endsWith('/p1'));
  ok('post 3 quotes their post 3', calls[2].quote.uri.endsWith('/p3'));
  ok('post 1 is top-level', calls[0].replyTo === null);
  ok('post 2 replies to MY post 1', calls[1].replyTo.uri === 'at://me/app.bsky.feed.post/m1');
  ok('post 3 replies to MY post 2', calls[2].replyTo.uri === 'at://me/app.bsky.feed.post/m2');
  ok('every root is MY first post',
    calls.slice(1).every((c) => c.replyTo.root.uri === 'at://me/app.bsky.feed.post/m1'));
  ok('no reply ever points into their thread',
    calls.every((c) => !c.replyTo || !c.replyTo.uri.startsWith('at://did:plc:alice')));
  ok('progress() agrees', progress(steps).finished);
}

// ─── 6. an empty reaction is a legitimate post ───────────────────
//
// This is the plain "repost style" case: deal the deck, say nothing, let the
// quotes speak. compose.publish() used to reject any post with no text, which
// made a quote-only post impossible even though the composer offered one.
{
  const calls = [];
  const publish = async (text, o) => { calls.push({ text, ...o }); return { uri: `at://me/${calls.length}`, cid: `c${calls.length}` }; };
  const steps = planFrom(THREAD, THREAD.post.uri).steps;   // all texts empty
  const res = await postShuffle(steps, { publish, delayMs: 0 });
  ok('a wordless shuffle still publishes', res.done && calls.length === 3);
  ok('…carrying the quote and nothing else', calls[0].text === '' && Boolean(calls[0].quote.cid));
}

// ─── 7. the partial publish, which is the whole point ────────────
//
// Four posts are public and the fifth fails. What must NOT happen on the next
// attempt is the first four going out again.
{
  const calls = [];
  let failNext = false;
  const publish = async (text, o) => {
    if (failNext) throw new Error('rate limited');
    calls.push({ text, ...o });
    return { uri: `at://me/${calls.length}`, cid: `c${calls.length}` };
  };
  const steps = planFrom(THREAD, THREAD.post.uri).steps;
  steps.forEach((s, i) => { s.text = `r${i}`; });

  // Post 1 lands, then the PDS says no.
  const seen = [];
  const first = await postShuffle(steps, {
    publish, delayMs: 0,
    onStep: (i, st) => { seen.push(`${i}:${st}`); if (st === 'done' && i === 0) failNext = true; },
  });
  ok('it stops at the first failure', !first.done && first.failedAt === 1 && first.posted === 1);
  ok('the failure is reported on its own step', steps[1].error === 'rate limited');
  ok('it does NOT run on past the hole', steps[2].posted === null && calls.length === 1);
  ok('onStep narrated it', seen.join(',') === '0:posting,0:done,1:posting,1:failed');

  // The reader taps resume.
  failNext = false;
  const again = await postShuffle(steps, { publish, delayMs: 0 });
  ok('resume finishes the job', again.done && again.posted === 2);
  ok('the landed post is never republished', calls.length === 3);
  ok('…and it keeps its original record', steps[0].posted.uri === 'at://me/1');
  ok('the resumed post chains onto what actually landed', calls[1].replyTo.uri === 'at://me/1');
  ok('…with the root still MY first post', calls[2].replyTo.root.uri === 'at://me/1');
  ok('the error is cleared once it succeeds', steps[1].error === null);
}

// ─── 8. a PDS that answers without a cid ─────────────────────────
//
// The chain needs the cid, so an answer without one has already broken it. Fail
// HERE, with a sentence about the chain, rather than one post later with a
// lexicon validation error about a missing subject.
{
  const publish = async () => ({ uri: 'at://me/1' });
  const steps = planFrom(THREAD, THREAD.post.uri).steps;
  const res = await postShuffle(steps, { publish, delayMs: 0 });
  ok('a cid-less answer fails immediately', !res.done && res.failedAt === 0);
  ok('…and says what broke', /cid/.test(steps[0].error) && /chain/.test(steps[0].error));
  ok('…and nothing is marked posted', progress(steps).done === 0);
}

// ─── 9. reordering and dropping, which is the "shuffle" ──────────
{
  const calls = [];
  const publish = async (text, o) => { calls.push(o); return { uri: `at://me/${calls.length}`, cid: `c${calls.length}` }; };
  const posts = threadPosts(THREAD);
  // Deal them backwards, and leave one out.
  const steps = [posts[3], posts[1], posts[0]].map(stepFor);
  await postShuffle(steps, { publish, delayMs: 0 });
  ok('the deck is published in the order it is dealt',
    calls.map((c) => c.quote.uri.slice(-2)).join(',') === 'p4,p2,p1');
  ok('a dropped target is never quoted', !calls.some((c) => c.quote.uri.endsWith('/p3')));
}

// ─── 10. refusing to start ───────────────────────────────────────
{
  let threw = '';
  try { await postShuffle([], { publish: async () => ({}) }); } catch (e) { threw = e.message; }
  ok('an empty plan is refused', /nothing to post/.test(threw));
  threw = '';
  try { await postShuffle([stepFor(post(1, alice, 'a', 'x'))], {}); } catch (e) { threw = e.message; }
  ok('a missing publish() is refused', /publish/.test(threw));
}


// ─── 11. pictures belong to the CARD, not to the shuffle ─────────
//
// Each card publishes its own record, so a shared array would put the same
// pictures on every post in the thread — and would turn the four-image cap into
// a cap on the whole thread instead of on each post.
{
  const calls = [];
  const publish = async (text, o) => { calls.push(o); return { uri: `at://me/${calls.length}`, cid: `c${calls.length}` }; };
  const steps = planFrom(THREAD, THREAD.post.uri).steps;

  ok('a fresh card carries an empty album', Array.isArray(steps[0].images) && steps[0].images.length === 0);
  ok('hasImages() is false before anything is attached', !hasImages(steps));

  steps[0].images.push({ file: 'photo-a', alt: 'a' });
  steps[2].images.push({ file: 'photo-c1', alt: '' }, { file: 'photo-c2', alt: '' });
  ok('one card does not share another card\'s album', steps[1].images.length === 0);
  ok('hasImages() sees them', hasImages(steps));

  await postShuffle(steps, { publish, delayMs: 0 });
  ok('each post gets its OWN pictures', calls[0].images.length === 1 && calls[2].images.length === 2);
  ok('…the right ones', calls[0].images[0].file === 'photo-a' && calls[2].images[1].file === 'photo-c2');
  ok('a card with no pictures posts none', calls[1].images.length === 0);
  ok('the quote rides along with them',
    calls[0].quote.uri.endsWith('/p1') && calls[2].quote.uri.endsWith('/p3'));
  // A post carrying both is app.bsky.embed.recordWithMedia — compose.publish()
  // builds that, and it only can if both reach it on the same call.
  ok('images and quote reach publish together', Boolean(calls[0].images && calls[0].quote));
}

console.log(fails ? `\nshuffle selftest FAILED (${fails})` : '\nshuffle selftest passed');
process.exit(fails ? 1 : 0);
