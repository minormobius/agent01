// Mozzie's blind check of tape1 (ta-6175a8). I wrote it from SPEC.md and STATE-TABLE.md only;
// I never opened tape1.mjs. Black-box: boots the box on the project's fake-sd and asserts what
// SPEC says. Exit 1 on any disagreement. Usage, from the commons root:
//   node shelf/tape1-blind.mjs [projectDir=projects/p-tape1] [-v]
// The tree needs tools/des/des.mjs. If it's missing, add a one-line re-export of projects/p-des.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
const args = process.argv.slice(2), verbose = args.includes('-v');
const dir = resolve(args.find(a => a !== '-v') || (existsSync('tape1.mjs') ? '.' : 'projects/p-tape1'));
const { makeSD, makeFlash } = await import(pathToFileURL(dir + '/fake-sd.mjs'));
const { boot } = await import(pathToFileURL(dir + '/tape1.mjs'));

const lib = (books, extra = {}) => { const f = { ...extra }; for (const [b, n] of Object.entries(books)) for (let i = 1; i <= n; i++) f[`/tape/audio/${b}/0${i}.mp3`] = 'x'; return f; };
const hold = async (b, c, from, to) => { for (let k = 0; from + k * 0.05 <= to + 1e-9; k++) await b.poll(+(from + k * 0.05).toFixed(3), c); };
const card = u => ({ uid: u, records: null });
const KNOWN = new Set(['play', 'pause', 'finished', 'bound', 'cue', 'restore']);
const ev = b => b.events.filter(e => KNOWN.has(e.type)).map(e => {
  const { t, type, card, title, track } = e;
  return [+(+t).toFixed(3), type, card, title, track].filter(x => x !== undefined).join(' ');
});
const logKinds = sd => (sd.files.get('/tape/log.txt') || '').split('\n').filter(Boolean).map(l => l.split('\t').slice(1));
let bad = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  if (!ok || verbose) console.log('     got  ', JSON.stringify(got), '\n     want ', JSON.stringify(want));
}

