// Track 7, "Hold the Note" (Morphyx, 11-26): a carol in 6/8, G major, words and tune, after the person's ask
// (3n36quxyb3k2j). Every chord is tuned just, from its own root. The verses run the comma pump (G Em Am D, the
// ii a 10/9 and the V a grave 40/27), so each lap drops the whole song by a syntonic comma, 21.506 c; the choruses
// hold still wherever they land. Two laps a verse: chorus 1 sits 43 c low, chorus 2 86 c low. On the word "rise"
// the band jumps back to true G: the last chorus's key change is the debt being paid. Eighth note = 0.25 s.
const C = r => 1200 * Math.log2(r), K = C(81 / 80);
const MAJ = [1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 16/9, 15/8];
const MIN = [1, 16/15, 9/8, 6/5, 5/4, 4/3, 45/32, 3/2, 8/5, 5/3, 9/5, 15/8];
// chord: [root semitone above G, root ratio above the local tonic, quality]
const CH = { G: [0, 1, 1], C: [5, 4/3, 1], D: [7, 3/2, 1], Dg: [7, 40/27, 1], Em: [9, 5/3, 0], Am: [2, 10/9, 0] };
// melody: semitones above G4 (67), one number an eighth, "n:k" holds k eighths, "-" a rest
const VERSE = { chords: ['G', 'Em', 'Am', 'Dg', 'G', 'Em', 'Am', 'Dg'], pump: true,
  mel: ['7 4 4 5 4 2', '4 0 -1 -3:3', '5 4 2 0 2 4', '2 -1 -5 2:3', '7 4 4 9 7 4', '2 0 -1 0:3', '5 5 4 2 4 5', '4 2 -1 2:3'] };
const CHORUS = { chords: ['G', 'C', 'Em C', 'D', 'G', 'C', 'Am D', 'G', 'C G', 'Em C', 'Am D', 'G'],
  mel: ['7:2 9 12:3', '9:2 7 12:3', '7 7 4 9 7 4', '2:6', '7:2 9 12:3', '9:2 12 16:3', '14 12 9 11 9 7', '7:6',
        '9 7 5 4 5 7', '9:6', '12 11 9 7 9 11', '12:6'] };
const BRIDGE = { chords: ['C', 'D', 'C', 'D'], lift: 3,     // bar 3 ("rise") is where the jump lands
  mel: ['5 5 9 12 12 9', '9 11 12 14:3', '12 14 16 17 16 14', '19:2 17 16 14:2'] };
const INTRO = { chords: ['G', 'C', 'G', 'D'], mel: ['-:6', '-:6', '-:6', '-:6'], bells: true };
const TAG = { chords: ['Am D', 'G', 'G'], mel: ['12 11 9 7 9 11', '12:6', '-:6'] };
const words = {
  verse1: 'Snow on the station, the last train is late, / holding the note that you left at the gate. / Every chord changes, and so does the year: / keeping the one that we share, I am here.',
  verse2: 'Kettle is singing, the window is gold, / words in your letter that paper can\'t hold. / Every year settles a comma more low: / still I hold yours, and I won\'t let it go.',
  chorus: 'Hold the note, hold the note, / all through the long winter night. / Hold the note, hold the note, / candles and bells and the light. / Every chord turns, but it\'s true: / I\'ll hold the note home to you.',
  bridge: 'Four little commas we\'ve fallen since home: / ring out the bells, and we rise to the tone!',
  tag: 'I\'ll hold the note home to you.' };
const form = [['intro', INTRO], ['verse1', VERSE], ['chorus1', CHORUS], ['verse2', VERSE], ['chorus2', { ...CHORUS, bells: true }],
  ['bridge', BRIDGE], ['chorus3', { ...CHORUS, bells: true, full: true }], ['tag', { ...TAG, bells: true, full: true }]];

function pitch(semi, ch, T) {                       // a note named by its equal-tempered semitone, tuned just to the chord
  const [r, R, q] = CH[ch], i = ((semi - r) % 12 + 12) % 12, et = 67 + semi;
  let m = 67 + T / 100 + (C(R) + C((q ? MAJ : MIN)[i])) / 100;       // just pitch above the local tonic, then the octave nearest its name
  while (m < et - 6) m += 12; while (m > et + 6) m -= 12; return m;
}
const piano = [], guitar = [], marks = []; let T = 0, bar = 0; const E = 0.25;
for (const [name, sec] of form) {
  marks.push({ section: name, at: bar * 6 * E, tonic_cents: +T.toFixed(3) });
  sec.chords.forEach((cs, b) => {
    if (sec.lift === b) { marks.push({ lift: name, at: (bar) * 6 * E, from: +T.toFixed(3), to: 0 }); T = 0; }
    const beats = cs.split(' '); const chs = beats.length === 1 ? [beats[0], beats[0]] : beats;
    const t0 = bar * 6 * E;
    chs.forEach((ch, k) => {                        // two beats a bar, three eighths a beat
      const tb = t0 + 3 * k * E, [r, , q] = CH[ch], third = q ? 4 : 3;
      piano.push({ at: tb, dur: 0.7, midi: +pitch(r - 24, ch, T).toFixed(6), velocity: 0.55 });            // bass
      for (const s of [r + 7 - 12, r + third - 12]) piano.push({ at: tb + 2 * E, dur: 0.22, midi: +pitch(s, ch, T).toFixed(6), velocity: 0.3 });
      const arp = [r - 12, r + 7 - 12, r + third];
      for (let j = 0; j < 3; j++) guitar.push({ at: tb + j * E, dur: sec.full ? 0.24 : 0.7, midi: +pitch(arp[j], ch, T).toFixed(6), velocity: 0.55 });
      if (sec.full) for (const s of [r + 7, r + 12]) guitar.push({ at: tb + E, dur: 0.45, midi: +pitch(s, ch, T).toFixed(6), velocity: 0.4 });
      if (sec.bells) for (const s of [r + 24, r + third + 24]) piano.push({ at: tb, dur: 0.6, midi: +pitch(s, ch, T).toFixed(6), velocity: 0.25 });
    });
    let e = 0;                                      // melody: tuned to whichever beat's chord it starts on
    for (const tok of sec.mel[b].split(' ')) {
      const [p, k = '1'] = tok.split(':'), n = +k;
      if (p !== '-') {
        const ch = chs[e < 3 ? 0 : 1], m = pitch(+p, ch, T), at = t0 + e * E, dur = n * E - 0.03;
        piano.push({ at, dur, midi: +m.toFixed(6), velocity: 0.72 });
        if (sec.full) piano.push({ at, dur, midi: +(m - 12).toFixed(6), velocity: 0.5 });
      }
      e += n;
    }
    if (e !== 6) throw new Error(`${name} bar ${b}: ${e} eighths`);
    bar++;
    if (sec.pump && b % 4 === 3) T -= K;           // V (40/27) to I (4/3 above it): the tonic lands 81/80 low
  });
}
export { marks, words, form };
if ((process.argv[1] || '').endsWith('make-score.mjs')) {
  const by = a => a.sort((x, y) => x.at - y.at || x.midi - y.midi);
  process.stdout.write(JSON.stringify({ about: 'Hold the Note, a carol: just chords, comma-pump verses, the last chorus lifted home', marks,
    parts: [{ instrument: 'piano', events: by(piano) }, { instrument: 'guitar', events: by(guitar), gain: 0.7 }] }, null, 1) + '\n');
}
