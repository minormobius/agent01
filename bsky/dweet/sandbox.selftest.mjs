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
  SANDBOX_TOKENS, FRAME_CSP, MAX_CHARS, LANGS,
  harnessDoc, countChars, validate,
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

console.log('\nthe seed dweet still fits');
const SEED = "c.width|=0;x.fillStyle='#f36';p=33+S(t*5)**8*4;for(a=t%8;a>0;a-=.01)"
  + "x.fillRect(960+p*16*S(a)**3,450-p*(13*C(a)-5*C(2*a)-2*C(3*a)),p/6,p/6)";
const v = validate({ src: SEED, lang: 'js' });
ok(v.ok, 'seed validates', `${v.chars}/${MAX_CHARS} chars`);

console.log(fail ? `\n${fail} failure(s)` : '\nsandbox invariants hold');
process.exit(fail ? 1 : 0);
