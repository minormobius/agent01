#!/usr/bin/env node
// proofs/ramsey/build-traces.mjs — compact the release's deduction traces for the page.
//   node proofs/ramsey/build-traces.mjs --src ~/openai-math [--check]
// Reads one data file (verification/data/certificates.jsonl) as text; runs nothing from the
// release. Keeps patterns, outcomes, rounds and witnesses, and replaces the 3.4 MB of initial
// flags by an FNV checksum (the page recomputes the flags and compares).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { emit } from '../../scripts/lib/landing.mjs';
import { flagsHash } from './ramsey.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2), SRC = args[args.indexOf('--src') + 1], CHECK = args.includes('--check');
if (!SRC || args.indexOf('--src') < 0) { console.error('usage: build-traces.mjs --src <openai/math clone> [--check]'); process.exit(2); }
const file = join(SRC, 'preprints', 'Cycle-clique-Ramsey-numbers-September-25-2026', 'verification', 'data', 'certificates.jsonl');
const recs = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const W = (x) => { if (x.kind !== 'packing') throw new Error('unexpected witness kind ' + x.kind); return x.options; };
const out = recs.map((r) => [r.k, r.t, r.pattern, r.classification, flagsHash(r.initial.filter(([, , m]) => m).sort((a, b) => a[0] - b[0] || a[1] - b[1])), r.rounds.map((rd) => rd.map((s) => [...s.pair, s.d, W(s.witness)])), W(r.final)]);
const text = '{"source":"github.com/openai/math preprints/Cycle-clique-Ramsey-numbers-September-25-2026/verification/data/certificates.jsonl (Apache-2.0), compacted by proofs/ramsey/build-traces.mjs: initial flags replaced by an FNV-1a checksum","records":[\n' + out.map((r) => JSON.stringify(r)).join(',\n') + '\n]}\n';
const r = emit(join(HERE, 'traces.json'), text, { write: !CHECK });
console.log(`${out.length} records · ${(text.length / 1024).toFixed(0)} kB · ${r.same ? "unchanged" : CHECK ? "STALE" : "written"}`);
if (CHECK && !r.same) process.exit(1);
