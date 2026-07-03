// gossip.selftest.mjs — the goss kernel contract. Run: node tide/goss/test/gossip.selftest.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildGoss, buildGossNave, enrichPeople, placeName } from '../gossip.js';

let n = 0, fail = 0;
const check = (label, ok) => { n++; if (!ok) { fail++; console.error(`  ✗ ${label}`); } else console.log(`  ✓ ${label}`); };

const g = buildGoss({ seed: 7 });
const g2 = buildGoss({ seed: 7 });
const gOther = buildGoss({ seed: 42 });
const P = g.enriched.people;

// ── determinism — same seed ⇒ the same town, names, tribes, gossip, forever ──────────────────
check('determinism: people identical', JSON.stringify(P.map((p) => [p.name, p.age, p.kinship])) === JSON.stringify(g2.enriched.people.map((p) => [p.name, p.age, p.kinship])));
check('determinism: tribes identical', JSON.stringify(g.tribal.tribeOf) === JSON.stringify(g2.tribal.tribeOf));
check('determinism: dramas identical', JSON.stringify(g.dramas) === JSON.stringify(g2.dramas));
check('different seed ⇒ different gossip', JSON.stringify(g.dramas) !== JSON.stringify(gOther.dramas));

// ── demographics — every soul named, aged, pronouned; kinship structurally sane ──────────────
check('everyone has a full name', P.every((p) => p.given && p.surname && p.name === `${p.given} ${p.surname}`));
check('ages in 6..88', P.every((p) => p.age >= 6 && p.age <= 88));
check('everyone has pronouns', P.every((p) => Array.isArray(p.pronouns) && p.pronouns.length === 2));
check('everyone has kinship', P.every((p) => ['head', 'partner', 'child', 'sibling', 'kin'].includes(p.kinship)));
const hhBySurname = g.enriched.households.every((hh) => hh.members.every((i) => P[i].surname === hh.surname));
check('households share a surname', hhBySurname);
check('given names unique within household', g.enriched.households.every((hh) => new Set(hh.members.map((i) => P[i].given)).size === hh.members.length));
check('partners are both adults', g.enriched.households.every((hh) => hh.partner == null || (P[hh.head].age >= 18 && P[hh.partner].age >= 18)));
check('children are ≥16y younger than head', g.enriched.households.every((hh) => hh.members.every((i) => P[i].kinship !== 'child' || P[i].age <= P[hh.head].age - 16)));

// ── ties — symmetric projection of co-membership ─────────────────────────────────────────────
check('ties have positive weight', g.web.ties.every((t) => t.w > 0 && t.a < t.b));
check('ties carry evidence (via places)', g.web.ties.every((t) => t.via.length > 0));
const deg = new Map(); for (const t of g.web.ties) { deg.set(t.a, 1); deg.set(t.b, 1); }
check('most souls have at least one tie', deg.size / P.length > 0.95);

// ── tribes — EMERGENT (no assigned faction), total partition, more than one ──────────────────
check('every soul in exactly one tribe', g.tribal.tribeOf.length === P.length && g.tribal.tribeOf.every((t) => t >= 0 && t < g.tribal.tribes.length));
check('tribe members sum to population', g.tribal.tribes.reduce((s, t) => s + t.members.length, 0) === P.length);
check('multiple tribes emerge', g.tribal.tribes.length >= 2);
check('every tribe is named + has a totem place', g.tribal.tribes.every((t) => t.name && t.totem != null));
check('polarization in (0,1]', g.tension.polarization > 0 && g.tension.polarization <= 1);

// ── romance — adults only, never within the household, symmetric couples ─────────────────────
check('couples symmetric', g.romance.couples.every((c) => g.romance.partnerOf[c.a] === c.b && g.romance.partnerOf[c.b] === c.a));
check('sparks are adults', g.romance.sparks.every((s) => P[s.a].age >= 18 && P[s.b].age >= 18));
check('no spark within a household', g.romance.sparks.every((s) => P[s.a].home !== P[s.b].home));
check('sparks exist at default scale', g.romance.sparks.length > 0);

