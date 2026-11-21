// node proofs/riemann/audit.mjs --src <extracted lean/ dir> [--write]
//
// A *static* read of the Lean archive published with the November 2026 claim
// (alpo.ge/lean.tar.gz.part01 … part14, concatenated, gunzipped, untarred).
// It reads text only and never runs Lean, lake, or anything inside the archive.
// It is not a proof check: it cannot tell you the archive compiles, only what
// the source says and whether the usual escape hatches appear in it.
//
// --write saves the result to proofs/riemann/audit.json, which the page reads.
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (k) => { const i = process.argv.indexOf(k); return i < 0 ? null : process.argv[i + 1]; };
const src = arg('--src');
if (!src) { console.error('usage: audit.mjs --src <lean dir> [--write]'); process.exit(2); }

const files = [];
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p); else if (e.name.endsWith('.lean')) files.push(p);
  }
})(join(src, 'src'));

// patterns, each with why it matters
const PATTERNS = [
  ['axiom', /^\s*(?:private\s+|protected\s+)?axiom\s/m, 'a new axiom: anything can follow from it'],
  ['sorry', /\bsorry\b/, 'an unproved hole'],
  ['admit', /\badmit\b/, 'an unproved hole (tactic form)'],
  ['native_decide', /\bnative_decide\b/, 'trusts compiled code instead of the kernel'],
  ['ofReduceBool', /ofReduceBool/, 'the axiom native_decide rests on'],
  ['implemented_by', /implemented_by/, 'swaps a definition for other code at runtime'],
  ['extern', /@\[extern/, 'foreign code'],
  ['opaque', /^\s*(?:private\s+)?opaque\s/m, 'a constant whose body the kernel cannot see'],
  ['unsafe', /\bunsafe\b/, 'outside the kernel\'s guarantees'],
  ['debug.skipKernelTC', /skipKernelTC/, 'turns off kernel type checking'],
  ['import Lean', /^import Lean\b/m, 'metaprogramming: harmless by itself, worth reading'],
  ['addDecl', /\baddDecl\b/, 'adds declarations from code (still kernel-checked)'],
  ['run_cmd / run_elab', /\brun_(?:cmd|elab|meta)\b/, 'runs code while compiling'],
  ['custom elab / macro', /^\s*(?:elab|macro|syntax)\b/m, 'new syntax or tactics'],
];

let lines = 0, bytes = 0;
const hits = Object.fromEntries(PATTERNS.map(([k]) => [k, []]));
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  bytes += statSync(f).size;
  lines += text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
  for (const [k, re] of PATTERNS) if (re.test(text)) hits[k].push(relative(join(src, 'src'), f));
}

const read = (p) => readFileSync(join(src, p), 'utf8');
const manifest = JSON.parse(read('lake-manifest.json'));
const out = {
  source: 'alpo.ge/lean.tar.gz.part01 … part14',
  auditedAt: new Date().toISOString().slice(0, 10),
  toolchain: read('lean-toolchain').trim(),
  mathlibRev: manifest.packages.find((p) => p.name === 'mathlib')?.rev,
  files: files.length,
  lines,
  bytes,
  topLevelDirs: [...new Set(files.map((f) => relative(join(src, 'src'), f).split('/')[0]))].filter((d) => !d.endsWith('.lean')).sort(),
  main: read('src/Main.lean'),
  statements: read('src/Statements.lean'),
  patterns: PATTERNS.map(([k, , why]) => ({ pattern: k, why, files: hits[k].length, examples: hits[k].slice(0, 6) })),
  notDone: [
    'build the project (lake build) and so have the kernel check every proof',
    'run #print axioms riemannHypothesis on the built environment',
    'replay the .olean files with an independent checker (lean4checker, or a Comparator-style challenge)',
  ],
};
console.log(JSON.stringify({ ...out, main: undefined, statements: undefined }, null, 1));
if (process.argv.includes('--write')) {
  const here = dirname(fileURLToPath(import.meta.url));
  writeFileSync(join(here, 'audit.json'), JSON.stringify(out, null, 1) + '\n');
  console.log('wrote audit.json');
}
