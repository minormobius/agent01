// node scripts/ideas-dedupe.selftest.mjs
//
// The thing being protected is a Bluesky post that cannot be un-sent. If dedupe
// keeps the unstamped copy of a posted concept, ideas-post.mjs posts it again
// under the operator's name — so the stamp-wins case is the one assertion here
// that matters more than the others.

import { dedupe, richer, LEDGERS } from './ideas-dedupe.mjs';

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

const jsonl = (...rows) => rows.map((r) => JSON.stringify(r)).join('\n') + '\n';
const queueKey = LEDGERS.find((l) => l.path.endsWith('queue.jsonl')).key;
const poolKey = LEDGERS.find((l) => l.path.endsWith('pool.jsonl')).key;
const rows = (text) => text.split('\n').filter(Boolean).map((l) => JSON.parse(l));

console.log('— a clean ledger comes back untouched —');
{
  const before = jsonl(
    { arxivId: '2607.1', name: 'a', plan: 'p' },
    { arxivId: '2607.2', name: 'b', plan: 'q' },
  );
  const { text, dropped } = dedupe(before, queueKey);
  ck(text === before, 'byte-identical when there is nothing to collapse');
  ck(dropped === 0, 'and nothing reported');
}

console.log('— THE REAL CASE: union merge duplicated a stamped entry —');
{
  // What the file looks like after `merge=union` rebases a review append over a
  // post stamp: the same concept twice, in either order.
  const stamped = { arxivId: '2607.25274', name: 'eleven-hats', plan: 'p', posted: { uri: 'at://x' } };
  const bare = { arxivId: '2607.25274', name: 'eleven-hats', plan: 'p' };
  const appended = { arxivId: '2607.9', name: 'new-one', plan: 'r' };

  for (const [label, before] of [
    ['stamp first', jsonl(stamped, bare, appended)],
    ['stamp second', jsonl(bare, stamped, appended)],
  ]) {
    const { text, dropped, records } = dedupe(before, queueKey);
    const out = rows(text);
    ck(dropped === 1 && records === 2, `${label}: one duplicate collapsed, two records left`);
    ck(out[0].posted?.uri === 'at://x', `${label}: THE STAMP SURVIVES — no second post`);
    ck(out.some((d) => d.name === 'new-one'), `${label}: the appended concept is not lost`);
  }
}

console.log('— knowledge wins over position, whichever side it is on —');
{
  ck(richer({ name: 'a' }, { name: 'a', posted: 1 }).posted === 1, 'posted beats bare');
  ck(richer({ name: 'a', posted: 1 }, { name: 'a' }).posted === 1, '...in either order');
  ck(richer({ name: 'a' }, { name: 'a', plan: 'p' }).plan === 'p', 'a plan beats no plan');
  ck(richer({ name: 'a', posted: 1 }, { name: 'a', plan: 'p' }).posted === 1,
    'a stamp outranks a plan — a sent post is the costlier fact');
  ck(richer({ id: 'x' }, { id: 'x', reviewed: '2026-07-29' }).reviewed === '2026-07-29',
    'a review mark beats none, so a paper is not reviewed twice');
  // Equal knowledge: the incoming side (second) is the newer write.
  ck(richer({ name: 'a', text: '1' }, { name: 'a', text: '2' }).text === '1',
    'with nothing to choose between them the first is kept, so order is stable');
}

console.log('— the pool is keyed on its own field —');
{
  const before = jsonl(
    { id: '2607.1', reviewed: '2026-07-29' },
    { id: '2607.1' },
    { id: '2607.2' },
  );
  const out = rows(dedupe(before, poolKey).text);
  ck(out.length === 2, 'two papers');
  ck(out[0].reviewed === '2026-07-29', 'and the review mark survives');
}

console.log('— it never destroys what it cannot understand —');
{
  const before = '{"arxivId":"2607.1","name":"a"}\n{"arxivId":"2607.1","nam\n';
  const { text, unparseable } = dedupe(before, queueKey);
  ck(unparseable === 1, 'a truncated line is counted');
  ck(text.includes('"nam'), 'and kept verbatim rather than deleted');
  const keyless = jsonl({ note: 'no key at all' }, { note: 'no key at all' });
  ck(rows(dedupe(keyless, queueKey).text).length === 2,
    'records with no key are all kept — nothing to collapse against');
}

console.log('— an empty ledger stays empty, not a lone newline —');
{
  ck(dedupe('', queueKey).text === '', 'empty in, empty out');
  ck(dedupe('\n\n', queueKey).text === '', 'blank lines produce no file body');
}

console.log(`\n${failures === 0 ? '✓ all dedupe tests passed' : `✗ ${failures} test(s) failed`}`);
process.exit(failures ? 1 : 0);
