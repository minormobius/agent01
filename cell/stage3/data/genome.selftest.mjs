// Known-answer checks for cell/stage3/data/genome.json (built by build-genome.mjs).
//   node cell/stage3/data/genome.selftest.mjs
// Offline: it checks the committed file against facts from the sources, not the sources themselves.
import { readFileSync } from 'node:fs';

const { meta, genes } = JSON.parse(readFileSync(new URL('./genome.json', import.meta.url), 'utf8'));
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) failed++; };
const count = (f) => genes.filter(f).length;

check(meta.genomeLength === 543379, `genome is 543,379 bp (CP016816.2): ${meta.genomeLength}`);
check(genes.length === 496, `496 annotated genes: ${genes.length}`);
check(count((g) => g.kind === 'protein') === 455, `455 protein-coding (CDS) genes: ${count((g) => g.kind === 'protein')}`);
check(count((g) => g.kind === 'tRNA') === 29 && count((g) => g.kind === 'rRNA') === 6, '29 tRNA and 6 rRNA genes (two rRNA operons)');
check(new Set(genes.map((g) => g.tag)).size === genes.length, 'locus tags are unique');
check(genes.every((g, i) => g.start >= 1 && g.end <= meta.genomeLength && g.end >= g.start && (i === 0 || genes[i - 1].start <= g.start)), 'every gene lies on the chromosome, sorted by position');
const dnaA = genes[0];
check(dnaA.name === 'dnaA' && dnaA.start === 1 && dnaA.strand === 1, 'the chromosome starts at dnaA, forward strand');
check(dnaA.ptn === 148, `DnaA copy number matches Breuer 2019 time point 1 (147.8 → 148): ${dnaA.ptn}`);
const q = genes.filter((g) => g.ptn != null);
check(q.length >= 425 && q.every((g) => g.kind === 'protein'), `≥425 proteins quantified, all protein genes: ${q.length}`);
const top = [...q].sort((a, b) => b.ptn - a.ptn)[0];
check(top.name === 'gapDH', `most abundant protein is GAPDH (glycolysis): ${top.name} ${top.ptn}`);
check(count((g) => g.cat === 'Unclear') === 87, `87 genes of unclear function: ${count((g) => g.cat === 'Unclear')}`);
check(meta.sources.length >= 4 && meta.sources.every((s) => s.cite && s.url), 'every source carries a citation and a URL');

if (failed) { console.log(`\n${failed} failed`); process.exit(1); }
console.log('\nall passed');
