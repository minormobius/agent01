// mappa/civ/chronicle.js — canonical hashing + world loading helpers.
//
// The determinism gate: a chronicle serialised canonically (rounded, ordered) hashes
// to a stable 32-bit value, so `verify` can run a config twice and assert equality.
// Also the world-loader that turns a CLI/endpoint `world` argument (a seed, a mappa
// ?w= token, a {seed,genome,n} fixture, or raw API-JSON arrays) into an engine world.

import { generateWorld } from '../engine.js';
import { decodeConfig as decodeWorldToken } from '../lib/world-share.js';
import { fnv1a, q } from './prng.js';

// deterministic, order-stable canonical string over the chronicle's numeric content.
export function chronicleHash(ch) {
  const parts = [];
  const s = ch.series || {};
  for (const k of Object.keys(s).sort()) parts.push(k + ':' + s[k].map(v => q(v, 100)).join(','));
  parts.push('EV:' + (ch.events || []).map(e => `${e.t}|${e.type}|${e.landmass ?? ''}|${e.culture ?? ''}|${e.cap || e.package || ''}|${e.n ?? ''}|${e.states ?? ''}`).join(';'));
  parts.push('KF:' + (ch.keyframes || []).map(k => `${k.t}/${k.pop}/${k.cultures}/${k.maxTier}/${(k.subDist || []).join('.')}`).join(';'));
  const f = ch.final || {};
  parts.push('FIN:' + (f.pop ?? '') + '/' + (f.cultures || []).map(c => c.size + '.' + c.sub + '.' + c.tier).join(',') + '/L' + (f.languages || []).length);
  const m = ch.meta || {};
  parts.push('META:' + [m.finalPop, m.finalCultures, m.finalLanguages, m.agriOrigins, m.industrialOrigins, m.peakAgentSlots].join(','));
  return fnv1a(parts.join('#'));
}

// Turn a `world` argument into an engine world (full-fidelity, offline).
//   - number or "N" or "seed:N"      → generateWorld(N)
//   - a mappa ?w= token              → decode → generateWorld(seed, genome)
//   - { seed, n, genome }            → generateWorld (config-style fixture)
//   - { points|elev|biome, ... }     → raw API-JSON arrays, returned as-is (adapter reconstructs mesh)
export function loadWorldSpec(spec, defaults = {}) {
  if (spec == null) throw new Error('world: missing');
  if (typeof spec === 'number') return generateWorld(spec >>> 0, { N: defaults.n || 1500 });
  if (typeof spec === 'object') {
    if (spec.elev || spec.points || spec.biome) return spec; // data-array world (API-JSON / data fixture)
    if (typeof spec.seed === 'number') {
      const g = spec.genome || {};
      return generateWorld(spec.seed >>> 0, worldOpts(g, spec.n || defaults.n));
    }
    throw new Error('world: unrecognised object shape');
  }
  // string: "seed:7", "7", or a base64url mappa token
  const str = String(spec).trim();
  const m = str.match(/^(?:seed:)?(\d+)$/);
  if (m) return generateWorld((+m[1]) >>> 0, { N: defaults.n || 1500 });
  const dec = decodeWorldToken(str);
  if (dec) return generateWorld(dec.seed, worldOpts(dec.genome, dec.n || defaults.n));
  throw new Error('world: could not parse "' + str + '"');
}
function worldOpts(genome, n) {
  const o = { N: n || 1500 };
  const g = genome || {};
  if (g.oceanFraction != null) o.oceanFraction = g.oceanFraction;
  if (g.axialTilt != null) o.axialTilt = g.axialTilt;
  if (g.waterFrac != null) o.waterFrac = g.waterFrac;
  if (g.plateCount != null) o.plateCount = g.plateCount;
  if (g.solar != null) o.solar = g.solar;
  if (g.planetRadius != null) o.planetRadius = g.planetRadius;
  if (g.age != null) o.age = g.age;
  if (g.rotationRate != null) o.rotationRate = g.rotationRate;
  return o;
}
