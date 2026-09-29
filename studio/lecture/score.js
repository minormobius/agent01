// score.js — "The Minormobius Lectures" (No. 10): the clock. The narration is the spine: every line of
// script.js is laid end to end, each as long as the voice takes to say it (narration.js DUR), with a
// breath between lines, a longer one after a quoted post (time to read it), and a title card before
// each lecture. Everything the picture does is read off TIMELINE and cues; the piano is written against
// the same seconds (the tempo is 60 bpm, so a beat is a second).
//
// The piano is a lecture hall's: quiet, under the voice. F major, I–vi–IV–V a chord every four seconds
// while he speaks, a rising three-note call on each title card, the quiet (lecture 5) in D minor, the
// return (6) with its chords broken into eighths, and a last chord rolled up the keys at "Class dismissed".

import { m, tempoMap, perform } from '../lib/score-kit.js';
import { speak } from '../lib/chipvoice.js';
import { OPENING, LECTURES, title } from './script.js';
import { DUR, LEXICON } from './narration.js';

export { title };
export const BPM = 60;
export const sec = tempoMap([[0, BPM]], 2000);

const TITLE = 7, CARD = 5, GAP = 0.9, READ = 1.6, TAIL = 12;
/** Every line in order: { from, to, say, text, q, lecture (-1 the opening), board, era, … }. */
export const TIMELINE = [];
/** Each lecture's span and its title card: { n, q, board, from, card, to }. */
export const SECTIONS = [];
let t = TITLE, k = 0;
[OPENING, ...LECTURES].forEach((L, li) => {
  const n = li - 1, s = { n, q: L.q || null, board: L.board, from: t, card: t };
  if (n >= 0) { s.card = t; t += CARD; }
  for (const line of L.lines) {
    const d = DUR[k++];
    TIMELINE.push({ ...line, from: t, to: t + d, lecture: n, board: L.board });
    t += d + GAP + (line.q ? READ : 0);
  }
  s.to = t; SECTIONS.push(s);
});
export const duration = t + TAIL;
export const cues = { title: 0, opening: TITLE, ...Object.fromEntries(SECTIONS.slice(1).map((s) => [`l${s.n + 1}`, s.card])), dismissed: TIMELINE.at(-1).from, end: duration };

// ---------------------------------------------------------------------------------- the piano --
const MAJOR = { F: ['F2', 'C3', ['A3', 'C4', 'F4']], Dm: ['D2', 'A2', ['F3', 'A3', 'D4']], Bb: ['Bb1', 'F2', ['D3', 'F3', 'Bb3']], C: ['C2', 'G2', ['E3', 'G3', 'C4']], Gm: ['G1', 'D2', ['Bb3', 'D4', 'G4']], A: ['A1', 'E2', ['C#4', 'E4', 'A4']] };
const PROG = { calm: ['F', 'Dm', 'Bb', 'C'], quiet: ['Dm', 'Bb', 'Gm', 'A'], lift: ['Bb', 'C', 'Dm', 'F'] };
const raw = [], PEDAL = [];
const note = (at, dur, names, vel, tag) => { for (const nm of [].concat(names)) raw.push({ beat: at, dur, midi: m(nm), name: nm, vel, tag }); };
// the title: a far-off open fifth and the call, twice
note(0.3, 6, ['F1', 'C2'], 0.1, 'open'); note(1.2, 1, 'A4', 0.12, 'call'); note(1.9, 1, 'C5', 0.12, 'call'); note(2.6, 4, 'F5', 0.14, 'call');
PEDAL.push([0, TITLE]);
for (const s of SECTIONS) {
  // a title card: the call, and the chord it lands on
  if (s.n >= 0) {
    const c = s.card;
    note(c + 0.2, 1, 'A4', 0.13, 'call'); note(c + 0.75, 1, 'C5', 0.13, 'call'); note(c + 1.3, 3, s.n === 4 ? 'D5' : 'F5', 0.15, 'call');
    note(c + 1.3, 4, s.n === 4 ? ['D2', 'A2'] : ['F2', 'C3'], 0.12, 'call');
    PEDAL.push([c, c + CARD]);
  }
  // under the voice: a chord every four seconds, lightly
  const mood = s.n === 4 ? 'quiet' : s.n === 5 || s.n === 6 ? 'lift' : 'calm', start = s.n >= 0 ? s.card + CARD : s.from;
  for (let at = start, i = 0; at < s.to - 1; at += 4, i++) {
    const [root, fifth, chord] = MAJOR[PROG[mood][i % 4]], len = Math.min(4, s.to - at);
    note(at, len, [root, fifth], 0.1, 'bass');
    if (s.n === 5 || s.n === 6) chord.concat(chord.slice(0, 2).map((c) => c.replace(/\d$/, (d) => +d + 1))).forEach((c, j) => { if (j * 0.5 < len) note(at + 0.5 + j * 0.5, 0.5, c, 0.075 + 0.006 * j, 'broken'); });
    else note(at + 1, len - 1, chord, 0.07, 'chord');
    PEDAL.push([at, at + len]);
  }
}
// "Class dismissed": the last chord, rolled up the keys, and left to ring
const last = cues.dismissed + DUR.at(-1) + 0.4;
note(last, 10, ['F1', 'F2'], 0.18, 'last');
['C3', 'F3', 'A3', 'C4', 'F4', 'G4', 'A4', 'C5', 'F5', 'A5'].forEach((nm, j) => note(last + 0.05 + j * 0.16, 10 - j * 0.16, nm, 0.15 - 0.004 * j, 'last'));
PEDAL.push([last, duration]);
export const events = perform(raw.filter((e) => e.beat < duration - 0.5), sec, PEDAL, 0x10c7);
export const bandEvents = [];

// ------------------------------------------------------------------------------- the voice --
/**
 * The lecturer's voice (lib/chipvoice.js), every line at its time, in a small hall: two soft early
 * reflections and a short tail. Rendered at 16 kHz and read up to the output rate (the formant voice
 * has nothing above 8 kHz worth the cost of rendering it at 48).
 */
export async function vocal(sampleRate) {
  const R = 16000, n = Math.ceil(duration * sampleRate), out = new Float32Array(n), ratio = R / sampleRate;
  for (const line of TIMELINE) {
    const { audio } = speak(line.say, LEXICON, { rate: R });
    const at = Math.round(line.from * sampleRate), len = Math.floor(audio.length / ratio);
    for (let i = 0; i < len && at + i < n; i++) {
      const x = i * ratio, j = x | 0, f = x - j, v = audio[j] * (1 - f) + (audio[j + 1] || 0) * f;
      out[at + i] += v * 0.9;
    }
  }
  // the hall: two early reflections, then a damped comb for the tail
  const e1 = Math.round(0.023 * sampleRate), e2 = Math.round(0.041 * sampleRate), D = Math.round(0.089 * sampleRate), wet = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const early = (i >= e1 ? out[i - e1] * 0.22 : 0) + (i >= e2 ? out[i - e2] * 0.14 : 0);
    const fb = i >= D ? wet[i - D] : 0; lp += 0.35 * (fb - lp);
    wet[i] = out[i] * 0.18 + lp * 0.62;
    out[i] += early;
  }
  for (let i = 0; i < n; i++) out[i] += wet[i] * 0.5;
  return { audio: out, at: 0, gain: 1 };
}

export const notation = { bars: Math.ceil(duration / 4), time: [4, 4], keys: [[1, 'f', 'major']], tempos: [[1, BPM]], sections: [] };
