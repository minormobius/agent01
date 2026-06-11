// pod/lib/chiptune.js — self-contained 8-bit music renderer.
//
// Extracted from music/index.html's Web Audio synth (the same `playNote`
// oscillator voices + the OfflineAudioContext export path). No build, no deps.
// Used by /prod to bake an 8-bit music BED into an AudioBuffer that gets mixed
// under the podcast voices.
//
// A composition is { name, bpm, steps, tracks:[{ instrument, volume, notes }] }
// where volume is 0..1 (or 0..100 as stored in com.minomobi.music.composition)
// and each note is { pitch, start, duration, velocity } or the CSV string
// "pitch,start,duration,velocity".

export function midiFreq(midi) { return 440 * Math.pow(2, (midi - 69) / 12); }

// One synth voice — faithful port of music/index.html playNote(). `stepDur` is
// seconds-per-16th-step. Works against any (online or offline) AudioContext.
function playNote(instrument, pitch, durSteps, velocity, volume, when, ctx, dest, stepDur) {
  dest = dest || ctx.destination;
  const dur = durSteps * stepDur;
  const gain = (velocity / 127) * volume * 0.25;

  if (instrument === 'noise') {
    const nBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = nBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = nBuf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + Math.min(dur, 0.15));
    src.connect(g);
    g.connect(dest);
    src.start(when);
    src.stop(when + 0.3);
    return;
  }

  const osc = ctx.createOscillator();
  osc.type = instrument === 'pulse' ? 'square' : instrument;
  osc.frequency.setValueAtTime(midiFreq(pitch), when);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.setValueAtTime(gain, when + dur * 0.9);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(g);
  g.connect(dest);
  osc.start(when);
  osc.stop(when + dur + 0.02);

  if (instrument === 'pulse') {
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(midiFreq(pitch), when);
    osc2.detune.setValueAtTime(25, when);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(gain * 0.5, when);
    g2.gain.setValueAtTime(gain * 0.5, when + dur * 0.9);
    g2.gain.exponentialRampToValueAtTime(0.001, when + dur);
    osc2.connect(g2);
    g2.connect(dest);
    osc2.start(when);
    osc2.stop(when + dur + 0.02);
  }
}

function parseNote(n) {
  if (typeof n === 'string') {
    const [pitch, start, duration, velocity] = n.split(',').map(Number);
    return { pitch, start, duration, velocity };
  }
  return n;
}

export function normalizeComposition(comp) {
  return {
    name: comp.name || 'Untitled',
    bpm: comp.bpm || 120,
    steps: comp.steps || 32,
    tracks: (comp.tracks || []).map((t) => ({
      instrument: t.instrument || 'square',
      // record format stores 0..100; the in-memory format uses 0..1.
      volume: typeof t.volume === 'number' ? (t.volume > 1 ? t.volume / 100 : t.volume) : 0.5,
      notes: (t.notes || []).map(parseNote),
    })),
  };
}

export function loopDuration(comp) {
  const c = normalizeComposition(comp);
  return c.steps * (60 / c.bpm / 4);
}

// Render a composition to a full-length looped AudioBuffer covering `targetSec`.
// Synthesizes ONE loop offline, then tiles it by copying samples — so an hour of
// bed costs one short render plus a memcpy, not thousands of oscillator nodes.
export async function renderBed(comp, targetSec, sampleRate = 44100) {
  const c = normalizeComposition(comp);
  const stepDur = 60 / c.bpm / 4;
  const loopSec = c.steps * stepDur;
  const loopLen = Math.max(1, Math.ceil(loopSec * sampleRate));

  const off = new OfflineAudioContext(2, loopLen, sampleRate);
  for (const track of c.tracks) {
    for (const n of track.notes) {
      playNote(track.instrument, n.pitch, n.duration, n.velocity, track.volume, n.start * stepDur, off, off.destination, stepDur);
    }
  }
  const loopBuf = await off.startRendering();

  const totalLen = Math.max(loopLen, Math.ceil(targetSec * sampleRate));
  const out = new AudioBuffer({ length: totalLen, numberOfChannels: 2, sampleRate });
  for (let ch = 0; ch < 2; ch++) {
    const src = loopBuf.getChannelData(Math.min(ch, loopBuf.numberOfChannels - 1));
    const dst = out.getChannelData(ch);
    for (let i = 0; i < totalLen; i++) dst[i] = src[i % loopLen];
  }
  return out;
}