{ // W2 + table silence 1: a pending gone-timer fires before a later trackEnded
  const sd = makeSD(lib({ a: 3 })); const b = await boot({ sd, flash: makeFlash(), t: 0 });
  await b.poll(1, card('aa')); await b.poll(1.05, null); await b.trackEnded(2.5); await b.poll(3, null);
  const e = ev(b); const p = e.find(x => x.includes('pause'));
  check('A1 late trackEnded: pause within 1.25 s, no next track', [!!p && +p.split(' ')[0] <= 2.25 + 1e-9, e.filter(x => x.includes('play')).length], [true, 1]);
}
{ // W2 with sparse polls: back after 1.3 s is a new placement, paused in between
  const sd = makeSD(lib({ a: 3 })); const b = await boot({ sd, flash: makeFlash(), t: 0 });
  await b.poll(1, card('aa')); await b.poll(2.3, card('aa'));
  const e = ev(b).map(x => x.split(' ')[1]);
  check('A2 sparse return after 1.3 s: pause then play', e, ['bound', 'play', 'pause', 'play']);
}
{ // K + table silence 2: {} accepted at boot owes a restore later
  const fl = makeFlash(); const sd = makeSD(lib({ a: 1 }, { '/tape/cards.json': '{}' })); await boot({ sd, flash: fl, t: 0 });
  sd.files.delete('/tape/cards.json'); const b = await boot({ sd, flash: fl, t: 10 });
  check('B {} accepted, then deleted: restore', ev(b).map(x => x.split(' ')[1]), ['restore']);
  check('B restore logged once', logKinds(sd).filter(k => k[0] === 'restore').length, 1);
}
{ // K + table silence 3: a box that never decided has no mirror
  const fl = makeFlash(); const sd = makeSD(lib({ a: 1 })); await boot({ sd, flash: fl, t: 0 }); const b = await boot({ sd, flash: fl, t: 10 });
  check('C2 new box booted twice: no restore', ev(b), []);
}
{ // K: a parsing cards.json beats a restore even when flash holds more
  const fl = makeFlash(); const sd = makeSD(lib({ a: 1, b: 1 })); const b0 = await boot({ sd, flash: fl, t: 0 });
  await b0.poll(1, card('aa')); sd.files.set('/tape/cards.json', '{}'); const b = await boot({ sd, flash: fl, t: 10 });
  await b.poll(11, card('aa'));
  check('K hand {} after a bind: no restore, card rebinds to first free', ev(b), ['11 bound uid:aa a', '11 play uid:aa a 0']);
}
{ // Titles: bad folders, including well-named but empty and dot-only
  const sd = makeSD(lib({ a: 1 }, { '/tape/audio/empty/notes.txt': 'x', '/tape/audio/dots/._01.m4a': 'x', '/tape/audio/Bad/01.mp3': 'x', '/tape/audio/c/01.FLAC': 'x' })); await boot({ sd, flash: makeFlash(), t: 0 });
  check('F bad-folder: Bad, dots, empty; FLAC folder is a title', logKinds(sd).filter(k => k[0] === 'bad-folder').map(k => k[1]).sort(), ['Bad', 'dots', 'empty']);
}
{ // P: resume memory is per card
  const sd = makeSD(lib({ a: 3, b: 3 })); const b = await boot({ sd, flash: makeFlash(), t: 0 });
  await hold(b, card('aa'), 1, 2); await b.trackEnded(2); await hold(b, card('aa'), 2.05, 2.5); await b.poll(2.55, card('bb'));
  await hold(b, card('bb'), 2.6, 3); await b.trackEnded(3); await hold(b, card('bb'), 3.05, 4); await b.trackEnded(4);
  await b.poll(4.05, card('aa')); await b.poll(4.1, card('bb'));
  check('D per-card resume', ev(b).filter(x => x.includes('play')).slice(-2), ['4.05 play uid:aa a 1', '4.1 play uid:bb b 2']);
}
{ // U: sd-change exactly when the titles differ from this box's previous boot
  const fl = makeFlash(); const sd = makeSD(lib({ a: 1 })); await boot({ sd, flash: fl, t: 0 });
  sd.files.set('/tape/audio/b/01.mp3', 'x'); sd.dirs.add('/tape/audio/b');
  await boot({ sd, flash: fl, t: 5 }); await boot({ sd, flash: fl, t: 9 });
  check('S sd-change on 2nd boot only', logKinds(sd).filter(k => k[0] === 'boot').map(k => k.includes('sd-change')), [false, true, false]);
}
{ // W3: a finished card read alone after a crowd starts from 0
  const sd = makeSD(lib({ a: 1 })); const b = await boot({ sd, flash: makeFlash(), t: 0 });
  await hold(b, card('aa'), 1, 2); await b.trackEnded(2); await b.poll(2.1, { crowd: true }); await b.poll(2.2, null); await b.poll(2.3, card('aa'));
  check('W3 finished, crowd, alone: track 0', ev(b).slice(-2), ['2 finished a', '2.3 play uid:aa a 0']);
}
{ // W3: during a crowd, nothing but pause, however long it lasts
  const sd = makeSD(lib({ a: 2, b: 1 })); const b = await boot({ sd, flash: makeFlash(), t: 0 });
  await hold(b, card('aa'), 1, 1.5); await hold(b, { crowd: true }, 1.55, 3); await hold(b, null, 3.05, 6); await b.trackEnded(6.1);
  check('W3 long crowd with gaps: one pause, nothing else', ev(b).slice(2), ['1.55 pause']);
}
{ // B: cue on every placement, not on every read
  const sd = makeSD(lib({ a: 1 })); const b = await boot({ sd, flash: makeFlash(), t: 0 });
  await b.poll(1, card('aa')); await b.poll(1.1, card('bb')); await b.poll(1.2, null); await b.poll(1.3, card('bb')); await b.poll(3, null); await b.poll(3.1, card('bb'));
  check('Q cue per placement', [ev(b).filter(x => x.includes('cue')).length, sd.files.get('/tape/unknown.txt')], [2, 'uid:bb\nuid:bb\n']);
}
{ // B: never touches /tape/audio
  const sd = makeSD(lib({ a: 1, b: 1 })); const b = await boot({ sd, flash: makeFlash(), t: 0 });
  await b.poll(1, card('aa')); await b.poll(3, card('bb')); await b.poll(5, card('cc'));
  check('B no writes under /tape/audio', sd.writes.filter(([, p]) => p.startsWith('/tape/audio')).length, 0);
}
{ // W1: misses up to 0.75 s in a row (15 polls) never end a hold
  const sd = makeSD(lib({ a: 1 })); const b = await boot({ sd, flash: makeFlash(), t: 0 });
  let t = 1; for (let i = 0; i < 2400; i++) { const run = (i * 7) % 16; for (let k = 0; k < run; k++) { t += 0.05; await b.poll(+t.toFixed(3), null); } t += 0.05; await b.poll(+t.toFixed(3), card('aa')); }
  check('W1 hold through runs of misses', ev(b).filter(x => x.includes('pause')).length, 0);
}
{ // P: finished, lifted, put back: track 0. U: one finished line.
  const sd = makeSD(lib({ a: 2 })); const b = await boot({ sd, flash: makeFlash(), t: 0 });
  await hold(b, card('aa'), 1, 2); await b.trackEnded(2); await hold(b, card('aa'), 2.05, 3); await b.trackEnded(3);
  await hold(b, card('aa'), 3.05, 3.5); await hold(b, null, 3.55, 6); await b.poll(6.05, card('aa'));
  check('P finished then put back: track 0, no pause on lift', ev(b).slice(-2), ['3 finished a', '6.05 play uid:aa a 0']);
  check('U one finished line', logKinds(sd).filter(k => k[0] === 'finished').length, 1);
}
{ // K: torn cards.json, valid cards.new decides
  const sd = makeSD(lib({ a: 1, b: 1 }, { '/tape/cards.json': '{"uid:aa":', '/tape/cards.new': '{"uid:aa":"b"}' }));
  const b = await boot({ sd, flash: makeFlash(), t: 0 }); await b.poll(1, card('aa'));
  check('K torn cards.json, cards.new decides', ev(b), ['1 play uid:aa b 0']);
}
{ // C: a cut at every step of a bind (and then a mangled cards.json) leaves old or old+bind
  const decided = sd => { for (const f of ['/tape/cards.json', '/tape/cards.new']) { try { const o = JSON.parse(sd.files.get(f)); if (o && typeof o === 'object' && !Array.isArray(o) && Object.entries(o).every(([k, v]) => k[0] === '_' || typeof v === 'string')) return Object.fromEntries(Object.entries(o).filter(([k]) => k[0] !== '_')); } catch {} } return null; };
  const old = JSON.stringify({ 'uid:aa': 'a' }), both = JSON.stringify({ 'uid:aa': 'a', 'uid:bb': 'b' });
  let fails = [], cuts = 0;
  for (let cut = 0; cut < 12; cut++) {
    const fl = makeFlash(); const sd = makeSD(lib({ a: 1, b: 1 }, { '/tape/cards.json': old }));
    const b0 = await boot({ sd, flash: fl, t: 0 }); sd.cutAt = sd.steps + cut;
    let cutHit = false;
    try { await b0.poll(1, card('bb')); } catch { cutHit = true; }
    const emitted = b0.events.some(e => e.type === 'bound');
    sd.cutAt = -1;
    if (!cutHit) break;
    cuts++;
    const d = JSON.stringify(decided(sd)); // read before the reboot repairs anything: a FILE must decide
    try { await boot({ sd, flash: fl, t: 5 }); } catch (e) { fails.push(`${cut}: reboot threw ${e.message}`); continue; }
    if (d !== old && d !== both) fails.push(`${cut}: decides ${d}`);
    if (emitted && d !== both) fails.push(`${cut}: bound emitted but not durable`);
    sd.files.set('/tape/cards.json', '{"mangled'); const b2 = await boot({ sd, flash: fl, t: 9 });
    await b2.poll(10, card('bb')); const p = ev(b2).find(x => x.includes('play') || x.includes('cue'));
    if (d === old && !ev(b2).some(x => x.startsWith('10 bound uid:bb'))) fails.push(`${cut}: undone bind came back without a fresh bind: ${ev(b2)}`);
    if (d === both && !(p === '10 play uid:bb b 0')) fails.push(`${cut}: done bind lost after mangle: ${p}`);
  }
  if (cuts < 2) fails.push(`only ${cuts} cut points: the bind didn't reach the card?`);
  check(`C cut at each of ${cuts} steps of a bind, then laptop mangles cards.json`, fails, []);
}
console.log(bad ?`\n${bad} disagreement(s)` : '\nall agree');
process.exit(bad ? 1 : 0);
