// packages/music/sonify.js — the reverse of audio-react: pull an 8-bit track
// OUT of a particle world's game state. Maps a per-step "frame log" to a
// com.minomobi.music.composition (the format /music's synth speaks), so the
// output round-trips: play it through packages/music/render.js, export it to
// /music, post it to a PDS, or feed it back into audio-react and watch a world
// dance to its own soundtrack.
//
// Pure & world-agnostic: a world produces frames, this owns the music theory.
// No Web Audio here — building the composition is just data, so it unit-tests.
//
//   frames: [{ flow,            // 0..1 order parameter → tempo / mode / note length
//              agitation?,       // 0..1 "congestion" → percussion density (default 1-flow)
//              density?,         // 0..1 → register (denser = lower)
//              voices?: [{ pos,  // 0..1 spatial position → pitch (0=high, 1=low)
//                          species }] }]   // 0 / 1 → two lead instruments
//   const comp = stateToComposition(frames, { name, steps });

export const SCALES = {
  major:    [0, 2, 4, 5, 7, 9, 11],
  minor:    [0, 2, 3, 5, 7, 8, 10],
  dorian:   [0, 2, 3, 5, 7, 9, 10],
  lydian:   [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  pentMajor:[0, 2, 4, 7, 9],     // safe — any subset stacks consonantly
  pentMinor:[0, 3, 5, 7, 10],
};
const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
const note = (pitch, start, dur, vel) => `${Math.round(pitch)},${start},${dur},${Math.round(vel)}`;

// position 0..1 (0 = top/high) → a MIDI pitch locked onto `scale` over `octaves`.
export function quantize(frac, scale, root, octaves = 2) {
  frac = clamp01(frac);
  const span = scale.length * octaves;
  const deg = Math.round((1 - frac) * (span - 1));
  return root + Math.floor(deg / scale.length) * 12 + scale[deg % scale.length];
}
// thin a cluster of positions to at most k, evenly spread (keeps chords musical).
function pickSpread(arr, k) {
  if (arr.length <= k) return arr.slice();
  const out = []; for (let i = 0; i < k; i++) out.push(arr[Math.floor(i * (arr.length - 1) / (k - 1 || 1))]);
  return out;
}

export function stateToComposition(frames, opts = {}) {
  frames = frames || [];
  const n = Math.max(1, frames.length);
  const steps = opts.steps || frames.length || 16;
  let meanFlow = 0, meanDens = 0;
  for (const f of frames) { meanFlow += clamp01(f.flow || 0); meanDens += clamp01(f.density != null ? f.density : 0.3); }
  meanFlow /= n; meanDens /= n;

  const bright = meanFlow >= (opts.brightAt ?? 0.45);          // flowing → major, jammed → minor
  const scale  = bright ? SCALES.pentMajor : SCALES.pentMinor;
  const bpm    = Math.round((opts.bpmLo ?? 76) + ((opts.bpmHi ?? 138) - (opts.bpmLo ?? 76)) * clamp01(meanFlow));
  const root   = (opts.root ?? 50) - Math.round(clamp01(meanDens) * 7);   // denser world → lower key
  const octaves = opts.octaves ?? 2;
  const beat = opts.beatSteps ?? 4, bar = opts.barSteps ?? 16;

  const leadE = [], leadS = [], bass = [], pad = [], perc = [];
  for (let i = 0; i < frames.length; i++) {
    const f = frames[i], flow = clamp01(f.flow || 0);
    const ag = f.agitation != null ? clamp01(f.agitation) : (1 - flow);     // congestion
    const prevFlow = i > 0 ? clamp01(frames[i - 1].flow || 0) : flow;
    const onset = Math.max(0, prevFlow - flow);                             // a jam slamming shut
    const dur = flow > 0.6 ? 1 : flow > 0.3 ? 2 : 3;                        // free = staccato, jam = held

    const vs = f.voices || [];
    for (const p of pickSpread(vs.filter(v => v.species === 0).map(v => v.pos), 2)) leadE.push(note(quantize(p, scale, root + 12, octaves), i, dur, 78));
    for (const p of pickSpread(vs.filter(v => v.species === 1).map(v => v.pos), 1)) leadS.push(note(quantize(p, scale, root + 12, octaves), i, dur, 72));

    if (i % 2 === 0 && ag > 0.18) perc.push(note(60, i, 1, Math.round(35 + 70 * ag)));   // hat texture = congestion
    if (onset > 0.18) perc.push(note(60, i, 1, Math.min(120, Math.round(70 + 200 * onset))));  // jam-onset accent
    if (i % beat === 0) bass.push(note(root + scale[Math.floor(i / beat) % scale.length] - 12, i, beat, 86));  // walking root
    if (i % bar === 0) { const k = meanFlow > 0.5 ? 3 : 2;                                  // fuller pad when flowing
      for (let t = 0; t < k; t++) pad.push(note(root + scale[(t * 2) % scale.length], i, bar, 38)); }
  }

  const tracks = [];
  if (bass.length)  tracks.push({ name: 'Bass',       instrument: 'triangle', volume: 55, notes: bass });
  if (pad.length)   tracks.push({ name: 'Pad',        instrument: 'pulse',    volume: 20, notes: pad });
  if (leadE.length) tracks.push({ name: 'Lead East',  instrument: 'square',   volume: 34, notes: leadE });
  if (leadS.length) tracks.push({ name: 'Lead South', instrument: 'pulse',    volume: 30, notes: leadS });
  if (perc.length)  tracks.push({ name: 'Jam',        instrument: 'noise',    volume: 45, notes: perc });

  return {
    $type: 'com.minomobi.music.composition',
    name: opts.name || 'Sonified',
    description: opts.description || `Pulled from particle state — mean flow ${meanFlow.toFixed(2)}, ${bright ? 'flowing/major' : 'jammed/minor'}, ${bpm} BPM.`,
    bpm, steps, tracks,
  };
}
