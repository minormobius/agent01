/**
 * Security gate for dweet/sandbox.js. Run: node bsky/dweet/sandbox.selftest.mjs
 *
 * This surface executes strangers' code on a domain whose SSO cookie is
 * `Domain=.mino.mobi`. The isolation is three properties of one string and one
 * array, none of which is visible at a glance in a diff — so they are asserted
 * here instead of trusted.
 *
 * If a change to sandbox.js makes any of these fail, the correct response is
 * to revert the change, not to relax the test.
 */
import {
  SANDBOX_TOKENS, FRAME_CSP, MAX_CHARS, LANGS, DWITTER_CHARS, SIZE_TIERS,
  harnessDoc, countChars, validate, sizeClass, dwitterPortable, wrapFragment,
  downsample, WIDTH, HEIGHT, CAPTURE_W, CAPTURE_H,
} from './sandbox.js';

let fail = 0;
const ok = (cond, label, detail = '') => {
  if (!cond) fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${label}${detail ? '  — ' + detail : ''}`);
};

const doc = harnessDoc();

console.log('\nsandbox tokens');
// The single most important assertion in this repo's dweet surface.
// allow-scripts + allow-same-origin is not a stricter sandbox, it is none:
// the frame can reach its parent and remove its own sandbox attribute.
ok(!SANDBOX_TOKENS.includes('allow-same-origin'),
  'never allow-same-origin', SANDBOX_TOKENS.join(' '));
ok(SANDBOX_TOKENS.includes('allow-scripts'),
  'allow-scripts present (the frame must run the dweet)');
ok(SANDBOX_TOKENS.length === 1,
  'exactly one token', `got ${SANDBOX_TOKENS.length}`);
ok(Object.isFrozen(SANDBOX_TOKENS), 'frozen (no runtime push)');
ok(doc.indexOf('allow-same-origin') === -1, 'token absent from the document too');

console.log('\ncontent security policy');
ok(/default-src\s+'none'/.test(FRAME_CSP), "default-src 'none'");
ok(!/connect-src/.test(FRAME_CSP),
  'no connect-src — fetch/WS/beacon fall to default-src and are blocked');
ok(doc.includes(FRAME_CSP), 'the document actually carries the CSP');
ok(/http-equiv="Content-Security-Policy"/.test(doc), 'as a meta http-equiv');
// 'unsafe-eval' is required by `new Function` and is deliberate: arbitrary
// evaluation is the product. Asserted so nobody "fixes" it and blanks the site.
ok(/'unsafe-eval'/.test(FRAME_CSP), "'unsafe-eval' present (new Function needs it)");
// blob: buys the terminable worker and nothing else. If it ever widens to a
// scheme that can carry a remote script, the network is back.
ok(/worker-src blob:/.test(FRAME_CSP), 'worker-src is blob: (the terminable thread)');
for (const scheme of ['http:', 'https:', 'data:', '*']) {
  ok(!FRAME_CSP.includes(scheme), `no ${scheme} anywhere in the policy`);
}

console.log('\nthe runaway defence');
// A hung iframe cannot be stopped by removing it: the script keeps its
// renderer thread and starves every frame created afterwards. terminate() is
// the only primitive that actually stops it, so the dweet MUST run in a worker.
ok(/new Worker\(/.test(doc), 'the dweet runs in a Worker, not on the frame thread');
ok(/\.terminate\(\)/.test(doc), 'the frame can terminate that worker');
ok(/transferControlToOffscreen/.test(doc), 'drawing goes through OffscreenCanvas');
// Pause must not be teardown, or a card scrolled out of view never comes back.
ok(/dweet:pause/.test(doc) && /dweet:resume/.test(doc), 'pause/resume distinct from stop');
ok(doc.indexOf("d.type === 'dweet:pause'") < doc.indexOf("d.type === 'dweet:stop'"),
  'pause is handled before stop');

console.log('\ninjection surface');
// The dweet is never interpolated into the document, so there is nothing to
// escape. Proven by the document being a constant.
ok(harnessDoc() === doc, 'harnessDoc() is constant across calls');
ok(harnessDoc.length === 0, 'harnessDoc() takes no argument', `arity ${harnessDoc.length}`);
for (const payload of [
  '</script><script>alert(1)</script>',
  '"><img src=x onerror=alert(1)>',
  '\u0000</SCRIPT >',
]) {
  ok(!doc.includes(payload), 'document cannot contain a caller payload');
}
// The frame ignores messages that are not from its embedder, and the parent
// ignores messages that are not from its frame. Both directions matter.
ok(/e\.source\s*!==\s*window\.parent/.test(doc), 'frame checks e.source === parent');
// The worker program is embedded as a JSON string literal, so it is data in
// the document rather than code spliced into it — the same property as above,
// one level down.
ok(/new Blob\(\[/.test(doc), 'worker source is embedded as a literal, not assembled');

console.log('\ncharacter counting (dwitter counts graphemes)');
ok(countChars('') === 0, 'empty');
ok(countChars('abc') === 3, 'ascii');
// '👩‍👩‍👧'.length is 8 and [...].length is 5; it is one character to a person.
const family = '\u{1F469}‍\u{1F469}‍\u{1F467}';
const segmenter = typeof Intl?.Segmenter === 'function';
ok(segmenter ? countChars(family) === 1 : countChars(family) === 5,
  segmenter ? 'zwj family is 1 grapheme' : 'no Intl.Segmenter — code points',
  `utf16 ${family.length}, counted ${countChars(family)}`);
ok(countChars('é') === 1, 'combining mark is one char');

console.log('\nvalidation');
ok(validate({ src: 'x.fillRect(0,0,9,9)', lang: 'js' }).ok, 'accepts a real dweet');
ok(!validate({ src: '', lang: 'js' }).ok, 'rejects empty');
ok(!validate({ src: '   ', lang: 'js' }).ok, 'rejects whitespace');
ok(validate({ src: 'a'.repeat(MAX_CHARS), lang: 'js' }).ok, `accepts exactly ${MAX_CHARS}`);
ok(!validate({ src: 'a'.repeat(MAX_CHARS + 1), lang: 'js' }).ok, `rejects ${MAX_CHARS + 1}`);
ok(!validate({ src: 'x', lang: 'wasm' }).ok, 'rejects an unknown lang');
ok(LANGS.length === 2 && LANGS.includes('js') && LANGS.includes('glsl'), 'js + glsl');
// A dweet full of emoji must not sneak past on UTF-16 length.
ok(!validate({ src: family.repeat(MAX_CHARS + 1), lang: 'js' }).ok, 'counts emoji as graphemes');

console.log('\nthe cap, and the Bluesky post arithmetic');
// 280 exists so a whole sketch fits in one 300-grapheme Bluesky post with a
// tag. If MAX_CHARS ever moves, this arithmetic is the thing to re-check.
const BLUESKY_POST = 300, TAG = ' #dweet'.length, LINK = ' dweet.mino.mobi/p/3l4abcdefghij'.length;
ok(MAX_CHARS === 256, 'cap is 256 graphemes', `${MAX_CHARS}`);
ok(MAX_CHARS + TAG <= BLUESKY_POST,
  'code + tag fits a Bluesky post', `${MAX_CHARS + TAG}/${BLUESKY_POST}`);
// The whole reason for 256 over 280. If MAX_CHARS ever rises again, THIS is
// the assertion that should stop it.
ok(MAX_CHARS + TAG + LINK <= BLUESKY_POST,
  'code + tag + permalink also fits', `${MAX_CHARS + TAG + LINK}/${BLUESKY_POST}`);
// The cap coincides with the top tier, so every ASCII sketch is in a named
// category and `open` means "you spent multi-byte characters".
ok(MAX_CHARS === SIZE_TIERS[SIZE_TIERS.length - 1],
  'the cap IS the top size category', `${MAX_CHARS} = ${SIZE_TIERS.at(-1)}b`);
ok(sizeClass('a'.repeat(MAX_CHARS)).label === '256b',
  'a full-length ASCII sketch is 256b');
ok(sizeClass('\u{1F984}'.repeat(MAX_CHARS)).label === 'open',
  'a full-length emoji sketch overflows to open', `${sizeClass('\u{1F984}'.repeat(MAX_CHARS)).bytes} bytes`);
ok(DWITTER_CHARS === 140, 'dwitter mark kept as a badge, not a rule');

console.log('\nsize categories (bytes, demoscene convention)');
ok(SIZE_TIERS.join() === '64,128,256', 'tiers are 64/128/256', SIZE_TIERS.join('/'));
ok(sizeClass('a'.repeat(64)).label === '64b', '64 bytes -> 64b');
ok(sizeClass('a'.repeat(65)).label === '128b', '65 bytes -> 128b');
ok(sizeClass('a'.repeat(256)).label === '256b', '256 bytes -> 256b');
ok(sizeClass('a'.repeat(257)).label === 'open', '257 bytes -> open');
ok(sizeClass('').label === '64b', 'empty is the smallest tier');
// Bytes, not graphemes: one emoji is 4 bytes and must count as 4.
const emoji = '\u{1F984}';
ok(sizeClass(emoji).bytes === 4, 'tier counts UTF-8 bytes', `${sizeClass(emoji).bytes} bytes`);
ok(countChars(emoji) === 1, 'cap counts graphemes', '1 grapheme');

console.log('\ndwitter portability');
ok(dwitterPortable({ src: 'a'.repeat(140), lang: 'js' }), '140 js is portable');
ok(!dwitterPortable({ src: 'a'.repeat(141), lang: 'js' }), '141 js is not');
ok(!dwitterPortable({ src: 'a'.repeat(10), lang: 'glsl' }), 'glsl is never portable');

console.log('\nglsl interop — both dialects compile');
const ours = wrapFragment('o=vec4(1);');
const theirs = wrapFragment('void mainImage(out vec4 fragColor, in vec2 fragCoord){fragColor=vec4(1);}');
ok(/void main\(\)\{vec2 FC=gl_FragCoord\.xy;o=vec4\(1\);\}$/.test(ours),
  'our dialect becomes the body of main()');
ok(/void main\(\)\{mainImage\(o,gl_FragCoord\.xy\);\}$/.test(theirs),
  'a mainImage sketch is called from main()');
ok(!/void main\(\)\{vec2 FC/.test(theirs), 'and is NOT also inlined');
for (const name of ['uniform float t', 'uniform float iTime', 'uniform float u_Time',
                    'uniform vec2 r', 'uniform vec2 iResolution', 'const float PI']) {
  ok(ours.includes(name), `head declares ${name}`);
}
// demosky hardcodes iResolution as a const; ours is a real uniform, so a
// sketch can know the viewport. Assert it is not a const here.
ok(!/const vec2 iResolution/.test(ours), 'iResolution is a uniform, not a const');
ok(ours.startsWith('#version 300 es\n'), 'GLSL ES 3.0');
// Detection must not fire on a mere mention in a comment-free false positive.
ok(/mainImage/.test(wrapFragment('mainImage (o,FC);')), 'tolerates a space before the paren');
// The shipped worker uses THIS function, not a copy.
ok(harnessDoc().includes('function wrapFragment'), 'the worker carries wrapFragment itself');
ok(!/\bwrapFragment\b[^(]*=[^=]/.test(wrapFragment.toString()), 'wrapFragment is closure-free');

console.log('\ncapture — it must not widen anything');
// Capture moves PIXELS out of the sandbox. Pixels are data: nothing on the way
// out is evaluated, and no CSP token or sandbox token was relaxed for it. These
// assert that that is still true, because "just one more capability for the
// export path" is exactly how a boundary like this erodes.
ok(!/allow-/.test(SANDBOX_TOKENS.filter((t) => t !== 'allow-scripts').join('')),
  'capture added no sandbox token', SANDBOX_TOKENS.join(' '));
ok(FRAME_CSP.startsWith("default-src 'none'"), 'capture added no CSP source');
ok(!/connect-src|img-src|media-src/.test(FRAME_CSP), 'still no way to reach the network');
// The parent guard. Without it, any frame with a handle to this one could
// start a capture — or, worse, run a program of its own choosing.
ok(doc.includes('e.source !== window.parent'),
  'only the embedder may send a capture');
// A frame runs ONE program for its whole life. `!started` is what stops a
// capture request from being a second program in a card that is already live.
ok(/d\.type === 'dweet:capture' && !started/.test(doc),
  'a capture cannot be injected into a running frame');
ok(!/dweet:capture[\s\S]{0,400}\$\{/.test(doc),
  'the capture branch interpolates nothing');

console.log('\ndownsample — the silent failures');
// Build a source where every pixel is its own row index, so a flip is
// unmistakable rather than "looks about right".
const SW = 8, SH = 4;
const ramp = new Uint8ClampedArray(SW * SH * 4);
for (let y = 0; y < SH; y++) {
  for (let x = 0; x < SW; x++) {
    const i = (y * SW + x) * 4;
    ramp[i] = y * 60; ramp[i + 1] = x * 30; ramp[i + 2] = 7; ramp[i + 3] = 0;
  }
}
const same = downsample(ramp, SW, SH, SW, SH, false);
ok(same[0] === 0 && same[1] === 0, '1:1 leaves the first pixel alone');
ok(same[3] === 255, 'alpha is forced opaque', `got ${same[3]}`);
ok(same[(3 * SW) * 4] === 180, 'last row keeps its value', `got ${same[(3 * SW) * 4]}`);

const flipped = downsample(ramp, SW, SH, SW, SH, true);
ok(flipped[0] === 180 && flipped[(3 * SW) * 4] === 0,
  'flip reverses the rows — the GL path',
  `top ${flipped[0]}, bottom ${flipped[(3 * SW) * 4]}`);

// A 2x box average: rows 0 and 1 are 0 and 60, so the top half is 30.
const half = downsample(ramp, SW, SH, SW / 2, SH / 2, false);
ok(half[0] === 30, 'boxes are AVERAGED, not point-sampled', `got ${half[0]}`);

// The case the max() guard exists for: a target almost the size of the source
// makes some boxes zero-wide, which would divide by zero and store NaN as 0.
const awkward = downsample(ramp, SW, SH, SW - 1, SH - 1, false);
ok([...awkward].every((v) => Number.isFinite(v)), 'no NaN when boxes go empty');
ok([...awkward].some((v) => v > 0), 'and the result is not all black');

// The shipped ratio is exact, which is why these numbers were chosen.
ok(WIDTH % CAPTURE_W === 0 && HEIGHT % CAPTURE_H === 0,
  'the capture size divides the canvas exactly',
  `${WIDTH}/${CAPTURE_W} = ${WIDTH / CAPTURE_W}, ${HEIGHT}/${CAPTURE_H} = ${HEIGHT / CAPTURE_H}`);
ok(WIDTH / CAPTURE_W === HEIGHT / CAPTURE_H, 'and squarely — same ratio on both axes');
// The worker uses THIS function, not a copy that could drift from the tests.
ok(doc.includes('function downsample'), 'the worker carries downsample itself');
ok(!/\bdownsample\b[^(]*=[^=]/.test(downsample.toString()), 'downsample is closure-free');

console.log('\nthe seed dweet still fits');
const SEED = "c.width|=0;x.fillStyle='#f36';p=33+S(t*5)**8*4;for(a=t%8;a>0;a-=.01)"
  + "x.fillRect(960+p*16*S(a)**3,450-p*(13*C(a)-5*C(2*a)-2*C(3*a)),p/6,p/6)";
const v = validate({ src: SEED, lang: 'js' });
ok(v.ok, 'seed validates', `${v.chars}/${MAX_CHARS} chars`);

console.log(fail ? `\n${fail} failure(s)` : '\nsandbox invariants hold');
process.exit(fail ? 1 : 0);
