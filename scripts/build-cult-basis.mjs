#!/usr/bin/env node
// Pre-compute basis embeddings for wars/cult/.
//
// Reads the curated list from wars/cult/basis.js, dedupes by lowercase title,
// embeds each title with Xenova/all-MiniLM-L6-v2 (384-dim, L2-normalized),
// then writes:
//   wars/cult/basis.bin  — Float32 matrix, row-major, dedupedCount * 384
//   wars/cult/basis.json — { model, dim, count, generated_at, items: [{t,k}] }
//
// Run locally:    npm install --no-save @xenova/transformers@2.17.2
//                 node scripts/build-cult-basis.mjs
// Run in CI:      .github/workflows/build-cult-basis.yml

import { writeFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_DIR = join(ROOT, 'wars', 'cult');
const BIN_PATH = join(OUT_DIR, 'basis.bin');
const JSON_PATH = join(OUT_DIR, 'basis.json');

const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const DIM = 384;
const BATCH_SIZE = 32;

function dedupe(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const key = it.t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function main() {
  const t0 = Date.now();

  const { BASIS } = await import(join(OUT_DIR, 'basis.js'));
  const items = dedupe(BASIS);
  console.log(`[cult-basis] ${BASIS.length} entries, ${items.length} unique after dedupe`);

  const { pipeline, env } = await import('@xenova/transformers');
  env.allowLocalModels = false;
  env.cacheDir = process.env.HF_HOME || env.cacheDir;

  console.log(`[cult-basis] loading ${MODEL_ID}…`);
  const extractor = await pipeline('feature-extraction', MODEL_ID, { quantized: true });

  const matrix = new Float32Array(items.length * DIM);
  let done = 0;
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const slice = items.slice(i, i + BATCH_SIZE).map((b) => b.t);
    const out = await extractor(slice, { pooling: 'mean', normalize: true });
    matrix.set(out.data, i * DIM);
    done = Math.min(i + BATCH_SIZE, items.length);
    process.stdout.write(`\r[cult-basis] embedded ${done}/${items.length}`);
  }
  process.stdout.write('\n');

  writeFileSync(BIN_PATH, Buffer.from(matrix.buffer));
  writeFileSync(
    JSON_PATH,
    JSON.stringify(
      {
        model: MODEL_ID,
        dim: DIM,
        count: items.length,
        generated_at: new Date().toISOString(),
        items: items.map((it) => ({ t: it.t, k: it.k })),
      },
      null,
      0,
    ) + '\n',
  );

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  const binBytes = statSync(BIN_PATH).size;
  const jsonBytes = statSync(JSON_PATH).size;
  console.log(
    `[cult-basis] wrote ${BIN_PATH} (${(binBytes / 1024).toFixed(1)} KB) and ${JSON_PATH} (${(jsonBytes / 1024).toFixed(1)} KB) in ${elapsed}s`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
