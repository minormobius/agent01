#!/usr/bin/env node
// lily.mjs — write each piece's score.ly (the score clef opens from "View the score").
//
//   node studio/tools/lily.mjs            # write studio/<piece>/score.ly
//   node studio/tools/lily.mjs --check    # exit 1 if any is stale (the selftest runs this)

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { toLily } from '../lib/lilypond.js';

const here = dirname(fileURLToPath(import.meta.url));
export const PIECES = [
  { slug: 'anthesis', subtitle: 'a poppy, from seed to bloom' },
  { slug: 'coquelicots', subtitle: 'a field, painted outward from one seed' },
  { slug: 'nocturne', subtitle: 'a city, lit one window per note' },
];

export async function generate(slug, subtitle) {
  const s = await import(join(here, '..', slug, 'score.js'));
  return toLily({ title: s.title, subtitle, written: s.written, notation: s.notation });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const { slug, subtitle } of PIECES) {
    const ly = await generate(slug, subtitle);
    const path = join(here, '..', slug, 'score.ly');
    let old = null;
    try { old = await readFile(path, 'utf8'); } catch { /* new */ }
    if (old === ly) { console.log(`✓ ${slug}/score.ly current`); continue; }
    if (check) { console.log(`✗ ${slug}/score.ly is stale — run node studio/tools/lily.mjs`); stale++; continue; }
    await writeFile(path, ly);
    console.log(`wrote ${slug}/score.ly (${ly.length} bytes)`);
  }
  process.exit(stale ? 1 : 0);
}
