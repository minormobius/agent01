#!/usr/bin/env node
// No unresolved merge conflict may be committed into a .md file under plant/ (lp-ad6c32).
//
// WHY THIS EXISTS AND WHY IT IS THE *ONLY* DOC CHECK HERE. A conflict marker in
// a .mjs file is a syntax error: it kills every assertion in that file, loudly,
// the first time anything imports it. In markdown it is INERT. So the one file
// in this tree where a broken merge produces no signal at all is plant/CLAUDE.md
// — the file every turn reads to find out what is true here. That is exactly
// what happened: lines 192-214 carried a three-way conflict, with two
// contradictory accounts of the `won` rule and git syntax between them, and
// nothing anywhere went red.
//
// This is deliberately NOT a documentation linter. "Does this paragraph still
// describe the code" is undecidable and this tree has three recorded instances
// of it. A conflict marker is the one kind of doc rot a machine can detect
// perfectly, and detecting perfectly one thing beats detecting vaguely several.
//
// THE WHOLE FILE IS A NEGATION, which is the easiest thing in the world to pass
// by accident: an empty file list passes, a typo'd regex passes, a walk that
// silently returns nothing passes. So every predicate below is fed something it
// MUST catch (§2) as well as things it must not (§3), and the file list itself
// is asserted non-empty and asserted to contain plant/CLAUDE.md by name (§1).
//
// TWO DELIBERATE REFINEMENTS ON THE OBVIOUS `/^(<<<<<<< |=======$|>>>>>>> )/`,
// both of which REMOVE FALSE POSITIVES without losing a single true one. A
// checker that fails correct work is worse than no checker, and a marker check
// that cries wolf on ordinary markdown gets deleted rather than fixed.
//
//   1. FENCED CODE BLOCKS ARE EXEMPT. A document explaining conflict markers —
//      this one's own bead body does it — has to quote them, and it will quote
//      them inside a fence. Without the exemption, documenting the hazard trips
//      the check that exists to catch it. The exemption is CONSERVATIVE: an
//      opener with no matching closer exempts NOTHING, so a conflict that
//      lands mid-fence and breaks the fence balance is still caught (§3, the
//      unclosed-fence control). What is genuinely still missed is a conflict
//      wholly inside a properly balanced fence; that is the residual and it is
//      stated here rather than left to be discovered.
//
//   2. A BARE `=======` COUNTS ONLY INSIDE AN OPEN CONFLICT. Matching it as a
//      whole line is not enough on its own: a setext heading underline is a run
//      of `=` on its own line, and exactly seven of them is legal markdown.
//      Requiring an unclosed `<<<<<<< ` above it removes that false positive
//      COMPLETELY and costs nothing, because a lone `=======` with no `<<<<<<<`
//      before it and no `>>>>>>>` after it is not a conflict — it is a rule.
//      The two angle-bracket markers have no legitimate markdown meaning at all
//      and so are flagged unconditionally.
//
// NOT MATCHED, on purpose: diff3's base marker, a run of seven `|`. A diff3
// conflict still writes `<<<<<<< `, `=======` and `>>>>>>> `, so every diff3
// conflict is already caught by the three markers above — adding a fourth
// pattern that begins with a pipe buys no detection and puts the check one
// unlucky markdown table away from crying wolf.
//
// Every marker literal below is BUILT with repeat(7) rather than typed, so a
// miscounted run of angle brackets cannot silently weaken the check.
//
// Run: node plant/test/docs.selftest.mjs

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

let failed = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { console.log(`  ✓ ${name}`); return; }
  failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
};

const LT = '<'.repeat(7);
const GT = '>'.repeat(7);
const EQ = '='.repeat(7);

// ── the predicate ──────────────────────────────────────────────────────────

// Which lines sit inside a CLOSED fenced code block. An unclosed opener marks
// nothing, so the tail of a file with a dangling fence is scanned as ordinary
// text — the conservative direction, and the one that keeps a conflict which
// breaks fence balance visible.
function fencedLines(lines) {
  const inFence = new Array(lines.length).fill(false);
  let open = -1;
  let tok = '';
  for (let i = 0; i < lines.length; i++) {
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(lines[i]);
    if (open < 0) {
      if (m) { open = i; tok = m[1][0]; }
      continue;
    }
    // Only a fence of the SAME character closes one: ~~~ does not close ```.
    if (m && m[1][0] === tok) {
      for (let j = open; j <= i; j++) inFence[j] = true;
      open = -1;
      tok = '';
    }
  }
  return inFence;
}

// Every unresolved-conflict marker line, as { line (1-based), marker }.
function conflictMarkers(text) {
  const lines = text.split(/\r?\n/);
  const fenced = fencedLines(lines);
  const hits = [];
  let open = false;
  for (let i = 0; i < lines.length; i++) {
    if (fenced[i]) continue;
    const line = lines[i];
    if (line.startsWith(`${LT} `)) { hits.push({ line: i + 1, marker: LT }); open = true; }
    else if (line.startsWith(`${GT} `)) { hits.push({ line: i + 1, marker: GT }); open = false; }
    else if (open && line === EQ) { hits.push({ line: i + 1, marker: EQ }); }
  }
  return hits;
}

// Every .md under plant/, recursively — plant/levels/ and plant/tools/ may gain
// one, and a check that only looks at the file it was written for stops working
// the moment somebody adds a second.
function markdownFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...markdownFiles(full));
    else if (e.name.endsWith('.md')) out.push(full);
  }
  return out.sort();
}

// ── §1 the walk found something, and it found the file this is about ───────

