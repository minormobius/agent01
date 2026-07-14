// Generate the reef training corpus from the procedural species generator.
// Usage: node scripts/gen-reef-corpus.mjs [out.json] [perSpecies=140]
// Deterministic: seeds 0..per-1 for each species; the last 20 seeds per
// species are the held-out set (the trainer enforces that split).
import { writeFileSync } from 'node:fs';
import { generate, SPECIES, NCELLS, GEN_VERSION } from '../reef/js/species.js';

const out = process.argv[2] || 'reef_corpus.json';
const per = +(process.argv[3] || 140);
const shapes = [];
const labels = [];
for (let sp = 0; sp < SPECIES.length; sp++) {
  for (let seed = 0; seed < per; seed++) {
    const v = generate(sp, seed);
    const bytes = new Uint8Array(Math.ceil(NCELLS / 8));
    for (let i = 0; i < NCELLS; i++) if (v[i]) bytes[i >> 3] |= 128 >> (i & 7);
    shapes.push(Buffer.from(bytes).toString('base64'));
    labels.push(sp);
  }
}
writeFileSync(out, JSON.stringify({ gen: GEN_VERSION, per, species: SPECIES, labels, shapes }));
console.log(`${out}: ${labels.length} specimens (${per}/species, gen v${GEN_VERSION})`);
