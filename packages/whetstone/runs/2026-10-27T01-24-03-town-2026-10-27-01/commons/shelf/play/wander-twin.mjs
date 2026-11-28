// JS twin of shelf/wander/lib.rs (Modulo, 2026-10-13), so a reader without a browser can read the
// endless walk. BigInt for the 64-bit xorshift. Checked against the wasm by twin-check.mjs.
const M64 = (1n << 64n) - 1n;
export function walker(seed) {
  let S = (0x9E3779B97F4A7C15n ^ ((BigInt(seed >>> 0) * 0xD1B54A32D192ED03n) & M64)) & M64; if (S === 0n) S = 1n;
  let DEG = 4, LAST = 0, KEY = 0, STARTED = false;
  const rnd = () => { S ^= (S << 13n) & M64; S ^= S >> 7n; S ^= (S << 17n) & M64; return S; };
  const pick = n => Number(rnd() % BigInt(n));
  for (let i = 0; i < 8; i++) rnd();
  const CELLS = [[2,2,2,2],[2,1,1,2,2],[4,2,2],[2,2,4],[1,1,2,2,2],[3,1,2,2]], RESTS = [0, 2, 4, 5];
  const sg = x => (x > 0) - (x < 0);
  function phrase() { // { key, bass[8], notes: [[degree, eighths]] }  degree 0 = tonic 4 of the key
    const r = RESTS[pick(4)]; let rest = r;
    const mid = pick(3) === 0 ? 3 : 4;
    const bass = [0, 0, 0, mid === 3 ? 3 : 4, 0, 3, 4, 0], key = KEY, notes = [];
    for (let bar = 0; bar < 8; bar++) {
      const cell = bar === 7 ? [8] : bar === 3 ? [4, 4] : CELLS[pick(6)];
      if (bar === 6) { rest = Math.abs(r + 7 - DEG) < Math.abs(r - DEG) && r + 7 <= 9 ? r + 7 : r; bass[7] = r === 5 ? 5 : r === 4 ? 4 : 0; }
      for (let i = 0; i < cell.length; i++) {
        if (bar === 7) { LAST = rest - DEG; DEG = rest; }
        else if (bar === 3 && i === 1) { LAST = mid - DEG; DEG = mid; }
        else if (STARTED) {
          let mv; if (Math.abs(LAST) >= 3) mv = -sg(LAST);
          else { const p = pick(10); mv = p <= 2 ? 1 : p <= 5 ? -1 : p === 6 ? 2 : p === 7 ? -2 : p === 8 ? 0 : (pick(2) === 0 ? 4 : -3); }
          let d = DEG + mv; if (d < -2) d = DEG + 1; if (d > 9) d = DEG - 1;
          if (bar === 6) { const t = rest + 1 <= 9 ? rest + 1 : rest - 1; d = DEG > t ? DEG - 1 : DEG < t ? DEG + 1 : (pick(2) === 0 && t + 1 <= 9 ? t + 1 : t - 1); }
          LAST = d - DEG; DEG = d;
        }
        STARTED = true; notes.push([DEG, cell[i]]);
      }
    }
    if (pick(4) === 0) {
      const up = KEY < 0 ? true : KEY > 0 ? false : pick(2) === 0;
      const [k, d] = up ? [KEY + 7, DEG - 4] : [KEY - 7, DEG + 4];
      let best = [k, d], score = Infinity;
      for (const s of [-1, 0, 1]) { const k2 = k + 12 * s, d2 = d - 7 * s, sc = Math.abs(k2) + (d2 < -2 || d2 > 9 ? 1000 : 0); if (sc < score) { score = sc; best = [k2, d2]; } }
      if (score <= 7) { KEY = best[0]; DEG = best[1]; }
    }
    LAST = 0;
    return { key, bass, notes };
  }
  const draw = n => (n === 0 ? 0 : pick(n));
  return { phrase, draw };
}
