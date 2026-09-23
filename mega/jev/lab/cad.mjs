// cad.mjs — the composition test against a real kernel.
//
// The sprite chain proved a sequence of typed decisions holds together. This is
// the same experiment with a parametric CAD kernel underneath, which supplies
// two things sprites could not: real legality, and ground truth that was
// computed rather than defined by us.
//
// THE ENDPOINT. `https://cad.mino.mobi/mcp`, JSON-RPC over HTTP. `check`
// resolves a tree (~40ms). `build` runs the Truck kernel and returns volume,
// area, bbox, centroid, Euler characteristic, WATERTIGHTNESS, open and flipped
// edge counts, and every named face (~150-350ms for a simple part).
//
// TWO THINGS MEASURED BEFORE ANY OF THIS WAS DESIGNED, both of which changed it:
//
// 1. `check` DOES NOT validate geometry. It passed a tree with the pillar
//    holes 999mm off a 20mm disc, a NEGATIVE thickness, and R = 0. Only
//    `build` rejected R = 0. So `check` validates expression resolution, and
//    **the enumerator has to encode geometric sense itself** — which is
//    exactly where the safety property was always going to live. "A search
//    that cannot propose an invalid model" is a property of the enumerator,
//    not something a kernel's cheap path hands you.
//
// 2. A part can resolve, build, and be watertight, and still be the wrong
//    part. Setting `r_centre` to 25 on a disc of R = 20 built cleanly at
//    volume 1065 with the bbox grown to 24mm — the even-odd composition
//    flipped which region was solid. **Valid is not correct.** Nothing on the
//    kernel side can catch that, and it is the strongest argument for the
//    constraints below being written down rather than assumed.
//
// Pure except for `fetch`; no keys, read-only, builds nothing locally.

export const MCP = 'https://cad.mino.mobi/mcp';

/** One JSON-RPC call. Returns the structured content, or throws with the error. */
export async function cadCall(name, args, { endpoint = MCP, fetchImpl = fetch } = {}) {
  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
  });
  if (!res.ok) throw new Error(`cad ${res.status}`);
  const b = await res.json();
  if (b.error) throw new Error(`cad ${name}: ${JSON.stringify(b.error).slice(0, 160)}`);
  return b.result?.structuredContent ?? b.result ?? b;
}

/**
 * The movable parameters of `bench:plate`, with the constraints that keep the
 * part a plate.
 *
 * EVERY BOUND HERE IS A GEOMETRIC FACT THE KERNEL WILL NOT ENFORCE, and that
 * is the point. `min`/`max` keep a value sane on its own; `valid` keeps the
 * whole set coherent — a centre hole inside the rim, pivot and pillar circles
 * that fit within the disc with their own radii. Without these the enumerator
 * would happily propose the inside-out plate described above, build it, and
 * report a watertight solid.
 */
export const PLATE = {
  part: 'bench:plate',
  movable: ['R', 't', 'r_centre', 'r_pivot', 'r_pivots', 'r_pillar', 'r_pillars'],
  step: { R: 2, t: 0.25, r_centre: 0.1, r_pivot: 0.04, r_pivots: 1, r_pillar: 0.1, r_pillars: 1 },
  bounds: {
    R: [10, 30], t: [0.5, 4], r_centre: [0.2, 3],
    r_pivot: [0.08, 1.2], r_pivots: [4, 26], r_pillar: [0.2, 2], r_pillars: [4, 26],
  },
  valid: (p) => p.r_centre < p.R * 0.6
    && p.r_pivots + p.r_pivot < p.R - 0.5
    && p.r_pillars + p.r_pillar < p.R - 0.5
    && p.r_pivots - p.r_pivot > p.r_centre + 0.3
    && p.r_pillars - p.r_pillar > p.r_centre + 0.3,
};

const round = (x, d = 4) => Number(x.toFixed(d));

/**
 * Enumerate the legal single-parameter edits.
 *
 * A candidate that breaks a bound or the coherence rule is NOT OFFERED, so the
 * choice cannot name one — the typed guarantee doing real work. A move that
 * would change nothing is dropped too: an option that does nothing is a forced
 * move dressed up as a decision.
 */
export function legalEdits(params, spec = PLATE) {
  const out = [];
  for (const k of spec.movable) {
    const [lo, hi] = spec.bounds[k];
    for (const dir of [+1, -1]) {
      const next = round(Math.max(lo, Math.min(hi, params[k] + dir * spec.step[k])));
      if (Math.abs(next - params[k]) < 1e-9) continue;
      const cand = { ...params, [k]: next };
      if (!spec.valid(cand)) continue;
      out.push({ id: `${k}_${dir > 0 ? 'up' : 'down'}`, param: k, dir,
        from: params[k], to: next, params: cand });
    }
  }
  return out;
}

