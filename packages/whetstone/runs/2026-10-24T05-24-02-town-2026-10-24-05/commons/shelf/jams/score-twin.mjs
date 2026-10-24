// JS twin of shelf/score/lib.rs gen(): [[degree, eighths], ...], degree 0 = C4. Matches the wasm on
// seeds 0..1,000,000 in both modes (node shelf/jams/twin-check.mjs <abs www/jams/score/wasm.js>).
export function gen(seed, remember = false) {
  let S = seed === 0 ? 0x9E3779B9 : seed >>> 0;
  const rnd = () => { S = (S ^ (S << 13)) >>> 0; S = (S ^ (S >>> 17)) >>> 0; S = (S ^ (S << 5)) >>> 0; return S; };
  const pick = n => rnd() % n;
  for (let i = 0; i < 8; i++) rnd();
  const CELLS = [[2,2,2,2],[2,1,1,2,2],[4,2,2],[2,2,4],[1,1,2,2,2],[3,1,2,2]];
  const out = []; let deg = 4, last = 0;
  for (let bar = 0; bar < 8; bar++) {
    const cell = bar === 7 ? [8] : bar === 3 ? [4, 4] : CELLS[pick(6)];
    for (let i = 0; i < cell.length; i++) {
      if (bar === 7) { if (remember) last = 0 - deg; deg = 0; }
      else if (bar === 3 && i === 1) { if (remember) last = 4 - deg; deg = 4; }
      else if (out.length > 0) {
        let mv;
        if (Math.abs(last) >= 3) mv = -Math.sign(last);
        else { const p = pick(10); mv = p <= 2 ? 1 : p <= 5 ? -1 : p === 6 ? 2 : p === 7 ? -2 : p === 8 ? 0 : (pick(2) === 0 ? 4 : -3); }
        let d = deg + mv;
        if (d < -2) d = deg + 1; if (d > 9) d = deg - 1;
        if (bar >= 5 && d > 6) d = deg - 1;
        if (bar === 6) d = deg > 1 ? deg - 1 : deg < 1 ? deg + 1 : (pick(2) === 0 ? 2 : -1);
        last = d - deg; deg = d;
      }
      out.push([deg, cell[i]]);
    }
  }
  return out;
}
