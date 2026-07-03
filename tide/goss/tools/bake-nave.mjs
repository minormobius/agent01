// bake-nave.mjs — bake hoop's NAVE (floor 1: commons + six faction wards) into static JSON the goss
// viewer can load. Node-only: it imports the real hoop engine (nave.js → solveChunk), which the tide
// worker can never serve at runtime — so the geometry is baked here in the sandbox and committed.
//
//   node tide/goss/tools/bake-nave.mjs            # bakes the default seed set into tide/goss/data/
//   node tide/goss/tools/bake-nave.mjs 7 42       # bakes specific seeds
//
// Each nave-<seed>.json carries exactly what the goss kernel needs: per-chunk meta (biome key, faction,
// color), the chunk outline poly, and per-room {role, domain, x, y, fp (cells), people (the ENGINE's own
// cast roster — kept for the population readout; the goss society is the chunkroller-style econ re-roll)}.
// Deterministic from the seed — re-baking a seed is a byte-identical no-op.

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildNave } from '../../../hoop/nave/nave.js';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'data');
mkdirSync(outDir, { recursive: true });

const seeds = process.argv.slice(2).map(Number).filter((n) => n > 0);
const SEEDS = seeds.length ? seeds : [1, 2, 3, 5, 7, 11, 42, 99];

const r1 = (x) => Math.round(x * 10) / 10;
for (const seed of SEEDS) {
  const nv = buildNave(seed);
  const out = {
    seed, kind: 'nave', bbox: { x0: r1(nv.bbox.x0), y0: r1(nv.bbox.y0), x1: r1(nv.bbox.x1), y1: r1(nv.bbox.y1) },
    connections: nv.connections,
    chunks: nv.world.chunks.map((ch, i) => ({
      meta: { key: nv.meta[i].key, label: nv.meta[i].label, faction: nv.meta[i].faction || 'commons', color: nv.meta[i].color || null, exclusive: nv.meta[i].exclusive || null },
      poly: ch.poly.map((p) => [r1(p.x), r1(p.y)]),
      rooms: ch.rooms.map((r) => ({
        role: r.role, domain: r.domain || null, x: r1(r.x), y: r1(r.y),
        fp: r.cells ? r.cells.length : 1, people: r.people || [],
      })),
    })),
  };
  const file = join(outDir, `nave-${seed}.json`);
  writeFileSync(file, JSON.stringify(out));
  const rooms = out.chunks.reduce((s, c) => s + c.rooms.length, 0);
  const ppl = out.chunks.reduce((s, c) => s + c.rooms.reduce((t, r) => t + r.people.length, 0), 0);
  console.log(`baked ${file}: ${rooms} rooms, ${ppl} engine souls`);
}
