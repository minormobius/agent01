// corpus.mjs — a decision corpus built from this repo's own deploy registry.
//
// Real state, computed ground truth, and the four classes the escalation
// measurement used: three of them are unanswerable from the state and MUST
// leave tier 1. Using the registry rather than a synthetic table matters,
// because the question this eval is really asking is whether the cascade
// works on the kind of state a loop would actually hand it.
import { readFileSync } from 'node:fs';

export function buildCorpus(registryPath, { seed = 7 } = {}) {
  const reg = JSON.parse(readFileSync(registryPath, 'utf8'));
  const surfaces = reg.surfaces.filter((s) => s.surface && s.branch && s.endpoint);
  let a = seed >>> 0;
  const rnd = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const pick = (xs) => xs[Math.floor(rnd() * xs.length)];

  // The live state the reactive tier reads: four fields per surface, nothing
  // else. Everything the corpus asks about beyond these four is, by
  // construction, not in the state.
  const state = [
    'DEPLOY REGISTRY, current. Authoritative and complete: any surface or field',
    'not listed here is not recorded anywhere.',
    'surface | dir | endpoint | owning_branch',
    ...surfaces.map((s) => `${s.surface} | ${s.dir} | ${s.endpoint} | ${s.branch}`),
  ].join('\n');

  const decisions = [];
  const add = (cls, ask, slice, truth = null) =>
    decisions.push({ id: `${cls.toLowerCase()}${decisions.length}`, cls, ask, slice, truth });

  // ANSWERABLE — the fact is in the table. Half true, half false by
  // construction, so a tier that always says yes scores 50%.
  for (let i = 0; i < 24; i++) {
    const s = surfaces[i % surfaces.length];
    const slice = `${s.surface} | ${s.dir} | ${s.endpoint} | ${s.branch}`;
    if (i % 2 === 0) {
      add('ANSWERABLE', `Does the surface "${s.surface}" deploy from the branch "${s.branch}"?`, slice, true);
    } else {
      const other = pick(surfaces.filter((x) => x.branch !== s.branch)) || s;
      add('ANSWERABLE', `Does the surface "${s.surface}" deploy from the branch "${other.branch}"?`, slice, false);
    }
  }
  for (let i = 0; i < 8; i++) {
    const s = surfaces[(i * 5) % surfaces.length];
    const slice = `${s.surface} | ${s.dir} | ${s.endpoint} | ${s.branch}`;
    const claim = i % 2 === 0 ? s.endpoint : pick(surfaces).endpoint;
    add('ANSWERABLE', `Is the surface "${s.surface}" served at "${claim}"?`, slice, claim === s.endpoint);
  }

  // NO_ENTITY — a surface that is not in the registry at all. This is the
  // class a plain confidence gate answered 15/15 with conviction.
  for (let i = 0; i < 10; i++) {
    add('NO_ENTITY', `Does the surface "quarry-${i}7" deploy from the branch "main"?`, '');
  }
  // NO_FIELD — the surface exists; the field does not.
  for (let i = 0; i < 10; i++) {
    const s = surfaces[(i * 3) % surfaces.length];
    add('NO_FIELD', `Is the surface "${s.surface}" configured with a health-check interval under 30 seconds?`,
      `${s.surface} | ${s.dir} | ${s.endpoint} | ${s.branch}`);
  }
  // NOT_DERIVABLE — every term is present, the answer is not.
  for (let i = 0; i < 10; i++) {
    const s = surfaces[(i * 7) % surfaces.length];
    const o = surfaces[(i * 11 + 3) % surfaces.length];
    add('NOT_DERIVABLE', `Was the surface "${s.surface}" deployed more recently than "${o.surface}"?`,
      `${s.surface} | ${s.dir} | ${s.endpoint} | ${s.branch}\n${o.surface} | ${o.dir} | ${o.endpoint} | ${o.branch}`);
  }

  return { state, decisions, surfaceCount: surfaces.length };
}

/** A decision is answerable exactly when the corpus says so. */
export const shouldStayLocal = (d) => d.cls === 'ANSWERABLE';
