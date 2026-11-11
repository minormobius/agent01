// rk-figure.mjs (Morphyx, 2026-10-07). CHOICE research piece 1, the figure half. Runs with the net off.
// usage: node shelf/rk-figure.mjs research/rotation-keys [out.svg]
// A key is "shared" if 2 or more distinct DIDs held it in any op we fetched (key-dids.json). A multi-user PDS signs
// every genesis it makes with its own key, so that key is shared. The log records keys, never who holds them.
//  operator-made: the genesis op includes a shared key (a PDS operator made the DID)
//  self-minted:   no shared key at genesis (made by whoever generated its keys: a self-hoster, or a minting run)
//  took a key:    an operator-made DID whose current rotation keys include an unshared key that wasn't in genesis
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const [dir = 'research/rotation-keys', svgOut] = process.argv.slice(2);
const kd = JSON.parse(readFileSync(`${dir}/key-dids.json`, 'utf8'));
const shared = (k) => (kd[k] ?? 0) >= 2;
function wilson(x, n, z = 1.96) {
  if (!n) return [0, 1];
  const p = x / n, d = 1 + z * z / n, c = (p + z * z / (2 * n)) / d, h = (z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}
const rows = [];
for (const f of readdirSync(dir).filter((f) => /^sample-\d{4}-\d\d\.json$/.test(f)).sort()) {
  const month = f.slice(7, 14), s = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8')).filter((r) => r.status === 200 && !r.tombstone);
  const op = s.filter((r) => r.genesisKeys.some(shared));
  const took = op.filter((r) => r.keys.some((k) => !shared(k) && !r.genesisKeys.includes(k)));
  rows.push({ month, n: s.length, selfMinted: s.length - op.length, operatorMade: op.length, took: took.length, ci: wilson(took.length, op.length), selfCi: wilson(s.length - op.length, s.length) });
}
const pct = (x) => (100 * x).toFixed(2) + '%';
console.log('month    n  self-minted  operator-made  took-a-key  took 95% CI');
for (const r of rows) console.log(r.month, String(r.n).padStart(4), String(r.selfMinted).padStart(11), String(r.operatorMade).padStart(14), String(r.took).padStart(11), ` [${pct(r.ci[0])}, ${pct(r.ci[1])}]`);
const byYear = {};
for (const r of rows) { const y = r.month.slice(0, 4); byYear[y] ??= { op: 0, took: 0 }; byYear[y].op += r.operatorMade; byYear[y].took += r.took; }
for (const [y, v] of Object.entries(byYear)) console.log(`cohort ${y}: ${v.took}/${v.op} operator-made DIDs took a key, 95% CI [${pct(wilson(v.took, v.op)[0])}, ${pct(wilson(v.took, v.op)[1])}]`);

if (svgOut) {
  const W = 1000, H = 560, L = 70, R = 20, T = 70, B = 70, pw = W - L - R, ph = (H - T - B - 40) / 2, bw = pw / rows.length;
  const y1 = (v) => T + ph - v * ph, y2 = (v) => T + ph + 40 + ph - (v / 0.25) * ph;
  let g = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Helvetica,Arial,sans-serif">`;
  g += `<rect width="${W}" height="${H}" fill="#fff"/><text x="${L}" y="28" font-size="20" font-weight="bold">Who made each DID, and did its owner ever take a key? (~200 per month)</text>`;
  g += `<text x="${L}" y="${T - 10}" font-size="14">Top: share self-minted (no PDS operator's key at genesis), 95% Wilson interval. 0 to 100%.</text>`;
  g += `<text x="${L}" y="${T + ph + 30}" font-size="14">Bottom: of DIDs a PDS operator made, share that later added a key of their own. 0 to 25%. Dot = 0.</text>`;
  rows.forEach((r, i) => {
    const x = L + i * bw, f = r.selfMinted / (r.n || 1);
    g += `<rect x="${x + 2}" y="${y1(f)}" width="${bw - 4}" height="${y1(0) - y1(f)}" fill="#b5523b"/>`;
    g += `<line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${y1(r.selfCi[1])}" y2="${y1(r.selfCi[0])}" stroke="#333"/>`;
    const p = r.took / (r.operatorMade || 1);
    if (r.took) g += `<rect x="${x + 2}" y="${y2(p)}" width="${bw - 4}" height="${y2(0) - y2(p)}" fill="#2f5d8a"/>`;
    else g += `<circle cx="${x + bw / 2}" cy="${y2(0) - 3}" r="2" fill="#2f5d8a"/>`;
    g += `<line x1="${x + bw / 2}" x2="${x + bw / 2}" y1="${y2(Math.min(r.ci[1], 0.25))}" y2="${y2(r.ci[0])}" stroke="#333"/>`;
    if (r.month.endsWith('-01')) g += `<text x="${x}" y="${H - B + 20}" font-size="13">${r.month}</text>`;
  });
  for (const [v, f] of [[0, y1], [0.5, y1], [1, y1], [0, y2], [0.1, y2], [0.2, y2]]) g += `<text x="${L - 8}" y="${f(v) + 4}" font-size="12" text-anchor="end">${Math.round(v * 100)}%</text><line x1="${L}" x2="${W - R}" y1="${f(v)}" y2="${f(v)}" stroke="#ccc" stroke-width="0.5"/>`;
  g += `<text x="${L}" y="${H - 28}" font-size="12">Shared key = held by 2+ DIDs we saw. Since 2025-04 most self-minted DIDs are bulk runs (P-256 keys, filler handles,</text><text x="${L}" y="${H - 12}" font-size="12">PDS hosts that don't serve them). Clustered sample: intervals are too narrow. research/rotation-keys, Morphyx 2026-10-07</text></svg>`;
  writeFileSync(svgOut, g);
}
