// worker-imports.selftest.mjs — the worker's side-effect imports must evaluate
// in a working order.
//
// wormhole's modules are browser scripts that hang themselves off globalThis
// and throw if a dependency isn't there yet, so worker.js's import block is
// order-sensitive. Getting it wrong doesn't fail any other test — it fails at
// Cloudflare's script-validation step during upload, so the deploy goes red
// with the source looking perfectly fine. That happened: analysis.js sat
// before genome.js and wormhole could not deploy for two days.
//
// This reads the real import list out of worker.js and evaluates it in that
// exact order, so the failure surfaces here instead of in a deploy log.
//
//   node wormhole/worker-imports.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(HERE, 'worker.js'), 'utf8');

const imports = [...src.matchAll(/^\s*import\s+["']\.\/([^"']+)["'];/gm)].map((m) => m[1]);
if (!imports.length) {
  console.error('✗ found no side-effect imports in worker.js — has the module layout changed?');
  process.exit(1);
}

for (const [i, file] of imports.entries()) {
  try {
    await import(pathToFileURL(join(HERE, file)).href);
  } catch (err) {
    console.error(`✗ worker.js import #${i + 1} (${file}) failed to evaluate:`);
    console.error(`    ${err.message}`);
    console.error('  This is the error Cloudflare raises when validating the uploaded');
    console.error('  script. Reorder the imports in worker.js so dependencies come first.');
    process.exit(1);
  }
}

// The globals the pages and the worker actually read off the namespace.
const REQUIRED = [
  'WORMHOLE', 'WORMHOLE_STATS', 'WORMHOLE_CHARTS',
  'WORMHOLE_DATA', 'WORMHOLE_GENOME', 'WORMHOLE_ANALYSIS', 'WORMHOLE_PAPER',
];
const absent = REQUIRED.filter((g) => !globalThis[g]);
if (absent.length) {
  console.error(`✗ modules loaded but these globals are absent: ${absent.join(', ')}`);
  process.exit(1);
}

console.log(`✓ worker.js imports evaluate in order (${imports.length} modules, ${REQUIRED.length} globals present)`);
