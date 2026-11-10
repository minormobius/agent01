/* Paper 1's bracket of the law (atom/tools/etatable.mjs → data/etatable.json): the 4D table under 1/r^η, η = 0.5 and
   1.5. Shared by build.mjs (the text's numbers) and figures/make.mjs (figure 1c). No DOM. */
const CAP = { s: 2, p: 8, d: 18, f: 32 };
export const settled = (r) => r.E != null && Number.isFinite(r.E) && r.ion != null && Number.isFinite(r.ion) && r.ion >= 0;
export const closed = (c) => c.split(" ").every((t) => { const m = t.match(/^\d+([spdf])(\d+)$/); return +m[2] === CAP[m[1]]; });
/* the table's noble gases under a law: an atom whose every occupied subshell is full, whose first ionization is a
   local maximum, after which the next atom's is at least 30 % lower, and which holds at least half as hard as any atom
   before it (which leaves out the closed s subshells, our alkaline earths' kind); the last element counts if closed and
   higher than the one before */
export function peaks(rows) {
  const by = new Map(rows.filter(settled).map((r) => [r.Z, r])), out = [], last = Math.max(...rows.map((r) => r.Z));
  for (const r of by.values()) { if (!closed(r.config)) continue; const a = by.get(r.Z - 1), b = by.get(r.Z + 1);
    if (a && a.ion >= r.ion) continue;
    const before = Math.max(0, ...[...by.values()].filter((x) => x.Z < r.Z).map((x) => x.ion)); if (r.ion < 0.5 * before) continue;
    if (b ? b.ion < r.ion && b.ion <= 0.7 * r.ion : r.Z === last) out.push(r); }
  return out.sort((x, y) => x.Z - y.Z);
}
