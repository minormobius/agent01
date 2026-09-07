// node scripts/lib/portrait.selftest.mjs
//
// The digest is what a model reads before it draws somebody. Everything that
// decides what goes IN it is pure and is tested here — what counts as a topic,
// what counts as a hit, and what the digest is allowed to claim about its own
// coverage. The three fetchers are not tested; they are one `fetch` each.

import { tokens, interests, greatestHits, tempo, rateText, renderDigest, STOP } from './portrait.mjs';

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };
const at = (rows, term) => rows.find((r) => r.term === term)?.n ?? 0;

const post = (text, createdAt, isReply = false) => ({ text, createdAt, isReply });

console.log('— tokens keep subjects and drop everything else —');
{
  const t = tokens('The sourdough is REALLY good today @friend.bsky.social https://example.com/x #baking 42');
  ck(t.includes('sourdough'), 'a subject survives');
  ck(t.includes('baking'), 'the word inside a hashtag survives');
  ck(!t.includes('the') && !t.includes('really') && !t.includes('good') && !t.includes('today'),
    'filler is stopped — "really", "good", "today" describe nobody');
  ck(!t.some((w) => w.includes('example')), 'the URL is gone before it can be counted as vocabulary');
  ck(!t.some((w) => w.includes('friend')), 'the handle is gone too');
  ck(!t.includes('42'), 'a bare number is not a topic');
  ck(!t.includes('is'), 'two-letter words are below the floor');
  ck(STOP.has('think') && STOP.has('people'), 'the stoplist covers social-text filler, not just articles');

  // BOTH OF THESE ARE FROM THE FIRST LIVE RUN, where the top three "interests"
  // for a 50,000-post account came back as it’s, i’m, that’s and three more
  // slots went to fragments of the author's own domain.
  const curly = tokens('it’s about mycology, i’m sure, that’s why you’re here');
  ck(!curly.some((w) => /'/.test(w)),
    `CURLY apostrophes normalise before the stoplist, so no contraction survives (got ${JSON.stringify(curly)})`);
  ck(curly.includes('mycology'), 'and the subject in among them survives');
  const bare = tokens('new site mino.mobi/mappa/ is up, about tectonics');
  ck(!bare.includes('mino') && !bare.includes('mobi') && !bare.includes('mappa'),
    'a URL with no scheme is still a URL and is not vocabulary');
  ck(bare.includes('tectonics'), 'and the sentence around it survives');
}

console.log('— interests: five views, because each fails somewhere else —');
{
  const posts = [
    post('sourdough starter rose overnight #baking https://kingarthurbaking.com/x', '2024-01-02T10:00:00Z'),
    post('sourdough discard pancakes are the real prize', '2024-01-03T10:00:00Z', true),
    post('more sourdough discard pancakes @friend.bsky.social', '2024-01-04T10:00:00Z', true),
    post('sourdough discard pancakes forever #baking', '2024-06-04T10:00:00Z'),
    post('unrelated post about signal processing', '2019-01-04T10:00:00Z'),
  ];
  const i = interests(posts, { now: Date.parse('2024-07-01T00:00:00Z') });

  ck(i.terms[0].term === 'sourdough', 'the dominant subject leads');
  ck(at(i.hashtags, 'baking') === 2, 'hashtags are counted separately from words');
  ck(at(i.domains, 'kingarthurbaking.com') === 1, 'linked hosts are counted');
  ck(at(i.talksTo, 'friend.bsky.social') === 1, 'who they talk to is counted');
  ck(i.phrases.some((p) => p.term === 'discard pancakes'), 'a phrase seen three times is a phrase');
  ck(!i.phrases.some((p) => p.term === 'signal processing'),
    'a phrase seen once is a coincidence, not a subject');

  // "lately" is a different window, and that is the point: a five-year-old
  // obsession and a current one must not read the same to the model.
  ck(at(i.lately, 'sourdough') > 0, 'recent subjects appear in "lately"');
  ck(at(i.lately, 'processing') === 0, 'a post from five years ago does not');
  ck(i.recentPosts === 4, 'and the window says how many posts it saw');

  ck(interests([]).terms.length === 0, 'an empty corpus produces empty views, not a crash');
}

console.log('— greatest hits: reposts count double, replies not at all —');
{
  const hit = (uri, likeCount, repostCount, replyCount = 0) =>
    ({ uri, text: `post ${uri}`, likeCount, repostCount, replyCount });
  const hits = greatestHits([hit('a', 100, 0), hit('b', 50, 40), hit('c', 10, 0, 5000)]);
  ck(hits[0].uri === 'b', 'a reposted post outranks a more-liked one (50 + 2x40 > 100)');
  ck(hits[hits.length - 1].uri === 'c',
    'A RATIO IS NOT A HIT — five thousand replies do not lift a post');

  ck(greatestHits([hit('a', 5, 0), hit('a', 5, 0)]).length === 1,
    'the same post from the feed and from search counts once');
  ck(greatestHits([hit('a', 1, 0), hit('b', 2, 0)], 1).length === 1, 'k is honoured');
  ck(greatestHits([null, undefined, { likeCount: 3 }]).length === 0, 'junk rows are dropped, not counted');

  // Found in the first real run: slot 4 of 10 went to a 108-like post whose
  // entire content was an image. A genuine hit, and unusable — the model that
  // writes the prompt reads text and cannot see it.
  const withImageOnly = greatestHits([hit('a', 5, 0), { uri: 'img', text: '   ', likeCount: 9999 }]);
  ck(withImageOnly.length === 1 && withImageOnly[0].uri === 'a',
    'a post with no text is dropped however well it did — it tells the prompt model nothing');
}

console.log('— tempo —');
{
  const posts = [
    post('a', '2024-01-01T05:00:00Z'), post('b', '2024-01-01T05:30:00Z', true),
    post('c', '2024-01-11T05:00:00Z'),
  ];
  const t = tempo(posts);
  ck(t.first === '2024-01-01' && t.last === '2024-01-11', 'span is read off the posts');
  ck(t.perDay === 0.3, `3 posts over 10 days is ${t.perDay}/day`);
  ck(Math.abs(t.replyShare - 0.33) < 0.01, 'reply share is a fraction of all posts');
  ck(t.peakHour === 5, 'the busiest UTC hour is reported');
  ck(tempo([]).posts === 0, 'no posts is not a divide by zero');

  const rare = tempo([post('a', '2020-01-01T00:00:00Z'), post('b', '2024-01-01T00:00:00Z')]);
  ck(rare.perDay > 0, `a rare poster keeps a non-zero rate (${rare.perDay}/day)`);
  ck(rateText(rare.perDay).endsWith('/month'),
    `and reads as "${rateText(rare.perDay)}" — "0.0/day" reads as a dead account, not a quiet one`);
  ck(rateText(12).endsWith('/day') && rateText(0.4).endsWith('/week'), 'the unit follows the rate');
}

console.log('— the digest states its own coverage —');
{
  const d = {
    handle: 'a.bsky.social', displayName: 'A', bio: 'bio',
    counts: { followers: 10, follows: 20 },
    avatarFile: '/tmp/avatar.jpg',
    tempo: tempo([post('a', '2024-01-01T00:00:00Z')]),
    interests: interests([post('trains and trains', '2024-01-01T00:00:00Z')]),
    hits: [{ uri: 'a', text: 'a post', likes: 3, reposts: 1 }],
    hitScope: 'ranked over the most recent 400 posts plus a "top" search',
    palm: null,
  };
  const md = renderDigest(d);
  ck(md.includes('# @a.bsky.social — A'), 'the handle and display name head it');
  ck(md.includes('LOOK AT IT'), 'the avatar is pointed at, since the model can open it');
  ck(md.includes('ranked over the most recent 400 posts'),
    'THE SCOPE IS PRINTED — "top ten ever" is a claim, and paging does not always earn it');
  ck(md.includes('trains'), 'subjects are in there');
  ck(!md.includes('undefined') && !md.includes('[object'), 'no placeholder litter reaches the model');
  ck(renderDigest({ ...d, palm: null, bio: '', avatarFile: null, counts: null }).length > 0,
    'a digest with every optional part missing still renders');
}

console.log(`\n${failures === 0 ? '✓ all gates passed' : `✗ ${failures} gate(s) failed`}`);
process.exit(failures ? 1 : 0);
