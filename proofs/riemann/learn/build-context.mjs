// node proofs/riemann/learn/build-context.mjs           rewrite context.txt
// node proofs/riemann/learn/build-context.mjs --check   exit 1 if context.txt is stale
//
// The deck's chatbot answers from a fixed text: every slide (title, caption,
// prediction and its answer, task, notes), the reference page's prose and
// timeline, and the Lean audit. The worker loads this file itself; the browser
// never sends context, so nobody can stuff the model with their own prompt.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const deck = readFileSync(join(here, 'index.html'), 'utf8');
const ref = readFileSync(join(here, '..', 'index.html'), 'utf8');
const audit = JSON.parse(readFileSync(join(here, '..', 'audit.json'), 'utf8'));

const unq = (s) => s.replace(/\\'/g, "'");
const text = (html) => html
  .replace(/<sup>(.*?)<\/sup>/g, '^($1)').replace(/<sub>(.*?)<\/sub>/g, '_$1')
  .replace(/<h[1-6][^>]*>(.*?)<\/h[1-6]>/g, '\n## $1\n')
  .replace(/<(p|li|div|blockquote|pre)[^>]*>/g, '\n').replace(/<br\s*\/?>/g, '\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

const out = [];
out.push('# The Riemann hypothesis: a deck at proofs.mino.mobi/riemann/learn/ and a reference page at proofs.mino.mobi/riemann/');
out.push('');
out.push('## The deck, slide by slide');

// slides: each starts with "  ch: '…', t: '…',"
const starts = [...deck.matchAll(/\n\s*ch: '((?:[^'\\]|\\.)*)', t: '((?:[^'\\]|\\.)*)',/g)];
starts.forEach((m, i) => {
  const block = deck.slice(m.index, starts[i + 1]?.index ?? deck.indexOf('\n];', m.index));
  const field = (name) => { const r = block.match(new RegExp(`\\n\\s*${name}: '((?:[^'\\\\]|\\\\.)*)'`)); return r ? unq(r[1]) : null; };
  out.push('');
  out.push(`### Slide ${i + 1}: ${unq(m[2])}  (chapter: ${unq(m[1])})`);
  const cap = field('cap'); if (cap) out.push(`Caption: ${cap}`);
  const pred = block.match(/pred: \{ q: '((?:[^'\\]|\\.)*)', opts: \[(.*?)\], a: (\d+), why: '((?:[^'\\]|\\.)*)' \}/);
  if (pred) {
    const opts = [...pred[2].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((o) => unq(o[1]));
    out.push(`Prediction asked: ${unq(pred[1])} Options: ${opts.join(' / ')}. Answer: ${opts[+pred[3]]}. ${unq(pred[4])}`);
  }
  const doo = field('do'); if (doo) out.push(`Task: ${doo}`);
  const notes = block.match(/notes: `([\s\S]*?)`,/);
  if (notes) out.push('Notes:\n' + text(notes[1]));
});

out.push('');
out.push('## The reference page');
const panes = ref.slice(ref.indexOf('<div class="panes">'), ref.indexOf('<script type="module">'));
out.push(text(panes));

out.push('');
out.push('## Timeline of attempts');
for (const h of ref.matchAll(/\{ y: ([\d.]+), k: '(\w+)', t: '((?:[^'\\]|\\.)*)', d: '((?:[^'\\]|\\.)*)' \}/g)) {
  out.push(`- ${Math.floor(+h[1])} [${h[2]}] ${unq(h[3])}: ${unq(h[4])}`);
}

out.push('');
out.push('## Static audit of the November 2026 Lean archive (read as text; not built)');
out.push(`Source: ${audit.source}, audited ${audit.auditedAt}. Toolchain ${audit.toolchain}, Mathlib ${audit.mathlibRev}.`);
out.push(`${audit.files} Lean files, ${audit.lines} lines, ${audit.bytes} bytes.`);
out.push('Main.lean:\n' + audit.main.trim());
out.push('Statements.lean:\n' + audit.statements.trim());
for (const p of audit.patterns) out.push(`- ${p.pattern}: ${p.files} files (${p.why})`);
out.push('Not done: ' + audit.notDone.join('; ') + '.');

const body = out.join('\n') + '\n';
const file = join(here, 'context.txt');
if (process.argv.includes('--check')) {
  let have = ''; try { have = readFileSync(file, 'utf8'); } catch {}
  if (have !== body) { console.error('context.txt is stale: run node proofs/riemann/learn/build-context.mjs'); process.exit(1); }
  console.log(`context.txt is current (${body.length} chars)`);
} else {
  writeFileSync(file, body);
  console.log(`wrote context.txt: ${starts.length} slides, ${body.length} chars (~${Math.round(body.length / 3.6)} tokens)`);
}
