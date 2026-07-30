#!/usr/bin/env node
// Collapse duplicate records in the ideas ledgers.
//
//   node scripts/ideas-dedupe.mjs            # report
//   node scripts/ideas-dedupe.mjs --write    # rewrite in place
//
// THE OTHER HALF OF `merge=union`. See .gitattributes. Union merge keeps both
// sides' lines rather than conflicting, which is right for an append-mostly
// ledger and wrong the moment two runs edit the SAME line: the file then carries
// the record twice, once with the edit and once without.
//
// The concrete case: a post run stamps `posted` onto a queue entry while a review
// run appends new entries. After a union rebase the queue holds eleven-hats
// twice — the stamped copy and the unstamped one — and ideas-post.mjs, which
// looks for the first entry without `posted`, would post it a second time.
//
// So the merge rule is not "keep the first" or "keep the last": it is keep the
// record that KNOWS MORE. A stamp is knowledge; so is a plan; so is a review
// mark. Losing one costs a duplicate post or a re-reviewed paper.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const LEDGERS = [
  { path: '.github/ideas/queue.jsonl', key: (d) => d.arxivId || d.name },
  { path: '.github/ideas/pool.jsonl', key: (d) => d.id },
];

/** Which of two records for the same key survives?
 *
 *  Ordered by how expensive the knowledge was to acquire, most expensive first.
 *  `posted` is a real Bluesky post that cannot be un-sent; `plan` is a model
 *  call; `reviewed` is a model call. Anything else is a tiebreak, and there the
 *  later line wins because union puts the incoming side second. */
export function richer(a, b) {
  const score = (d) =>
    (d.posted ? 8 : 0) + (d.plan ? 4 : 0) + (d.reviewed ? 2 : 0) + (d.text ? 1 : 0);
  return score(b) > score(a) ? b : a;
}

/** Collapse `lines` (raw JSONL text) by `key`. Order is first-appearance, so a
 *  ledger nobody duplicated comes back byte-identical. */
export function dedupe(text, key) {
  const order = [];
  const byKey = new Map();
  const kept = [];
  let dropped = 0;
  let unparseable = 0;

  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    let d;
    try {
      d = JSON.parse(line);
    } catch {
      // A half-written line is not a record. Keep it verbatim and say so — this
      // runs mid-rebase, and silently deleting somebody's data to tidy a file is
      // never the right trade.
      unparseable++;
      kept.push(line);
      continue;
    }
    const k = key(d);
    if (k == null || k === '') {
      // No key means nothing to collapse against. Keep it.
      kept.push(line);
      continue;
    }
    if (byKey.has(k)) {
      byKey.set(k, richer(byKey.get(k), d));
      dropped++;
    } else {
      byKey.set(k, d);
      order.push(k);
    }
  }

  const out = [...kept, ...order.map((k) => JSON.stringify(byKey.get(k)))];
  return { text: out.length ? out.join('\n') + '\n' : '', dropped, unparseable, records: order.length };
}

function main(argv) {
  const write = argv.includes('--write');
  let total = 0;
  for (const { path, key } of LEDGERS) {
    if (!existsSync(path)) continue;
    const before = readFileSync(path, 'utf8');
    const { text, dropped, unparseable, records } = dedupe(before, key);
    total += dropped;
    const note = [
      `${records} records`,
      dropped ? `${dropped} DUPLICATE${dropped === 1 ? '' : 'S'} collapsed` : 'no duplicates',
      unparseable ? `${unparseable} unparseable line(s) kept verbatim` : null,
    ]
      .filter(Boolean)
      .join(', ');
    console.log(`${path}: ${note}`);
    if (write && text !== before) writeFileSync(path, text);
  }
  if (total && !write) console.log('\nrun with --write to collapse them');
  return total;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main(process.argv.slice(2));
}
