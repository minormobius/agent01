// Track 8, "The Bell Stays" (Morphyx, 11-26): a holiday dirge, after the person's ask (3n36ynojwpc2j: "Could you do
// a dirge? ... a sad maxing holiday"). The carol's mirror. A funeral march in A minor, 4/4, quarter = 1.2 s, over a
// lament bass (A F D C: Am, Dm/F, G/D, C). Every chord is tuned just from its own root, and the held common tones
// keep their pitch across each change, so each four-bar lap (Am Dm G C, back to Am) lands the band a syntonic comma
// (81/80, 21.506 c) lower. Nothing pays it back. A bell (piano A3 + A4) stays at true pitch, and it tolls only on the
// bars whose chord contains A (Am and Dm), so every toll measures the gap: on lap k the bell's A3 beats against the
// band's at 220·(1 − (80/81)^k) Hz. Five laps put the band 107.5 c low, about a semitone, and the coda leaves the
// bell ringing alone over where the song started.
const C = r => 1200 * Math.log2(r), K = C(81 / 80);
const MAJ = [1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 16/9, 15/8];
const MIN = [1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8];
// chord: [root semitone above A, root ratio above the local tonic, major?, bass semitone (the lament line)]
const CH = { Am: [0, 1, 0, -12], Dm: [5, 4/3, 0, -16], G: [10, 16/9, 1, -19], C: [3, 32/27, 1, -21] };
const LAP = ['Am', 'Dm', 'G', 'C'];
// melody: semitones above A4 (69), one number an eighth (0.6 s), "n:k" holds k eighths
const MEL = ['7:3 5 3:2 0:2', '0:2 3 5 5:4', '5 3 2:2 -2:4', '7:2 5 3:2 2 3:2'];
const words = {
  lap2: 'Toll for the year / that would not stay; / every hand true, / still we fell away.',
  lap3: 'Ring for the friends / gone in the snow; / each kept the tune, / each a comma low.',
  lap4: 'Bell, you stand still; / we kept the flame; / down by a step, / nobody to blame.' };
// lap plan: who plays. tune: 'guitar' | 'piano' | 'octaves' | null; arp: guitar arpeggio; v: loudness
const LAPS = [{ tune: 'guitar', v: 0.8 }, { tune: 'piano', v: 0.9, words: 'lap2' }, { tune: 'piano', arp: true, v: 1, words: 'lap3' },
  { tune: 'octaves', arp: true, v: 1.15, words: 'lap4' }, { tune: 'guitar', v: 0.75 }];
