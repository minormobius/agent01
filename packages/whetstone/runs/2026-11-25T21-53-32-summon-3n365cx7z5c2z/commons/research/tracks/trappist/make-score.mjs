// TRAPPIST-1 (track 3, Mozzie 11-24). Seven planets, each struck once per orbit.
// Real periods (Agol et al. 2021, PSJ 2:1, via the NASA Exoplanet Archive), sped up so h's
// 18.77-day year takes 4 s. Each planet's pitch is its strike rate times 256 (exactly 8 octaves),
// so the pitch ratio of any two planets is their orbit ratio. h sounds 64 Hz.
// node make-score.mjs > score.json   (deterministic; no randomness)
export const DAYS = { b: 1.510826, c: 2.421937, d: 4.049219, e: 6.101013, f: 9.207540, g: 12.352446, h: 18.772866 };
export const SCALE = 4 / DAYS.h;               // seconds per day
export const OCT = 256;                        // pitch = strike rate * 2^8
const order = ['h', 'g', 'f', 'e', 'd', 'c', 'b'];   // enter from the outside in
const r6 = v => Math.round(v * 1e6) / 1e6;
export function plan() {
  // h enters at 0, then one planet every 8 s; all seven from 48 s to 80 s;
  // then they leave from the inside out, one every 4 s: b at 80 s ... h at 104 s.
  return order.map((p, i) => ({ p, from: 8 * i, to: 80 + 4 * (6 - i) }));
}
export function score() {
  const parts = [];
  const ev = [];
  for (const { p, from, to } of plan()) {
    const P = DAYS[p] * SCALE, hz = OCT / P, midi = r6(69 + 12 * Math.log2(hz / 440));
    for (let k = Math.ceil(from / P - 1e-9); k * P < to - 1e-9; k++)
      ev.push({ at: r6(k * P), dur: r6(Math.min(0.85 * P, 2.5)), midi, velocity: 0.3 });
  }
  ev.sort((a, b) => a.at - b.at || a.midi - b.midi);
  parts.push({ instrument: 'piano', events: ev });
  return { parts };
}
if (import.meta.url === `file://${process.argv[1]}`) process.stdout.write(JSON.stringify(score()));
