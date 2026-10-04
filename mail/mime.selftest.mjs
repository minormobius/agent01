#!/usr/bin/env node
// mime.selftest.mjs — known answers for mail/src/mime.mjs. node mail/mime.selftest.mjs
import assert from 'node:assert/strict';
import { textOf, codesOf, decodeWords, dmarcOf, addrOf, stripHtml, senderMatches, sealedSenders } from './src/mime.mjs';
import { keyFor } from './client.mjs';

let n = 0;
const t = (name, fn) => { try { fn(); n++; } catch (e) { console.error(`✗ ${name}\n${e.stack}`); process.exit(1); } };

const signup = [
  'From: Bluesky <noreply@bsky.app>',
  'To: modulo@mino.mobi',
  'Subject: =?utf-8?B?Q29uZmlybSB5b3VyIGVtYWls?=',
  'Authentication-Results: mx.cloudflare.net; dkim=pass; spf=pass; dmarc=pass header.from=bsky.app',
  'Content-Type: multipart/alternative; boundary="b1"',
  '',
  '--b1',
  'Content-Type: text/plain; charset=utf-8',
  'Content-Transfer-Encoding: quoted-printable',
  '',
  'Your verification code is: ABC12-DE3F4',
  'It expires in 15 minutes. Caf=C3=A9.',
  '--b1',
  'Content-Type: text/html; charset=utf-8',
  '',
  '<p>Your code is <b>ABC12-DE3F4</b></p>',
  '--b1--',
  '',
].join('\r\n');

t('multipart: the text/plain part, quoted-printable and utf-8 decoded', () => {
  const { headers, text } = textOf(signup);
  assert.match(text, /verification code is: ABC12-DE3F4/);
  assert.match(text, /Café\./);
  assert.equal(decodeWords(headers.subject), 'Confirm your email');
  assert.equal(dmarcOf(headers), 'pass');
  assert.equal(addrOf(headers.from), 'noreply@bsky.app');
});
t('codes: the hyphenated code, the six-digit code, verify links; not ordinary numbers', () => {
  assert.deepEqual(codesOf('Your verification code is: ABC12-DE3F4').codes, ['ABC12-DE3F4']);
  assert.deepEqual(codesOf('Enter this code to confirm\n\n  483920  \n').codes, ['483920']);
  const l = codesOf('Click https://bsky.app/verify?token=abc123 or visit https://bsky.app/about').links;
  assert.deepEqual(l, ['https://bsky.app/verify?token=abc123']);
  assert.deepEqual(codesOf('We met 2026 people at 1400 events.').codes, []);
});
t('html only: tags out, link targets kept', () => {
  const raw = 'Content-Type: text/html\r\n\r\n<p>Hi<br>there <a href="https://x.test/confirm?c=1">confirm</a></p><script>x()</script>';
  const { text } = textOf(raw);
  assert.equal(text, 'Hi\nthere confirm (https://x.test/confirm?c=1)');
});
t('base64 body', () => {
  const raw = `Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${Buffer.from('code: 918273 ✓').toString('base64')}`;
  assert.equal(textOf(raw).text, 'code: 918273 ✓');
});
t('sender lists match domains, subdomains and exact addresses', () => {
  assert.ok(senderMatches('@delve.town', 'noreply@delve.town'));
  assert.ok(senderMatches('@delve.town', 'pm_bounces@pm-bounces.delve.town'));
  assert.ok(!senderMatches('@delve.town', 'x@notdelve.town'));
  assert.ok(!senderMatches('@delve.town', 'delve.town@evil.test'));
  assert.ok(senderMatches('a@b.test, @c.test', 'A@B.test'));
});
t('sealed senders are per being', () => {
  const spec = 'miniphim:@delve.town,@groveresearch.com;modulo:@x.test';
  assert.equal(sealedSenders(spec, 'miniphim'), '@delve.town,@groveresearch.com');
  assert.equal(sealedSenders(spec, 'morphyx'), '');
  assert.ok(senderMatches(sealedSenders(spec, 'miniphim'), 'hi@groveresearch.com'));
});
t('no dmarc header reads as none', () => assert.equal(dmarcOf({}), 'none'));
t('stripHtml entities', () => assert.equal(stripHtml('a &amp; b &lt;c&gt;'), 'a & b <c>'));

t('a being\'s key is standard HMAC-SHA256, as the Worker computes it with WebCrypto', () => {
  // RFC 4231-style known answer (Wikipedia's HMAC example).
  assert.equal(keyFor('key', 'The quick brown fox jumps over the lazy dog'), 'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8');
  assert.notEqual(keyFor('lab', 'modulo'), keyFor('lab', 'morphyx'));
});

console.log(`mail mime selftest: ${n} passed`);
