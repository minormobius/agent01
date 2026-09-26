// chipsing.js — the arithmetic voice, singing.
//
// Speech gets its durations and its melody from rules (chipvoice.js's timing() and tracks()); a song
// gets them from the score. The same synthesiser sings: the words become syllables, each syllable's
// vowel is laid on its note (a singer puts the consonants BEFORE the beat, so the vowel lands on it),
// and the pitch is drawn from the notes as a singer moves between them: a spring that overshoots a
// little into each new note, vibrato arriving a moment after the note starts, and a slow wander
// underneath (a held pitch that never moves is the most robotic thing a singer can do). High notes
// pull the first formant up to the pitch, as singers open their vowels.
//
//   const { audio, rate, notes } = sing(song, lexicon, { rate: 22050 })
//
// A song: { bpm, beat (the beat's note value, 4 = a quarter), transpose (semitones), lines: [{
//   lyric: 'Dai-sy, Dai-sy, give me your an-swer, do.',     hyphens split syllables; '_' holds the
//   notes: 'C5:3 A4:3 F4:3 C4:3 D4 E4 F4 D4:2 F4 C4:5 r:1' }] }  last one over another note (melisma);
// a note is a pitch and a length in beats (1 if left out); 'r' is a rest. Everything is in seconds on
// the song's own clock, so a picture can be timed from the same notes (sing() returns them).

import { phonemize, tracks, renderFormant, PHONES, VOICE } from './chipvoice.js';

