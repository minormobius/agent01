// node scripts/ideas-batch.selftest.mjs
// The selection rule exists to stop one big arXiv category eating every batch
// forever, so that is what this tests: a lopsided pool must still produce a
// balanced batch, and a reviewed paper must never come back.

import { selectBatch, batchPayload } from './ideas-batch.mjs';

let failures = 0;
const ck = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { failures++; console.error(`  ✗ ${m}`); } };

const paper = (id, families, day = 29, reviewed = null) => ({
  id, title: `paper ${id}`, abstract: 'x'.repeat(50), families,
  published: `2026-07-${String(day).padStart(2, '0')}T00:00:00Z`,
  viaCategories: families, reviewed,
});

// The measured shape of one real day: math swamps everything, bio is scarce.
const lopsided = [
  ...Array.from({ length: 31 }, (_, i) => paper(`math-${i}`, ['math'])),
  ...Array.from({ length: 20 }, (_, i) => paper(`oneill-${i}`, ['oneill'])),
  ...Array.from({ length: 12 }, (_, i) => paper(`science-${i}`, ['science'])),
  ...Array.from({ length: 3 }, (_, i) => paper(`social-${i}`, ['social'])),
];
const famOf = (b) => { const s = {}; for (const p of b) for (const f of p.families) s[f] = (s[f] || 0) + 1; return s; };

console.log('— a lopsided pool still yields a balanced batch —');
{
  const b = selectBatch(lopsided, { size: 12 });
  const s = famOf(b);
  ck(b.length === 12, 'batch is the requested size');
  ck(s.science >= 3, `bio/science gets ${s.science} of 12 despite being 12 of 66 in the pool`);
  ck(s.social >= 2, `the scarcest family (3 papers) still gets ${s.social} slots`);
  ck(s.math <= 4, `math is held to ${s.math} rather than taking most of the batch`);
  ck(Object.keys(s).length === 4, 'every family in the pool is represented');
}

console.log('— naive selection would have failed this, which is why the rule exists —');
{
  const newestFirst = [...lopsided]
    .sort((a, b) => (b.published || '').localeCompare(a.published || '')).slice(0, 12);
  ck(!(famOf(newestFirst).science >= 3),
    'newest-first would NOT have given bio a fair share (control case)');
}

console.log('— reviewed papers are done —');
{
  const pool = [paper('a', ['math']), paper('b', ['math'], 29, { at: '2026-07-29T00:00:00Z' })];
  const b = selectBatch(pool, { size: 10 });
  ck(b.length === 1 && b[0].id === 'a', 'a reviewed paper is never re-batched');
  ck(selectBatch([paper('x', ['math'], 29, { at: 'now' })], { size: 5 }).length === 0,
    'a fully-reviewed pool yields an empty batch, not an error');
  ck(selectBatch([], { size: 5 }).length === 0, 'an empty pool yields an empty batch');
}

console.log('— a cross-listed paper counts for the family that needs it —');
{
  const pool = [
    ...Array.from({ length: 10 }, (_, i) => paper(`m-${i}`, ['math'])),
    paper('cross', ['math', 'science']),
  ];
  const b = selectBatch(pool, { size: 2 });
  ck(b.some((p) => p.id === 'cross'),
    'a math+science paper is picked early because science is the scarcer home');
}

console.log('— newest first within a family —');
{
  const pool = [paper('old', ['math'], 20), paper('new', ['math'], 29)];
  ck(selectBatch(pool, { size: 1 })[0].id === 'new', 'the newer paper is preferred');
}

console.log('— asking for more than exists is not an error —');
{
  const b = selectBatch(lopsided, { size: 500 });
  ck(b.length === lopsided.length, 'the batch caps at the pool size');
  ck(new Set(b.map((p) => p.id)).size === b.length, 'and contains no duplicates');
}

console.log('— the payload is what the agent sees —');
{
  const p = batchPayload(selectBatch(lopsided, { size: 3 }));
  ck(p.count === 3 && p.papers.length === 3, 'count matches the papers');
  ck(p.papers.every((x) => x.id && x.title && x.abstract), 'every paper carries id, title, abstract');
  ck(!('reviewed' in p.papers[0]) && !('fetchedAt' in p.papers[0]),
    'pool bookkeeping is not shipped to the agent');
}

console.log(`\n${failures === 0 ? '✓ all gates passed' : `✗ ${failures} gate(s) failed`}`);
process.exit(failures ? 1 : 0);
