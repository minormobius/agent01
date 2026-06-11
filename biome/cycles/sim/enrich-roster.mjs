// biome/cycles/sim/enrich-roster.mjs — fetch real provenance for the roster.
//
// For every ROSTER entry, pulls:
//   • iNaturalist  — taxon id, default photo URL, accepted common name (identity + imagery)
//   • GloBI        — the species' observed `eats` targets (corroborates the curated diet)
// and writes roster.enriched.json next to roster.mjs. Best-effort and idempotent: network
// failures degrade to nulls, so a partial run still produces a usable file. The engine
// NEVER reads this file — it's documentation/imagery for the UI and a diet cross-check.
//
// Run: node biome/cycles/sim/enrich-roster.mjs        (writes roster.enriched.json)
//      node biome/cycles/sim/enrich-roster.mjs --dry  (prints, writes nothing)
// Wired into CI via .github/workflows/enrich-roster.yml (manual / on roster.mjs change).

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { ROSTER } from './roster.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'roster.enriched.json');
const DRY = process.argv.includes('--dry');
const UA = { 'User-Agent': 'biome.mino.mobi roster enrichment (github.com/minormobius/agent01)' };

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
  return {
    inatId: t.id,
    commonName: t.preferred_common_name ?? null,
    wikipediaUrl: t.wikipedia_url ?? null,
    photo: photo ? (photo.medium_url ?? photo.url ?? null) : null,
    photoAttribution: photo?.attribution ?? null,
  };
}

async function globiEats(sciName, limit = 60) {
  const j = await getJSON(`https://api.globalbioticinteractions.org/taxon/${encodeURIComponent(sciName)}/eats?type=json.v2&limit=${limit}`);
  if (!Array.isArray(j)) return null;
  const targets = new Set();
  for (const rec of j) {
    const names = rec.target_taxon_name;
    if (Array.isArray(names)) names.forEach((n) => n && targets.add(n));
    else if (typeof names === 'string') targets.add(names);
    else if (rec.target?.name) targets.add(rec.target.name);
  }
  return [...targets].slice(0, 40);
}

const out = { generatedAt: new Date().toISOString(), source: 'iNaturalist + GloBI', entries: {} };
for (const o of ROSTER) {
  process.stderr.write(`· ${o.sciName} … `);
  const [id, eats] = await Promise.all([inat(o.sciName), o.kind === 'animal' ? globiEats(o.sciName) : Promise.resolve(null)]);
  out.entries[o.id] = {
    id: o.id, sciName: o.sciName, common: o.common, kind: o.kind,
    inat: id ?? null,
    globiEats: eats ?? null,
    curatedEats: o.eats ?? null,
  };
  process.stderr.write(`${id ? 'iNat#' + id.inatId : 'iNat∅'}${eats ? `, GloBI ${eats.length} prey` : ''}\n`);
}

if (DRY) {
  console.log(JSON.stringify(out, null, 2));
} else {
  writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
  process.stderr.write(`\nwrote ${OUT}\n`);
}
