/* ken/lab/blind.mjs — prepare a blinded judging pass over bake-off entries.

   Writes two files. `blinded.md` carries the anonymised material and is the
   ONLY one the judge reads. `mapping.json` carries the key and must not be
   opened until verdicts are committed to disk.

   Identity is stripped two ways: entries are relabelled with letters in a
   seeded shuffle, and harness/model/provider names are scrubbed from the note
   text, because an agent's own notes routinely name what produced them.

     node ken/lab/blind.mjs race-02 --write
*/
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mulberry32 } from './simulate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ARENA = join(HERE, '..', '..', 'os', 'public', 'arena');
const OUT = join(HERE, 'judging');

/** Names that would leak identity out of an entry's own prose. */
const SCRUB = [
  /\bclaude\s*code\b/gi, /\bclaude\b/gi, /\bopencode\b/gi, /\banthropic\b/gi,
  /\bkimi[\s-]?3?\b/gi, /\bmoonshot\b/gi, /\bdeepseek\b/gi, /\bds4[\s-]?(pro|flash)?\b/gi,
  /\bgpt[\s-]?\d?\b/gi, /\bo[1-4]\b/gi, /\bsonnet\b/gi, /\bopus\b/gi, /\bhaiku\b/gi,
];

export function scrub(text) {
  let t = text;
  for (const re of SCRUB) t = t.replace(re, '[model]');
  return t;
}

export function prepare(race = 'race-02', { seed = 31337, maxChars = 2600 } = {}) {
  const dir = join(ARENA, race, 'entries');
  const cells = readdirSync(dir).filter((d) => existsSync(join(dir, d, 'NOTES.md'))).sort();

  const rng = mulberry32(seed);
  const order = cells.map((c, i) => ({ c, k: rng(), i }))
    .sort((a, b) => a.k - b.k).map((o) => o.c);

  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const items = order.map((cell, i) => {
    const raw = readFileSync(join(dir, cell, 'NOTES.md'), 'utf8');
    let text = scrub(raw).replace(/\r/g, '').trim();
    if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n…[truncated]`;
    return { label: letters[i], cell, text, chars: raw.length };
  });

  const blinded = [
    '# Blinded judging material',
    '',
    `Race \`${race}\`. ${items.length} entries, relabelled and scrubbed. Same brief for all:`,
    'repair the gravity bug and turn the demo into a race with a clock, laps and a best time.',
    '',
    'Judge on what the notes show about **craft and ambition**: does the author understand the',
    'defect, is the fix principled or patched, what did they choose to build beyond the minimum,',
    'and are the claims honest about what was not done. The notes are all you get — nobody can',
    'see the game render.',
    '',
    ...items.flatMap((it) => ['---', '', `## Entry ${it.label}`, '', it.text, '']),
  ].join('\n');

  return { race, seed, items, blinded };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const race = process.argv[2] || 'race-02';
  const { items, blinded, seed } = prepare(race);
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  if (process.argv.includes('--write')) {
    writeFileSync(join(OUT, `${race}.blinded.md`), blinded);
    writeFileSync(join(OUT, `${race}.mapping.json`),
      `${JSON.stringify({ race, seed, map: Object.fromEntries(items.map((i) => [i.label, i.cell])) }, null, 2)}\n`);
    console.log(`wrote ${race}.blinded.md (${blinded.length}B) and ${race}.mapping.json`);
    console.log('DO NOT open the mapping until verdicts are committed.');
  }
  console.log(`${items.length} entries, labels ${items.map((i) => i.label).join(' ')}`);
}
