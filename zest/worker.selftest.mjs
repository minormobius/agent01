#!/usr/bin/env node
// zest/worker.selftest.mjs — run: node zest/worker.selftest.mjs
//
// The worker's pure logic. Two things here are worth pinning:
//
//   usablePost()  is the TEXT-ONLY PREMISE. Everything the project claims rests
//                 on the player having no information the embedding did not.
//                 One missed embed shape and a post with a picture is on screen
//                 being judged by its shape while the player reads the picture.
//
//   the byte path is content addressing plus a Float32 round trip through D1
//                 and base64. Corrupt it and the page still renders — it just
//                 renders the wrong solids, silently, forever, because the
//                 wrong vector is now cached under the right hash.

import { usablePost, hashText, blobFromFloats, floatsFromBlob, b64FromFloats, roundBasis } from './worker.js';
import { makeBasis, hashEmbed } from './embed-geometry.js';

let pass = 0, fail = 0;
const ok = (c, m, e) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m + (e !== undefined ? '  — ' + e : '')); } };
const section = (s) => console.log('\n' + s);

const LONG = 'the back four were pulled apart every time he dropped between the lines';

/** A feed item as the AppView actually shapes one. */
function item(over = {}, recordOver = {}) {
  return {
    post: {
      uri: 'at://did:plc:x/app.bsky.feed.post/1',
      cid: 'bafy',
      author: { did: 'did:plc:x', handle: 'someone.bsky.social', displayName: 'Someone' },
      likeCount: 3, replyCount: 1,
      record: { text: LONG, createdAt: '2026-08-16T00:00:00Z', ...recordOver },
      ...over,
    },
    ...(over.__reason ? { reason: over.__reason } : {}),
  };
}

