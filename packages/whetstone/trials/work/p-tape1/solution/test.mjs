// The reference's own tests: small, one per requirement, writing evidence.json for vv.
import { writeFileSync } from 'node:fs';
import { encode, decode } from './harness.mjs';
import { boot, cardId } from './tape1.mjs';
const ev = [];
const today = new Date().toISOString().slice(0, 10);
const t = (check, ok) => ev.push({ check, result: ok ? 'pass' : 'fail', at: today });
const sdOf = (files) => { const F = new Map(Object.entries(files)); return { F, sd: {
  list: (d) => [...new Set([...F.keys()].filter((p) => p.startsWith(d + '/')).map((p) => p.slice(d.length + 1).split('/')[0]))],
  isDir: (p) => [...F.keys()].some((k) => k.startsWith(p + '/')), read: (p) => (F.has(p) ? F.get(p) : null),
  write: (p, x) => F.set(p, x), append: (p, x) => F.set(p, (F.get(p) || '') + x), rename: (a, b) => { F.set(b, F.get(a)); F.delete(a); }, remove: (p) => F.delete(p) } }; };
const flashOf = () => { let v = null; return { get: () => v && JSON.parse(v), set: (x) => { v = JSON.stringify(x); } }; };
const a = decode(encode({ x: NaN, y: Infinity, z: -Infinity, n: null }));
t('t-harness', Number.isNaN(a.x) && a.y === Infinity && a.z === -Infinity && a.n === null && !('q' in decode(encode({ q: undefined }))));
const S = sdOf({ '/tape/audio/apple/01.mp3': 'a', '/tape/audio/berry/02.ogg': 'a', '/tape/audio/berry/01.m4a': 'a', '/tape/audio/Bad/01.mp3': 'a' });
const fl = flashOf();
const box = await boot({ sd: S.sd, flash: fl, t: 0 });
const card = { uid: 'AB', records: null };
for (let i = 0; i < 400; i++) await box.poll(i * 0.05, i % 4 === 3 ? null : card);
t('t-hold', !box.events.some((e) => e.type === 'pause'));
for (let i = 400; i < 460; i++) await box.poll(i * 0.05, null);
const p = box.events.find((e) => e.type === 'pause');
t('t-leave', p && p.t - 399 * 0.05 <= 1.25);
await box.poll(23, card); await box.poll(23.05, { crowd: true });
t('t-crowd', box.events.at(-1).type === 'pause');
t('t-id', cardId(card) === 'uid:ab');
const two = { uid: 'CD', records: null };
for (let i = 0; i < 10; i++) await box.poll(30 + i * 0.25, two);
await box.trackEnded(33);
t('t-titles', box.events.filter((e) => e.type === 'play' && e.card === 'uid:cd').map((e) => e.file).join() === '01.m4a,02.ogg');
t('t-bind', box.events.filter((e) => e.type === 'bound').map((e) => e.title).join() === 'apple,berry');
t('t-keep', ![...S.F.keys()].some((k) => k.startsWith('/tape/audio') && !k.endsWith('.mp3') && !k.endsWith('.ogg') && !k.endsWith('.m4a')));
const cut = sdOf({ '/tape/audio/apple/01.mp3': 'a', '/tape/cards.json': '{"uid:ab":"apple"}' });
cut.sd.write = (p, x) => { cut.F.set(p, x.slice(0, 3)); throw new Error('power cut'); };
const b2 = await boot({ sd: cut.sd, flash: flashOf(), t: 0 });
try { for (let i = 0; i < 4; i++) await b2.poll(i * 0.25, { uid: 'EF', records: null }); } catch { /* the cut */ }
t('t-cut', JSON.parse(cut.F.get('/tape/cards.json'))['uid:ab'] === 'apple');
S.F.delete('/tape/cards.json');
const b3 = await boot({ sd: S.sd, flash: fl, t: 0 });
t('t-mirror', b3.events.some((e) => e.type === 'restore') && S.F.get('/tape/log.txt').includes('\trestore'));
t('t-log', ['boot', 'bind', 'bad-folder'].every((k) => S.F.get('/tape/log.txt').includes(`\t${k}`)));
writeFileSync('evidence.json', JSON.stringify(ev, null, 1));
process.exit(ev.every((e) => e.result === 'pass') ? 0 : 1);