console.log('\n(1) the walk is not vacuous');
const files = markdownFiles(root);
const rel = files.map((f) => relative(root, f).split(sep).join('/'));
ok('at least one .md file was found under plant/', files.length > 0, `${files.length} found`);
ok('…and plant/CLAUDE.md is one of them, by name', rel.includes('CLAUDE.md'), rel.join(', '));
const texts = files.map((f) => readFileSync(f, 'utf8'));
ok('…and the files really were read, rather than merely named',
  texts.reduce((n, t) => n + t.length, 0) > 0);

// ── §2 the predicate FIRES on a real conflict ──────────────────────────────

console.log('\n(2) the positive control — the predicate catches a real three-way conflict');
{
  // Everything in §4 is a negation. Without this section an empty file list, a
  // walk that returns nothing, or a regex with a typo all pass silently, and
  // the whole gate reports success while measuring nothing.
  const synthetic = [
    `${LT} HEAD`,
    'ours',
    EQ,
    'theirs',
    `${GT} bd5a77f (a branch)`,
  ].join('\n');
  const hits = conflictMarkers(synthetic);
  ok('a synthetic conflict fires', hits.length === 3, `${hits.length} hits`);
  ok('…and names all three markers', hits.map((h) => h.marker).join(' ') === `${LT} ${EQ} ${GT}`);
  ok('…at the right lines', hits.map((h) => h.line).join(',') === '1,3,5',
    hits.map((h) => h.line).join(','));

  // The exact shape that was committed into plant/CLAUDE.md, with the real
  // branch line, so this gate demonstrably catches the defect it was written
  // for rather than a stylised version of it.
  const real = [
    'and the follow-up that wires the page',
    `${LT} HEAD`,
    'must take its control bounds *from here* instead of keeping a second copy.',
    EQ,
    'rather than keeping a second copy. For a knob with `parts` the',
    `${GT} bd5a77f (loop: turn 68 on lp-b27cc4 — awaiting verdict)`,
  ].join('\n');
  ok('the conflict that actually shipped in plant/CLAUDE.md fires',
    conflictMarkers(real).length === 3);
}

// ── §3 the predicate does NOT fire on ordinary markdown ────────────────────

console.log('\n(3) the negative controls — ordinary markdown does not cry wolf');
{
  ok('a line of prose ending in a run of equals mid-sentence does not fire',
    conflictMarkers('A row of equals like ======= closes the example.').length === 0);
  ok('…nor a run of equals with text welded onto it',
    conflictMarkers(`${EQ}text follows`).length === 0);

  // THE SETEXT CASE, which whole-line matching alone does NOT solve: a heading
  // underline is a run of `=` on its own line, and seven of them is legal.
  ok('…nor a bare whole-line run of equals with no conflict open above it — a setext underline',
    conflictMarkers(['A heading', EQ, '', 'body text'].join('\n')).length === 0);

  // …and the other half of that conjunction: the SAME line inside an open
  // conflict must fire. Without this pair the rule cannot be told from
  // "never match a bare equals at all".
  ok('…but the same line INSIDE an open conflict does fire',
    conflictMarkers([`${LT} HEAD`, 'a', EQ, 'b'].join('\n')).length === 2);

  const fenced = [
    'Here is what an unresolved conflict looks like:',
    '',
    '```',
    `${LT} HEAD`,
    'ours',
    EQ,
    'theirs',
    `${GT} other`,
    '```',
    '',
    'A diff example is likewise unremarkable:',
    '',
    '```diff',
    '--- a/plant/CLAUDE.md',
    '+++ b/plant/CLAUDE.md',
    '@@ -190,7 +190,7 @@',
    '```',
  ].join('\n');
  ok('…nor a fenced code block quoting markers, or a diff example',
    conflictMarkers(fenced).length === 0, JSON.stringify(conflictMarkers(fenced)));

  // THE HOLE THE FENCE EXEMPTION OPENS, and the control that closes it: a bug
  // treating the first fence as "ignore the rest of the file" passes every
  // other assertion in this section. A real marker AFTER a closed fence must
  // still fire.
  const after = `${fenced}\n${LT} HEAD\nours\n${EQ}\ntheirs\n${GT} other`;
  ok('…but a real conflict AFTER a closed fence still fires, so the fence closes',
    conflictMarkers(after).length === 3, `${conflictMarkers(after).length} hits`);

  // AN UNCLOSED FENCE EXEMPTS NOTHING. This is the conservative rule, and it is
  // what keeps a conflict that lands mid-fence (and so breaks the balance)
  // visible instead of swallowed.
  const unclosed = ['```', `${LT} HEAD`, 'ours', EQ, 'theirs', `${GT} other`].join('\n');
  ok('…and a DANGLING fence exempts nothing at all',
    conflictMarkers(unclosed).length === 3, `${conflictMarkers(unclosed).length} hits`);

  // Only a fence of the same character closes one.
  const mismatched = ['```', 'x', '~~~', `${LT} HEAD`, 'a', EQ, 'b', `${GT} c`].join('\n');
  ok('…and a tilde fence does not close a backtick one, so that region stays unclosed and scanned',
    conflictMarkers(mismatched).length === 3, `${conflictMarkers(mismatched).length} hits`);
}

// ── §4 the actual claim ────────────────────────────────────────────────────

console.log('\n(4) no .md file under plant/ carries an unresolved conflict');
for (let i = 0; i < files.length; i++) {
  const hits = conflictMarkers(texts[i]);
  ok(`${rel[i]} is clean`, hits.length === 0,
    hits.map((h) => `${h.marker} at line ${h.line}`).join('; '));
}

console.log('');
if (failed) { console.log(`✗ docs selftest: ${failed} failing\n`); process.exit(1); }
console.log('✓ docs selftest passed\n');