section('§1  usablePost — the text-only premise');
{
  const good = usablePost(item());
  ok(good !== null, 'a plain text post is usable');
  ok(good.text === LONG, 'text carried through verbatim');
  ok(good.author.handle === 'someone.bsky.social', 'author carried through');
  ok(good.uri && good.cid, 'identity carried through');

  // ── everything that must be rejected, and why
  ok(usablePost(item({ embed: { $type: 'app.bsky.embed.images#view', images: [] } })) === null,
    'an image post is rejected (hydrated embed)');
  ok(usablePost(item({}, { embed: { $type: 'app.bsky.embed.images' } })) === null,
    'an image post is rejected (raw record embed)');
  ok(usablePost(item({ embed: { $type: 'app.bsky.embed.video#view' } })) === null, 'video is rejected');
  ok(usablePost(item({ embed: { $type: 'app.bsky.embed.external#view' } })) === null, 'a link card is rejected');
  ok(usablePost(item({ embed: { $type: 'app.bsky.embed.record#view' } })) === null, 'a quote post is rejected');
  ok(usablePost({ ...item(), reason: { $type: 'app.bsky.feed.defs#reasonRepost' } }) === null,
    'a repost is rejected — the reposter said nothing');
  ok(usablePost(item({}, { reply: { root: {}, parent: {} } })) === null,
    'a reply is rejected — it needs a parent to make sense');

  ok(usablePost(item({}, { langs: ['ja'] })) === null, 'a non-English post is rejected');
  ok(usablePost(item({}, { langs: ['en-GB'] })) !== null, 'en-GB counts as English');
  ok(usablePost(item({}, { langs: ['en', 'fr'] })) !== null, 'a multi-tagged post including English is kept');
  ok(usablePost(item({}, { langs: [] })) !== null, 'an untagged post is kept');

  ok(usablePost(item({}, { text: 'nice' })) === null, 'too short to embed meaningfully');
  ok(usablePost(item({}, { text: '' })) === null, 'empty text');
  ok(usablePost(item({}, { text: '   ' })) === null, 'whitespace-only text');
  ok(usablePost(item({}, { text: 'https://example.com/a/very/long/url/that/goes/on/and/on/forever' })) === null,
    'a bare link is rejected — no text for the model to read');
  ok(usablePost(item({}, { text: 'look https://example.com/x/y/z/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })) === null,
    'mostly-URL is rejected');
  ok(usablePost(item({}, { text: '@one.bsky.social @two.bsky.social @three.bsky.social @four.bsky.social' })) === null,
    'a pile of mentions is rejected');
  ok(usablePost(item({}, { text: '123456 7890 4444 5555 6666 7777 8888 99999 000000 111111' })) === null,
    'digits are not letters — rejected for having nothing to read');
  ok(usablePost(item({}, { text: '🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉🎉' })) === null,
    'emoji-only is rejected');

  // truncation at the protocol limit
  const long = usablePost(item({}, { text: 'x'.repeat(400) + ' words words words' }));
  ok(long && long.text.length === 300, 'over-long text is truncated to 300', long && long.text.length);

  // malformed input must not throw
  for (const bad of [null, undefined, {}, { post: null }, { post: {} }, { post: { record: null } }]) {
    let threw = false;
    try { usablePost(bad); } catch { threw = true; }
    ok(!threw, 'malformed feed item does not throw: ' + JSON.stringify(bad));
  }
  ok(usablePost({ post: { record: { text: LONG } } }) !== null, 'a post with no author block still yields a record');
}

section('§2  content addressing');
{
  ok(hashText('abc') === hashText('abc'), 'the same text hashes the same');
  ok(hashText('abc') !== hashText('abd'), 'a one-character change changes the hash');
  ok(/^[0-9a-f]{16}$/.test(hashText('abc')), 'hash is 16 hex chars', hashText('abc'));
  ok(hashText('') === hashText(''), 'the empty string is stable');
  ok(hashText('café') !== hashText('cafe'), 'unicode is not flattened');
  // the model is part of the key, so switching models cannot serve stale vectors
  ok(hashText('modelA\ntext') !== hashText('modelB\ntext'), 'the model name is part of the key');

  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(hashText('post number ' + i));
  ok(seen.size === 20000, 'no collisions across 20k realistic keys', seen.size);
}

section('§3  the Float32 round trip — D1 blob and base64');
{
  const vec = hashEmbed('a post about herons standing very still in shallow water');
  const f32 = Float32Array.from(vec);

  const back = floatsFromBlob(blobFromFloats(f32));
  ok(back.length === f32.length, 'blob round trip preserves length', `${back.length} vs ${f32.length}`);
  ok(back.every((v, i) => v === f32[i]), 'blob round trip is exact');

  // D1 can hand back a view whose byteOffset is not 4-aligned; the reader
  // copies in that case, and it must still decode correctly.
  const padded = new Uint8Array(blobFromFloats(f32).length + 1);
  padded.set(blobFromFloats(f32), 1);
  const misaligned = floatsFromBlob(padded.subarray(1));
  ok(misaligned.length === f32.length && misaligned.every((v, i) => v === f32[i]),
    'a misaligned blob view still decodes exactly');

  // base64 path, decoded exactly as feed.js decodes it in the browser
  const b64 = b64FromFloats(f32);
  const bin = Buffer.from(b64, 'base64');
  const decoded = new Float32Array(bin.buffer, bin.byteOffset, bin.byteLength / 4);
  ok(decoded.length === 768, 'base64 payload decodes to 768 floats', decoded.length);
  ok(decoded.every((v, i) => v === f32[i]), 'base64 round trip is exact');
  ok(!/[^A-Za-z0-9+/=]/.test(b64), 'base64 output is well formed');

  // 768 floats must not trip the String.fromCharCode chunking
  const big = new Float32Array(768).fill(-1.5);
  const bigBack = Buffer.from(b64FromFloats(big), 'base64');
  ok(new Float32Array(bigBack.buffer, bigBack.byteOffset, 768).every((v) => v === -1.5),
    'a full-size vector survives the chunked base64 encoder');

  // the values that break naive encoders
  const edge = Float32Array.from([0, -0, 1e-38, -1e38, 3.4e38]);
  const edgeBack = floatsFromBlob(blobFromFloats(edge));
  ok(edgeBack.every((v, i) => Object.is(v, edge[i])), 'denormals, signed zero and near-max survive');
}

section('§4  the stored basis stays a usable basis');
{
  const vecs = Array.from({ length: 140 }, (_, i) => hashEmbed('post ' + i + ' about a thing that happened'));
  const basis = makeBasis(vecs);
  const stored = roundBasis(basis);
  const wire = JSON.parse(JSON.stringify(stored));

  for (const k of ['dim', 'n', 'seed', 'whitenPower', 'mean', 'std', 'scale', 'order', 'pc', 'normQ']) {
    ok(wire[k] !== undefined, `the stored basis keeps "${k}"`);
  }
  ok(wire.mean.length === basis.dim && wire.scale.length === basis.dim, 'per-dimension arrays are complete');
  ok(wire.order.length === basis.dim, 'the variance ranking is complete');
  ok(wire.pc.length === 3 && wire.pc.every((p) => p.length === basis.dim), 'three full principal components');
  ok(wire.mean.every(Number.isFinite) && wire.scale.every(Number.isFinite), 'no NaN survived rounding');
  ok(wire.scale.every((v) => v > 0), 'no scale rounded down to zero — that would divide by zero');

  // rounding must be far below anything visible
  let worst = 0;
  for (let i = 0; i < basis.dim; i++) {
    worst = Math.max(worst, Math.abs(wire.mean[i] - basis.mean[i]) / Math.max(1e-9, Math.abs(basis.mean[i])));
  }
  ok(worst < 1e-5, 'six significant figures is a relative error under 1e-5', worst.toExponential(2));
  ok(JSON.stringify(stored).length < 200000, 'the payload stays a sane download',
    (JSON.stringify(stored).length / 1024).toFixed(0) + ' KiB');
}

console.log(`\n${fail === 0 ? '✓' : '✗'} zest/worker — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
