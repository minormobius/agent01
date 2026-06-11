// biome/graph/build-organisms.mjs — resolve organism imagery for the /graph endpoint.
//
// The force-directed trophic web at biome.mino.mobi/graph pulls a real photo into every
// organism node. This script resolves each species in BOTH rosters (land roster.mjs +
// LAKE_ROSTER) to its iNaturalist default photo by scientific name, and writes a single
// committed map `organisms.json` that the page reads. It mirrors enrich-roster.mjs (same
// iNat endpoint), but spans both rosters and is shaped for the renderer (id → photo + meta).
//
// Best-effort + idempotent: a species iNat can't resolve (e.g. the benthic-microbe proxy,
// which is a community, not a taxon) degrades to a null photo and the page draws a styled
// fallback node. The engine NEVER reads this file — it is imagery only.
//
// Run: node biome/graph/build-organisms.mjs        (writes organisms.json)
//      node biome/graph/build-organisms.mjs --dry  (prints, writes nothing)

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROSTER } from '../cycles/sim/roster.mjs';
import { LAKE_ROSTER } from '../cycles/sim/lake.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'organisms.json');
const DRY = process.argv.includes('--dry');
const UA = { 'User-Agent': 'biome.mino.mobi /graph imagery (github.com/minormobius/agent01)' };

async function getJSON(url, ms = 20000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function inat(sciName) {
  const j = await getJSON(`https://api.inaturalist.org/v1/taxa?q=${encodeURIComponent(sciName)}&rank=species&per_page=1`);
  const t = j?.results?.[0];
  if (!t) return null;
  const photo = t.default_photo;
  // medium_url is ~500px; square_url is a crisp cropped thumbnail that clips beautifully into a node.
  return {
    inatId: t.id,
    commonName: t.preferred_common_name ?? null,
    wikipediaUrl: t.wikipedia_url ?? null,
    photo: photo ? (photo.medium_url ?? photo.url ?? null) : null,
    thumb: photo ? (photo.square_url ?? photo.medium_url ?? photo.url ?? null) : null,
    attribution: photo?.attribution ?? null,
  };
}

const both = [
  ...ROSTER.map((o) => ({ ...o, web: 'land' })),
  ...LAKE_ROSTER.map((o) => ({ ...o, web: 'lake' })),
];

const out = { generatedAt: new Date().toISOString(), source: 'iNaturalist', organisms: {} };
for (const o of both) {
  process.stderr.write(`· [${o.web}] ${o.sciName} … `);
  const id = await inat(o.sciName);
  out.organisms[o.id] = {
    id: o.id, web: o.web, kind: o.kind, sciName: o.sciName, common: o.common,
    inat: id ?? null,
  };
  process.stderr.write(`${id?.photo ? 'iNat#' + id.inatId : 'no-photo'}\n`);
}

if (DRY) {
  console.log(JSON.stringify(out, null, 2));
} else {
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  process.stderr.write(`\nwrote ${OUT}\n`);
}
