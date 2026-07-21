#!/usr/bin/env node
// spec/spec.selftest.mjs — sanity gate for the /spec site map.
// Checks the generated layer (data.js) and curated layer (curated.js) agree:
// every surface has a family, overrides/healthPaths point at real things, and
// the generated data covers the whole registry. Run after regenerating:
//   node scripts/build-spec.mjs --write && node spec/spec.selftest.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (rel) => {
  const src = readFileSync(join(HERE, rel), 'utf8');
  const window = {};
  // eslint-disable-next-line no-new-func
  Function('window', src)(window);
  return window;
};
const D = load('data.js').SPEC_DATA;
const C = load('curated.js').SPEC_CURATED;
const reg = JSON.parse(readFileSync(join(HERE, '..', 'deploy-registry.json'), 'utf8'));

let fails = 0;
const check = (ok, msg) => { if (!ok) { console.error('✗', msg); fails++; } };

// 1. data covers the registry exactly
const dataKeys = new Set(D.surfaces.map((s) => s.surface));
const regKeys = new Set(reg.surfaces.map((s) => s.surface));
check(dataKeys.size === regKeys.size, `surface count: data ${dataKeys.size} vs registry ${regKeys.size} — re-run build-spec.mjs --write`);
for (const k of regKeys) check(dataKeys.has(k), `registry surface missing from data.js: ${k} — re-run build-spec.mjs --write`);

// 2. every surface has a valid family
const famIds = new Set(C.familyOrder.map((f) => f.id));
for (const s of D.surfaces) {
  const fam = C.families[s.surface];
  check(Boolean(fam), `surface has no family in curated.js: ${s.surface}`);
  if (fam) check(famIds.has(fam), `surface ${s.surface} maps to unknown family: ${fam}`);
}
for (const k of Object.keys(C.families)) check(dataKeys.has(k), `curated family entry for unknown surface: ${k}`);

// 3. overrides point at real surfaces; healthPaths at real hosts
for (const k of Object.keys(C.descOverrides)) check(dataKeys.has(k), `descOverride for unknown surface: ${k}`);
const allHosts = new Set(D.surfaces.flatMap((s) => s.hosts));
for (const h of Object.keys(C.healthPaths)) check(allHosts.has(h), `healthPath for unknown host: ${h}`);

// 4. every surface is describable (curated override, landing desc, or note)
for (const s of D.surfaces) {
  check(Boolean(C.descOverrides[s.surface] || s.desc || s.note), `surface has NO description anywhere: ${s.surface}`);
}

// 5. capability matrix is non-trivially populated
check(C.capabilities.can.length >= 3 && C.capabilities.cant.length >= 2, 'capability matrix looks empty');

// 6. probe snapshot (if present) covers every public host
if (D.probe) for (const h of allHosts) check(h in D.probe.results, `host missing from probe snapshot: ${h}`);

// 7. redaction: the spec is internet-facing — work-facing referents must not
// appear anywhere in either layer (see the redaction block in
// scripts/build-spec.mjs; the term is spelled indirectly here because this
// file is itself served under /spec/)
const REDACTED = new RegExp(['asc', 'ential'].join(''), 'i');
for (const [name, src] of [['data.js', JSON.stringify(D)], ['curated.js', JSON.stringify(C)]]) {
  check(!REDACTED.test(src), `redacted work-facing term found in ${name}`);
}

if (fails) { console.error(`spec selftest: ${fails} failure(s)`); process.exit(1); }
console.log(`spec selftest: OK — ${D.surfaces.length} surfaces, ${D.surfaces.reduce((n, s) => n + s.features.length, 0)} features, ${allHosts.size} hosts, ${famIds.size} families`);