// --- bed catalog ------------------------------------------------------------
// The "8-Bit Demo" is lifted verbatim from music/index.html; the others are
// authored in the same format as quieter, sparser podcast beds.

export const BEDS = [
  {
    id: 'demo',
    name: '8-Bit Demo',
    mood: 'upbeat',
    comp: {
      name: '8-Bit Demo', bpm: 140, steps: 32,
      tracks: [
        { name: 'Lead', instrument: 'square', volume: 60, notes: [
          '72,0,2,100','76,2,2,90','79,4,2,100','81,6,2,90','79,8,2,85','76,10,2,80','72,12,2,100','74,14,2,90',
          '76,16,2,100','77,18,2,90','76,20,2,85','74,22,2,80','72,24,4,100','79,28,2,90','84,30,2,100'] },
        { name: 'Bass', instrument: 'triangle', volume: 50, notes: [
          '48,0,4,100','48,4,4,90','45,8,4,100','45,12,4,90','43,16,4,100','43,20,4,90','48,24,4,100','48,28,4,90'] },
        { name: 'Arp', instrument: 'pulse', volume: 35, notes: [
          '60,0,1,70','64,1,1,70','67,2,1,70','60,3,1,60','60,4,1,70','64,5,1,70','67,6,1,70','60,7,1,60',
          '57,8,1,70','60,9,1,70','64,10,1,70','57,11,1,60','57,12,1,70','60,13,1,70','64,14,1,70','57,15,1,60',
          '55,16,1,70','59,17,1,70','62,18,1,70','55,19,1,60','55,20,1,70','59,21,1,70','62,22,1,70','55,23,1,60',
          '60,24,1,70','64,25,1,70','67,26,1,70','60,27,1,60','60,28,1,70','64,29,1,70','67,30,1,70','72,31,1,80'] },
        { name: 'Drums', instrument: 'noise', volume: 40, notes: [
          '60,0,1,100','60,4,1,70','60,8,1,100','60,12,1,70','60,16,1,100','60,20,1,70','60,24,1,100','60,28,1,70',
          '48,2,1,50','48,6,1,50','48,10,1,50','48,14,1,50','48,18,1,50','48,22,1,50','48,26,1,50','48,30,1,50'] },
      ],
    },
  },
  {
    id: 'mellow',
    name: 'Mellow Loop',
    mood: 'calm · under-talk',
    comp: {
      name: 'Mellow Loop', bpm: 96, steps: 32,
      tracks: [
        // Am – F – C – G, held triangle roots
        { name: 'Bass', instrument: 'triangle', volume: 45, notes: [
          '45,0,8,80','41,8,8,80','48,16,8,80','43,24,8,80'] },
        // soft square arpeggio, low velocity
        { name: 'Pad', instrument: 'square', volume: 28, notes: [
          '57,0,2,45','60,2,2,40','64,4,2,45','60,6,2,40','53,8,2,45','57,10,2,40','60,12,2,45','57,14,2,40',
          '60,16,2,45','64,18,2,40','67,20,2,45','64,22,2,40','55,24,2,45','59,26,2,40','62,28,2,45','59,30,2,40'] },
      ],
    },
  },
  {
    id: 'pulse',
    name: 'Outro Pulse',
    mood: 'minimal · stinger',
    comp: {
      name: 'Outro Pulse', bpm: 120, steps: 16,
      tracks: [
        { name: 'Sub', instrument: 'triangle', volume: 50, notes: [
          '36,0,4,70','36,4,4,55','43,8,4,70','43,12,4,55'] },
        { name: 'Blip', instrument: 'pulse', volume: 22, notes: [
          '72,0,1,60','79,4,1,55','72,8,1,60','76,12,1,55'] },
      ],
    },
  },
];

export function bedById(id) { return BEDS.find((b) => b.id === id); }
