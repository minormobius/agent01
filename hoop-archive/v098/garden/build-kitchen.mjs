#!/usr/bin/env node
/* build-kitchen.mjs — bake the KITCHEN flavor table. The dwelling's storage fixture becomes a kitchen:
   you cook harvested crops into DISHES scored by flavor coherence (the /cards "yum" tech). Rather than
   ship the 186 KB embedding binary + 742-ingredient PMI table to the browser, we precompute — offline,
   here — the pairwise flavor coherence (cosine of the 64-d flavor-compound embeddings) and PMI between
   just the ~18 crops in our ark. The result is a tiny static garden/kitchen.json the kitchen looks up.

   Coherence = avg pairwise cosine of a dish's ingredients (recipe-page.js's coherenceScore), the same
   measure the yum recipe builder grades S/A/B/C/D/F. PMI (point-wise mutual information from 197 real
   recipes) rides along as a flavor bonus where two crops are known to co-occur.

   Usage: node hoop/v097/garden/build-kitchen.mjs   (writes hoop/v097/garden/kitchen.json) */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const ark = JSON.parse(readFileSync(join(HERE, 'ark.json'), 'utf8'));
const meta = JSON.parse(readFileSync(join(ROOT, 'cards/data/embeddings/yum-embeddings.json'), 'utf8'));
const comp = JSON.parse(readFileSync(join(ROOT, 'cards/data/food/yum-complementarity.json'), 'utf8'));
const dim = meta.dim;
const titleIdx = new Map(meta.titles.map((t, i) => [t, i]));            // ingredient title → row index
const buf = readFileSync(join(ROOT, 'cards/data/embeddings/yum-embeddings.bin'));
const emb = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));

function cos(a, b) {                                                     // cosine of two embedding rows
  const oA = a * dim, oB = b * dim; let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < dim; i++) { const x = emb[oA + i], y = emb[oB + i]; dot += x * y; na += x * x; nb += y * y; }
  const den = Math.sqrt(na) * Math.sqrt(nb); return den > 0 ? dot / den : 0;
}
// PMI lookup keyed by the same 742-ingredient index space.
const pmiMap = new Map(); for (const [ia, ib, s] of (comp.pmi || [])) { pmiMap.set(ia + '|' + ib, s); pmiMap.set(ib + '|' + ia, s); }

// map each ark crop to its flavor-embedding row (via yumName); crops with no match cook at a neutral score.
const crops = ark.crops.map((c) => ({ id: c.id, common: c.common, yumName: c.yumName || null, category: c.category, emb: c.yumName != null && titleIdx.has(c.yumName) ? titleIdx.get(c.yumName) : -1 }));
const haveEmb = crops.filter((c) => c.emb >= 0);

const pairs = {};   // "idA|idB" (sorted) → { coh, pmi }
for (let i = 0; i < haveEmb.length; i++) for (let j = i + 1; j < haveEmb.length; j++) {
  const a = haveEmb[i], b = haveEmb[j], key = [a.id, b.id].sort().join('|');
  pairs[key] = { coh: +cos(a.emb, b.emb).toFixed(4), pmi: +(pmiMap.get(a.emb + '|' + b.emb) || 0).toFixed(3) };
}

const out = {
  generatedBy: 'hoop/v097/garden/build-kitchen.mjs',
  source: 'cards/data/embeddings/yum-embeddings.{json,bin} + cards/data/food/yum-complementarity.json',
  dim, NEUTRAL: 0.28,                                                    // coherence used when a pair has no embedding data
  grades: [[0.62, 'S', 'Transcendent'], [0.5, 'A', 'Exquisite'], [0.4, 'B', 'Harmonious'], [0.3, 'C', 'Interesting'], [0.18, 'D', 'Adventurous'], [-1, 'F', 'Chaotic']],
  crops: crops.map((c) => ({ id: c.id, common: c.common, yumName: c.yumName, category: c.category, flavored: c.emb >= 0 })),
  pairCount: Object.keys(pairs).length, pairs,
};
writeFileSync(join(HERE, 'kitchen.json'), JSON.stringify(out, null, 1));
const vals = Object.values(pairs).map((p) => p.coh);
console.log(`kitchen: ${haveEmb.length}/${crops.length} crops flavored, ${out.pairCount} pairs → garden/kitchen.json`);
console.log(`  coherence range ${Math.min(...vals).toFixed(2)}…${Math.max(...vals).toFixed(2)}, mean ${(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)}`);
// a couple of sample best/worst pairs for sanity
const sorted = Object.entries(pairs).sort((a, b) => b[1].coh - a[1].coh);
console.log('  best:', sorted.slice(0, 3).map(([k, v]) => `${k}=${v.coh}`).join(', '));
console.log('  worst:', sorted.slice(-3).map(([k, v]) => `${k}=${v.coh}`).join(', '));