// ── tension — both axes present and bounded ──────────────────────────────────────────────────
check('NSD in [0,1]', g.tension.pairs.every((p) => p.nsd >= 0 && p.nsd <= 1));
check('similarity high somewhere (small differences!)', g.tension.pairs.some((p) => p.sim > 0.8));
check('link uses the null model (some pair under-stitched)', g.tension.pairs.some((p) => p.link < 0.5));
check('contested places found', g.tension.contested.length > 0);
check('contested entropy positive', g.tension.contested.every((c) => c.entropy > 0 && c.tribes >= 2));
check('rivals share the workplace', g.tension.rivals.every((r) => r.overlap >= 0.5 && r.a !== r.b));

// ── dramas — the proto-oracle: typed, ranked, evidence-bearing, referencing real souls ───────
check('dramas non-empty + heat-sorted', g.dramas.length > 0 && g.dramas.every((d, i) => i === 0 || g.dramas[i - 1].heat >= d.heat));
check('drama heat in 0..100', g.dramas.every((d) => d.heat >= 0 && d.heat <= 100));
check('drama people are real souls', g.dramas.every((d) => !d.people || d.people.every((i) => i >= 0 && i < P.length)));
check('drama tribes are real tribes', g.dramas.every((d) => !d.tribes || d.tribes.every((t) => t >= 0 && t < g.tribal.tribes.length)));
check('every drama carries evidence', g.dramas.every((d) => d.evidence && d.line && d.title));
const types = new Set(g.dramas.map((d) => d.type));
check('both tension axes reach the feed (FEUD + a romance type)', types.has('FEUD') && (types.has('STAR-CROSSED') || types.has('AFFAIR') || types.has('MATCH')));

// ── naming utility ───────────────────────────────────────────────────────────────────────────
check('placeName deterministic', placeName(g.world.places[3], 7) === placeName(g.world.places[3], 7));
check('enrichPeople standalone reruns clean', enrichPeople(g.society, 7).people[0].name === P[0].name);

// ── THE NAVE SUBSTRATE — baked floor 1, the chunkroller sampling, both pollination modes ─────
const nave = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'nave-7.json'), 'utf8'));
const gs = buildGossNave(nave, { mode: 'sealed' });
const gf = buildGossNave(nave, { mode: 'floor' });
const gs2 = buildGossNave(nave, { mode: 'sealed' });
check('nave determinism (sealed)', JSON.stringify(gs.dramas) === JSON.stringify(gs2.dramas));
check('nave is a much smaller graph than the town', gs.enriched.people.length < P.length * 0.7);
check('every nave soul carries ward + faction', gs.enriched.people.every((p) => p.ward != null && p.faction));
check('SEALED: societies never cross-pollinate (zero cross-ward ties)',
  gs.web.ties.every((t) => gs.enriched.people[t.a].ward === gs.enriched.people[t.b].ward));
check('SEALED: no tribe spans a ward', gs.tribal.tribes.every((t) => new Set(t.members.map((i) => gs.enriched.people[i].ward)).size === 1));
check('SEALED: per-ward vitality present (chunkroller sampling)', gs.wards.length === 7 && gs.wards.every((w) => w.vitality >= 0 && w.tier));
check('SEALED: alignment ≈ 1 (tribes nest inside wards)', gs.alignment.overall > 0.95);
check('FLOOR: hats cross wards (the Euclidean commute rule)', gf.web.ties.some((t) => gf.enriched.people[t.a].ward !== gf.enriched.people[t.b].ward));
check('FLOOR: alignment drops (the walls are not in the hat assignment)', gf.alignment.overall < gs.alignment.overall);
check('engine roster carried alongside (the OTHER population)', gs.enginePeople > 0 && gs.enginePeople === gf.enginePeople);
check('nave dramas fire in both modes', gs.dramas.length > 0 && gf.dramas.length > 0);
check('ward polys + meta exposed for the viewer', gs.nave.polys.length === 7 && gs.nave.meta.every((m) => m.faction));

console.log(`\n${n - fail}/${n} checks passed`);
if (fail) process.exit(1);