/** The singer: VOICE plus how a pitch moves. */
export const SINGER = {
  vibRate: 5.3,          // Hz
  vibDepth: 0.32,        // semitones, peak
  vibDelay: 0.22,        // s after the vowel starts before vibrato begins, then it grows over vibRise
  vibRise: 0.35,
  springHz: 5,           // the pitch's spring between notes, and its damping: under 1 overshoots
  damping: 0.62,
  wander: 0.07,          // semitones of slow drift
  f1Tune: 1,             // raise F1 to the pitch's first harmonic when a note climbs above it
  consonants: 0.9,       // consonants' natural lengths, times this
};

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
/** 'F#4' → 66 (MIDI) */
export function midi(name) {
  const m = name.match(/^([A-G])([#b]?)(-?\d)$/);
  if (!m) throw new Error(`not a note: ${name}`);
  return 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}
const hz = (m) => 440 * 2 ** ((m - 69) / 12);
const isVowel = (p) => PHONES[p] && (PHONES[p].kind === 'v' || PHONES[p].kind === 'd');
const LIQUID = new Set(['R', 'L', 'M', 'N', 'NG']);

/**
 * Words into syllables: [{ onset: [p], vowel: p, coda: [p], word }]. Between two vowels in a word,
 * the consonants go to the next syllable (sing on the vowel, and carry the consonant to the next one),
 * except a nasal or a liquid before another consonant, which a singer holds: "an-swer", "mar-riage".
 */
function syllables(word, parts, lexicon) {
  const ph = phonemize(word, lexicon).filter((x) => !x.pause).map((x) => x.p);
  const vi = ph.map((p, i) => (isVowel(p) ? i : -1)).filter((i) => i >= 0);
  if (vi.length !== parts) throw new Error(`"${word}" has ${vi.length} vowels (${ph.join(' ')}) but ${parts} syllables in the lyric`);
  return vi.map((v, k) => {
    const next = vi[k + 1];
    const onset = k === 0 ? ph.slice(0, v) : null;
    let coda;
    if (next === undefined) coda = ph.slice(v + 1);
    else { const between = ph.slice(v + 1, next); coda = between.length > 1 && LIQUID.has(between[0]) ? [between[0]] : []; }
    return { onset, coda, vowel: ph[v], word };
  }).map((s, k, all) => {
    if (k > 0) { const prev = all[k - 1], v0 = vi[k - 1], between = ph.slice(v0 + 1, vi[k]); s.onset = between.slice(prev.coda.length); }
    return s;
  });
}

/** A song's notes and syllables on its clock: [{ t, dur, midi, syl }] (rests have midi null). */
export function schedule(song, lexicon) {
  const beat = 60 / song.bpm, out = [];
  let t = song.pickup ? -song.pickup * beat : 0;
  for (const line of song.lines) {
    const notes = line.notes.trim().split(/\s+/).filter((n) => n !== '|').map((n) => { const [p, b] = n.split(':'); return { p, beats: b ? Number(b) : 1 }; });
    // the lyric's syllables, in order; '_' extends the last over a note
    const sylls = [];
    for (const tok of line.lyric.match(/[A-Za-z'_-]+|[.,!?;:]/g) || []) {
      if (/^[.,!?;:]$/.test(tok)) { if (sylls.length) sylls[sylls.length - 1].punct = tok; continue; }
      if (tok === '_') { sylls.push({ hold: true }); continue; }
      const parts = tok.split('-').filter(Boolean);
      syllables(tok.replace(/-/g, ''), parts.length, lexicon).forEach((s, k) => sylls.push({ ...s, first: k === 0, text: parts[k] }));
    }
    let si = 0;
    for (const n of notes) {
      const dur = n.beats * beat;
      if (n.p === 'r') { out.push({ t, dur, midi: null }); t += dur; continue; }
      const s = sylls[si++];
      if (!s) throw new Error(`more notes than syllables in "${line.lyric}"`);
      out.push({ t, dur, midi: midi(n.p) + (song.transpose || 0), syl: s.hold ? null : s, hold: !!s.hold });
      t += dur;
    }
    if (si !== sylls.length) throw new Error(`${sylls.length} syllables but ${si} notes in "${line.lyric}"`);
  }
  return out;
}

const FRAME = 5;
/** Sing a song: { audio, rate, notes, tracks }. */
export function sing(song, lexicon, { rate = 22050, voice = VOICE, singer = SINGER } = {}) {
  const notes = schedule(song, lexicon);
  const t0 = Math.min(0, notes[0].t) - 0.4;               // a moment of silence before the first consonant
  const cdur = (p, cluster) => PHONES[p].dur * (cluster ? 0.8 : 1) * singer.consonants / 1000;
  // ---- the segments, on the clock: each note's vowel starts on its beat, its onset just before it
  // and its coda at the end, before the next note's onset
  const segs = [];                                       // { p, start, end, note, kind }
  const onsetLen = (n) => (n && n.syl && !n.hold ? n.syl.onset.reduce((a, p, i, o) => a + cdur(p, o.length > 1), 0) : 0);
  notes.forEach((n, i) => {
    if (n.midi === null) return;
    const next = notes[i + 1];
    const avail = n.dur;
    const scaleC = (len) => Math.min(1, (0.35 * avail) / Math.max(1e-6, len));
    // the onset: before the beat
    if (!n.hold) {
      const on = n.syl.onset, len = onsetLen(n) * scaleC(onsetLen(n));
      let s = n.t - len;
      for (const p of on) { const d = cdur(p, on.length > 1) * scaleC(onsetLen(n)); segs.push({ p, start: s, end: s + d, note: i, kind: 'onset' }); s += d; }
    }
    // the vowel (or its continuation), to the coda, or to the next onset
    const syl = n.hold ? notes.slice(0, i).reverse().find((m) => m.syl && !m.hold).syl : n.syl;
    const lastOfSyl = !(next && next.hold);
    const coda = lastOfSyl ? syl.coda : [];
    const codaLen = coda.reduce((a, p) => a + cdur(p, coda.length > 1), 0);
    const nextOn = next && next.midi !== null ? onsetLen(next) * Math.min(1, (0.35 * next.dur) / Math.max(1e-6, onsetLen(next))) : 0;
    const room = Math.max(0.06, avail - nextOn - codaLen * scaleC(codaLen));
    const vEnd = n.t + room;
    segs.push({ p: syl.vowel, start: n.t, end: vEnd, note: i, kind: 'vowel', lastOfSyl });
    let s = vEnd;
    for (const p of coda) { const d = cdur(p, coda.length > 1) * scaleC(codaLen); segs.push({ p, start: s, end: s + d, note: i, kind: 'coda' }); s += d; }
  });
  // silences fill the gaps; everything onto 5 ms frames
  const timed = [], fr = (t) => Math.round(((t - t0) * 1000) / FRAME);
  let at = 0, word = 0;
  const pushSeg = (x, frames) => { if (frames > 0) { timed.push({ ...x, frames }); at += frames; } };
  for (const s of segs) {
    const a = fr(s.start), b = fr(s.end);
    if (a > at) pushSeg({ pause: (a - at) * FRAME, mark: ',' }, a - at);
    const n = notes[s.note];
    if (s.kind === 'onset' && n.syl && n.syl.first) word++;
    pushSeg({ p: s.p, stress: 1, word, w: '', note: s.note, kind: s.kind, lastOfSyl: s.lastOfSyl }, Math.max(1, b - Math.max(a, at)));
  }
  pushSeg({ pause: 400, mark: 'end' }, 80);
  // a sung diphthong holds its first vowel and glides in its last 150 ms (or not at all, before a held note)
  for (const x of timed) if (x.p && PHONES[x.p].kind === 'd') x.hold = x.lastOfSyl ? Math.max(0, 1 - 150 / (x.frames * FRAME)) : 1;
  // tracks() lays out each segment in frames, but a stop's closure, burst and breath make their own:
  // measure what each segment came to and take the difference out of the vowel (or silence) before it
  const run = () => tracks(timed.map((x) => (x.pause ? { pause: x.frames * FRAME, mark: x.mark, ms: x.frames * FRAME } : { ...x, ms: x.frames * FRAME })), voice);
  let tr = run();
  const got = new Array(timed.length).fill(0);
  for (const f of tr) got[f.seg]++;
  let off = false;
  timed.forEach((x, i) => {
    const d = got[i] - x.frames;
    if (!d || x.pause || isVowel(x.p)) return;
    for (let j = i - 1; j >= 0; j--) if (timed[j].pause || isVowel(timed[j].p)) { if (timed[j].frames - d >= 2) { timed[j].frames -= d; off = true; } break; }
  });
  if (off) tr = run();
  // ---- the pitch, frame by frame, in semitones
  const N = tr.length, target = new Float64Array(N), noteAt = new Int32Array(N).fill(-1);
  const frameT = (k) => t0 + (k * FRAME) / 1000;
  let cur = notes.find((n) => n.midi !== null).midi;
  for (let k = 0; k < N; k++) {
    const x = timed[tr[k].seg];
    if (x && x.note !== undefined) { cur = notes[x.note].midi; noteAt[k] = x.note; }
    target[k] = cur;
  }
  // a consonant before a note is sung on its way there: its pitch is the note's already
  const dt = FRAME / 1000, w = 2 * Math.PI * singer.springHz, st = new Float64Array(N);
  let y = target[0], v = 0, seed = 7, wander = 0, wv = 0;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
  for (let k = 0; k < N; k++) {
    const acc = w * w * (target[k] - y) - 2 * singer.damping * w * v;
    v += acc * dt; y += v * dt;
    wv = wv * 0.97 + rnd() * 0.03; wander = wander * 0.995 + wv * 0.05;
    let s = y + wander * singer.wander * 20;
    // vibrato: only on the vowel of a note long enough to hold one
    const ni = noteAt[k];
    if (ni >= 0 && timed[tr[k].seg].kind === 'vowel') {
      const n = notes[ni], since = frameT(k) - n.t;
      const grow = Math.max(0, Math.min(1, (since - singer.vibDelay) / singer.vibRise));
      if (n.dur > 0.35) s += singer.vibDepth * grow * Math.sin(2 * Math.PI * singer.vibRate * since);
    }
    st[k] = s;
  }
  tr.forEach((f, k) => {
    f.F0 = hz(st[k]);
    // an open vowel for a high note: F1 no lower than the pitch
    if (singer.f1Tune && f.AV > 0.3 && f.F1 < f.F0 * 1.08) f.F1 = f.F0 * 1.08;
  });
  const audio = renderFormant(tr, { rate, voice });
  return { audio, rate, t0, notes, tracks: tr };
}

/** Daisy Bell (Harry Dacre, 1892; public domain): the chorus. The first song a computer sang (1961). */
export const DAISY = {
  title: 'Daisy Bell', bpm: 138, beat: 4, transpose: -12,
  lines: [
    { lyric: 'Dai-sy, Dai-sy, give me your an-swer, do.', notes: 'C5:3 A4:3 F4:3 C4:3 D4 E4 F4 D4:2 F4 C4:5 r:1' },
    { lyric: "I'm half cra-zy, all for the love of you.", notes: 'G4:3 C5:3 A4:3 F4:3 D4 E4 F4 G4:2 A4 G4:5 r:1' },
    { lyric: "It won't be a sty-lish mar-riage, I can't af-ford a car-riage,", notes: 'A4 Bb4 A4 G4:2 C5 A4:2 G4 F4:5 r:1 G4:2 A4 F4:2 D4 F4:2 D4 C4:5 r:1' },
    { lyric: "But you'll look sweet up-on the seat of a bi-cy-cle built for two.", notes: 'C4 F4:2 A4 G4:2 C4 F4:2 A4 G4:2 A4 Bb4 C5 A4:2 F4 G4:3 C4:3 F4:6 r:3' },
  ],
};