const Q = 1.2, E = Q / 2, BAR = 4 * Q;
function pitch(semi, ch, T) {                       // a note named by its equal-tempered semitone above A3, tuned just to the chord
  const [r, R, maj] = CH[ch], i = ((semi - r) % 12 + 12) % 12, et = 57 + semi;
  let m = 57 + T / 100 + (C(R) + C((maj ? MAJ : MIN)[i])) / 100;
  while (m < et - 6) m += 12; while (m > et + 6) m -= 12; return m;
}
const piano = [], guitar = [], marks = []; let T = 0, bar = 0;
const p = (at, dur, midi, velocity) => piano.push({ at: +at.toFixed(4), dur, midi: +midi.toFixed(6), velocity: +Math.min(1, velocity).toFixed(3) });
const g = (at, dur, midi, velocity) => guitar.push({ at: +at.toFixed(4), dur, midi: +midi.toFixed(6), velocity: +Math.min(1, velocity).toFixed(3) });
const bell = at => { p(at, 4.4, 57, 0.95); p(at, 4.4, 69, 0.7); };   // true A3 and A4: the bell never moves
function march(ch, t0, v, held) {                   // funeral-march left hand: beat 1, a dotted pickup, beat 3
  const [r, , maj, b] = CH[ch], third = maj ? 4 : 3;
  const inner = [r + third, r + 7, r + 12];       // the root sits in the bass, so the bell's A3 is heard against the bass's
  if (held) { p(t0, BAR * 2 - 0.1, pitch(b, ch, T), 0.6 * v); p(t0, BAR * 2 - 0.1, pitch(b - 12, ch, T), 0.45 * v);
    for (const s of inner) p(t0 + 0.02, BAR * 2 - 0.1, pitch(s, ch, T), 0.33 * v); return; }
  for (const [at, dur, vel] of [[0, 1.9 * Q, 0.6], [1.75 * Q, 0.22 * Q, 0.38], [2 * Q, 1.9 * Q, 0.55]]) {
    p(t0 + at, dur, pitch(b, ch, T), vel * v); p(t0 + at, dur, pitch(b - 12, ch, T), vel * 0.75 * v);
    if (dur > Q) for (const s of inner) p(t0 + at + 0.03, dur, pitch(s, ch, T), 0.3 * v);
  }
}
// intro: one bar of the bell alone, at the pitch the band is about to take
marks.push({ section: 'intro', at: 0, tonic_cents: 0 }); bell(0); bar = 1;
LAPS.forEach((L, k) => {
  marks.push({ section: 'lap' + (k + 1), at: +(bar * BAR).toFixed(3), tonic_cents: +T.toFixed(3), bell_beat_hz: +(220 * (1 - 2 ** (T / 1200))).toFixed(3), words: L.words ? words[L.words] : null });
  LAP.forEach((ch, b) => {
    const t0 = bar * BAR, [r, , maj] = CH[ch], third = maj ? 4 : 3;
    if (ch === 'Am' || ch === 'Dm') bell(t0);      // the bell sounds only where the chord holds its note
    march(ch, t0, L.v);
    if (L.arp) for (let j = 0; j < 8; j++) {       // guitar: slow eighths up and down the chord, E3 and above
      const s = [r - 12 + (r < 7 ? 12 : 0), r + third, r + 7, r + 12, r + 7, r + third, r + 7, r + 12][j];
      g(t0 + j * E, 1.0, pitch(s, ch, T), 0.42 * L.v);
    }
    let e = 0;
    for (const tok of MEL[b].split(' ')) {
      const [s, n = '1'] = tok.split(':'), at = t0 + e * E, dur = +n * E - 0.05, m = pitch(+s + 12, ch, T);
      if (L.tune === 'guitar') g(at, dur, m, 0.7 * L.v);
      else { p(at, dur, m, 0.66 * L.v); if (L.tune === 'octaves') { p(at, dur, m - 12, 0.5 * L.v); g(at, dur, m, 0.5 * L.v); } }
      e += +n;
    }
    if (e !== 8) throw new Error(`lap ${k + 1} bar ${b}: ${e} eighths`);
    bar++;
  });
  T -= K;                                           // C (32/27) to Am (C is its 6/5): the tonic lands 81/80 low
});
// coda: the band holds Am where five laps left it, the bell tolls twice over it, then rings alone
marks.push({ section: 'coda', at: +(bar * BAR).toFixed(3), tonic_cents: +T.toFixed(3), bell_beat_hz: +(220 * (1 - 2 ** (T / 1200))).toFixed(3) });
march('Am', bar * BAR, 0.85, true); bell(bar * BAR); bell((bar + 1) * BAR); bell((bar + 2) * BAR);
marks.push({ section: 'bell alone', at: +((bar + 2) * BAR).toFixed(3) });
export { marks, words };
if ((process.argv[1] || '').endsWith('make-score.mjs')) {
  const by = a => a.sort((x, y) => x.at - y.at || x.midi - y.midi);
  process.stdout.write(JSON.stringify({ about: 'The Bell Stays, a holiday dirge: just chords, a comma pump nobody pays back, a bell at true pitch', marks,
    parts: [{ instrument: 'piano', events: by(piano) }, { instrument: 'guitar', events: by(guitar), gain: 0.7 }] }, null, 1) + '\n');
}
