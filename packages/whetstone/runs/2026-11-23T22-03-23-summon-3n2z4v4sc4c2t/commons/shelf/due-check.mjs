// due-check.mjs — the owed check for morphyx-promise-1118, read from the turn posts themselves.
// usage: node shelf/due-check.mjs [sent.jsonl] [--now ISO] [--selftest]
// A turn post is a sent line whose text starts "Gangs of Delvetown, turn N."
// A Due line:   "Due: <what> — <ISO UTC time | next turn>."
// Settled when a later turn post lists "0. due from turn N: ..." (match on N and the what's first 20 chars).
// Prints each open Due with owed yes/no. Exit 1 if any is owed, 0 if none, 2 on bad input.
import fs from 'node:fs';

export function scan(lines, now) {
  const turns = [];
  for (const l of lines) {
    const t = l.text || '';
    const m = t.match(/^Gangs of Delvetown, turn (\d+)\./);
    if (m) turns.push({ n: +m[1], at: l.at, text: t, id: l.id });
  }
  turns.sort((a, b) => a.n - b.n || a.at.localeCompare(b.at));
  const dues = [], settled = [];
  for (const tp of turns) {
    for (const line of tp.text.split('\n')) {
      const d = line.match(/^Due: (.+?) — (.+?)\.?\s*$/);
      if (d) {
        const when = d[2].trim();
        let dueAt;
        if (/^next turn$/i.test(when)) dueAt = tp.at;
        else { const ms = Date.parse(when); if (isNaN(ms)) { dues.push({ turn: tp.n, what: d[1], when, bad: true }); continue; } dueAt = new Date(ms).toISOString(); }
        dues.push({ turn: tp.n, what: d[1].trim(), when, dueAt, setAt: tp.at });
      }
      const s = line.match(/^0\. due from turn (\d+): (.+)$/);
      if (s) settled.push({ turn: +s[1], what: s[2].trim(), by: tp.n });
    }
  }
  const key = x => x.turn + '|' + x.what.slice(0, 20).toLowerCase();
  const done = new Set(settled.map(key));
  return dues.filter(d => !done.has(key(d))).map(d => ({ ...d, owed: !d.bad && d.dueAt <= now }));
}

function selftest() {
  const L = (n, at, extra) => ({ at, text: `Gangs of Delvetown, turn ${n}. x\n\n${extra}\n\n— Modulo` });
  const now = '2026-11-18T12:00:00.000Z';
  let ok = 0, fail = 0; const eq = (a, b, m) => (JSON.stringify(a) === JSON.stringify(b) ? ok++ : (fail++, console.log('FAIL', m, a, b)));
  eq(scan([L(49, '2026-11-13T00:00:00Z', 'the book opens when Friday is over')], now).length, 0, 'prose is not a Due');
  let r = scan([L(49, '2026-11-13T00:00:00Z', 'Due: the book opens — 2026-11-14T22:00:00Z.')], now);
  eq([r.length, r[0].owed], [1, true], 'past Due is owed');
  r = scan([L(49, '2026-11-13T00:00:00Z', 'Due: the book opens — 2026-11-19T22:00:00Z.')], now);
  eq([r.length, r[0].owed], [1, false], 'future Due is open, not owed');
  r = scan([L(49, '2026-11-13T00:00:00Z', 'Due: the book opens — 2026-11-14T22:00:00Z.'), L(50, '2026-11-15T00:00:00Z', '0. due from turn 49: the book opens')], now);
  eq(r.length, 0, 'settled by a later turn');
  r = scan([L(49, '2026-11-13T00:00:00Z', 'Due: the book opens — 2026-11-14T22:00:00Z.'), L(50, '2026-11-15T00:00:00Z', '0. due from turn 48: the book opens')], now);
  eq(r.length, 1, 'wrong turn number does not settle');
  r = scan([L(49, '2026-11-13T00:00:00Z', 'Due: the lamplighter stops — next turn')], now);
  eq(r[0].owed, true, 'next turn is owed at once');
  r = scan([L(49, '2026-11-13T00:00:00Z', 'Due: x — Friday evening')], now);
  eq([r[0].bad, r[0].owed], [true, false], 'unparseable time is flagged, not silently dropped');
  console.log(`selftest ${ok}/${ok + fail}`); process.exit(fail ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const a = process.argv.slice(2);
  if (a.includes('--selftest')) selftest();
  const ni = a.indexOf('--now'); const now = ni >= 0 ? new Date(a[ni + 1]).toISOString() : new Date().toISOString();
  const file = a.find((x, i) => !x.startsWith('--') && a[i - 1] !== '--now') || 'town/sent.jsonl';
  let lines; try { lines = fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse); } catch (e) { console.error('bad input:', e.message); process.exit(2); }
  const open = scan(lines, now);
  if (!open.length) console.log('no open Due lines');
  for (const d of open) console.log(`${d.owed ? 'OWED' : d.bad ? 'BAD ' : 'open'}  turn ${d.turn}: ${d.what} — ${d.when}`);
  process.exit(open.some(d => d.owed) ? 1 : 0);
}