/** Build a tree and return the kernel's invariants. Never guesses on failure. */
export async function invariantsOf(tree, opts = {}) {
  const out = await cadCall('build', { tree }, opts);
  return {
    ok: out.ok === true,
    built: out.built === true,
    faceCount: out.faceCount ?? null,
    ...(out.invariants || {}),
  };
}

/**
 * The briefs, as targets over KERNEL-MEASURED invariants.
 *
 * Nothing here is our own metric dressed up as a measurement: volume, area and
 * watertightness come out of Truck. `watertight` is a hard requirement rather
 * than a term in the distance, because a leaky solid is not a worse part, it is
 * not a part — its volume cannot be trusted and it will not export.
 */
export const CAD_BRIEFS = {
  lighter: { label: 'the same plate at roughly 60% of its material',
    target: { volume: 1130, area: 2400 } },
  chunkier: { label: 'a thicker, heavier plate that still fits the same envelope',
    target: { volume: 3200, area: 3600 } },
  thin_wide: { label: 'a wider, thinner plate — more face area for the same material',
    target: { volume: 1900, area: 4200 } },
};

/** Distance from a brief, normalised so neither term dominates by magnitude. */
export function cadDistance(inv, brief) {
  if (!inv?.ok) return Infinity;      // not a part; not a distance
  const scale = { volume: 1500, area: 2000 };
  let s = 0, n = 0;
  for (const k of Object.keys(brief.target)) {
    if (!Number.isFinite(inv[k])) continue;
    s += ((inv[k] - brief.target[k]) / scale[k]) ** 2; n++;
  }
  return n ? Math.sqrt(s / n) : Infinity;
}

/**
 * Criteria for one step: each option labelled with the KERNEL'S measurement of
 * what it produces, and with the resulting distance already combined.
 *
 * Both halves of that sentence are the sprite lesson, which cost 0.717 regret
 * to learn: hand over the result of the computation, and hand over the single
 * number the question will be read against rather than several to combine.
 */
export function editCriteria(built, current, brief) {
  const curD = cadDistance(current, brief);
  const c = {};
  for (const b of built) {
    if (!b.inv?.ok) continue;         // never offer an option that is not a part
    const d = cadDistance(b.inv, brief);
    c[b.id] = `${b.param} ${b.dir > 0 ? 'up' : 'down'} (${b.from} to ${b.to}). ` +
      `Kernel build: volume ${b.inv.volume.toFixed(0)}mm3, area ${b.inv.area.toFixed(0)}mm2, ` +
      `${b.inv.faceCount} faces, watertight ${b.inv.watertight}. ` +
      `Overall gap to the brief would go from ${curD.toFixed(3)} to ${d.toFixed(3)} (lower is closer).`;
  }
  return c;
}

/** The state document. Kernel numbers only, already computed. */
export function cadDoc(params, inv, brief, { step = 0, total = 0, history = [] } = {}) {
  const n = (x, d = 0) => (Number.isFinite(x) ? x.toFixed(d) : '—');
  const lines = [
    'EDITING A PARAMETRIC CAD PART BY SINGLE PARAMETER CHANGES. Every figure',
    'below comes from an exact B-rep build (Truck kernel); you are choosing',
    'which one parameter to change next.',
    '',
    `THE BRIEF: ${brief.label}`,
    `${'measure'.padEnd(12)}${'now'.padStart(10)}${'wanted'.padStart(10)}${'gap'.padStart(10)}`,
    ...Object.keys(brief.target).map((k) =>
      k.padEnd(12) + n(inv[k]).padStart(10) + n(brief.target[k]).padStart(10) +
      n(brief.target[k] - inv[k]).padStart(10)),
    '',
    `watertight ${inv.watertight}, ${inv.faceCount} named faces, Euler characteristic ${inv.euler}`,
    `current parameters: ${Object.entries(params).map(([k, v]) => `${k}=${v}`).join(', ')}`,
    '',
    `edit ${step + 1} of ${total}.`,
  ];
  if (history.length) lines.push('',
    'EDITS ALREADY MADE, oldest first:',
    ...history.slice(-8).map((h, i) => `  ${i + 1}. ${h.id}  (gap ${h.before.toFixed(3)} -> ${h.after.toFixed(3)})`));
  lines.push('',
    'A positive gap means the measure needs to go UP to meet the brief.',
    'Only edits that keep the part geometrically coherent are offered at all.');
  return lines.join('\n');
}
