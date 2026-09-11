/**
 * Known-answer tests for lib/attach.js.
 *
 *   node bsky/lib/attach.selftest.mjs
 *
 * Both functions here fail SILENTLY when they are wrong. Read the wrong channel
 * of a clipboard payload and the paste simply does nothing, which from the
 * outside is exactly what an empty clipboard looks like. Get the room
 * arithmetic wrong and the reader's fifth picture vanishes without a word. So
 * the cases below are mostly about what must NOT disappear quietly.
 */
import { MAX_IMAGES, imagesFrom, takeImages } from './attach.js';

let fails = 0;
const ok = (name, cond, extra = '') => {
  console.log(`  ${cond ? '✓' : '✗'} ${name}${cond || !extra ? '' : ` — ${extra}`}`);
  if (!cond) fails++;
};

console.log('lib/attach.selftest\n');

const file = (type, name = 'x') => ({ type, name });

// ─── 1. the two clipboard channels ───────────────────────────────
{
  const png = file('image/png', 'screenshot.png');
  ok('reads dataTransfer.files', imagesFrom({ files: [png] })[0] === png);

  // The channel that only `items` exposes — an image copied out of another
  // page can arrive with `files` completely empty.
  const jpg = file('image/jpeg');
  ok('reads dataTransfer.items too',
    imagesFrom({ items: [{ kind: 'file', getAsFile: () => jpg }] })[0] === jpg);

  ok('one File exposed through both is not attached twice',
    imagesFrom({ files: [png], items: [{ kind: 'file', getAsFile: () => png }] }).length === 1);

  ok('a text item is not a picture',
    imagesFrom({ items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] }).length === 0);

  // Copying an image out of a web page yields HTML with an <img src>, and the
  // bytes are on somebody else's origin behind their CORS policy. There is
  // nothing to attach, and pretending otherwise would attach nothing anyway.
  ok('copied HTML is left to the browser as text',
    imagesFrom({ items: [{ kind: 'string', type: 'text/html', getAsFile: () => null }] }).length === 0);

  ok('a non-image file is not attached',
    imagesFrom({ files: [file('application/pdf')] }).length === 0);
  ok('an item whose getAsFile returns null does not throw',
    imagesFrom({ items: [{ kind: 'file', getAsFile: () => null }] }).length === 0);
  ok('no transfer at all is empty, not a throw', imagesFrom(null).length === 0);
  ok('an empty payload is empty', imagesFrom({}).length === 0);
}

// ─── 2. what may be attached ─────────────────────────────────────
{
  const imgs = [file('image/png'), file('image/jpeg'), file('image/webp')];
  const r = takeImages(imgs, 0);
  ok('three images are three images', r.accept.length === 3 && r.reasons.length === 0);

  const half = takeImages(imgs, MAX_IMAGES - 2);
  ok('room is what is LEFT, not the cap', half.accept.length === 2, `${half.accept.length}`);
  ok('…and the overflow is spoken, never silent', half.reasons.length === 1
    && /limit/.test(half.reasons[0]), half.reasons.join('|'));

  const full = takeImages(imgs, MAX_IMAGES);
  ok('a full post accepts nothing', full.accept.length === 0);
  ok('…and says why', /limit/.test(full.reasons[0] || ''));
}

// ─── 3. the rejections that must be explained ────────────────────
{
  // A raw video upload would produce a post that plays in no client at all —
  // app.bsky.embed.video wants a blob Bluesky's transcoder made. The reason is
  // the useful part; "images only" tells nobody anything.
  const v = takeImages([file('video/mp4')], 0);
  ok('a video is refused', v.accept.length === 0);
  ok('…naming the transcoder, not just "images only"', /transcoder/.test(v.reasons[0] || ''),
    v.reasons.join('|'));

  const p = takeImages([file('application/pdf')], 0);
  ok('a pdf is refused with its type', /application\/pdf/.test(p.reasons[0] || ''), p.reasons.join('|'));

  const u = takeImages([file('')], 0);
  ok('a typeless file says "unknown type" rather than "not an image: "',
    /unknown type/.test(u.reasons[0] || ''), u.reasons.join('|'));

  // A mixed drop keeps the pictures AND explains the rest. Dropping the whole
  // batch because one file was wrong is the other way to get this wrong.
  const mixed = takeImages([file('image/png'), file('video/quicktime'), file('image/gif')], 0);
  ok('a mixed batch keeps its pictures', mixed.accept.length === 2);
  ok('…and still explains the one it dropped', mixed.reasons.length === 1);
}

// ─── 4. nothing at all ───────────────────────────────────────────
{
  ok('no files is not an error', takeImages([], 0).accept.length === 0);
  ok('…and says nothing either', takeImages([], 0).reasons.length === 0);
  ok('undefined is survivable', takeImages(undefined, 0).accept.length === 0);
}

console.log(fails ? `\nattach selftest FAILED (${fails})` : '\nattach selftest passed');
process.exit(fails ? 1 : 0);
