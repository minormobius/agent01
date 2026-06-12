// pod/lib/filters.js — per-clip voice filters.
//
// Ported from airchat/lib/filters.js, reduced to the self-contained set that
// needs no external library (drops the SoundTouch "anonymous" filter). Each
// filter is AudioBuffer -> Promise<AudioBuffer>, rendered offline. Note the
// tape pitch filters change LENGTH (chipmunk shorter, deep longer); the editor
// re-clamps a clip's crop when its filter changes.

export const FILTERS = [
  { id: 'none', label: 'None' },
  { id: 'warm', label: 'Warm' },         // gentle low-pass, takes edge off
  { id: 'phone', label: 'Phone' },       // 300–3400 Hz bandpass + compression
  { id: 'bright', label: 'Bright' },     // presence shelf
  { id: 'robot', label: 'Robot' },       // 30 Hz ring mod
  { id: 'chipmunk', label: 'Chipmunk' }, // tape pitch up
  { id: 'deep', label: 'Deep' },         // tape pitch down
];

export async function applyFilterBuffer(buffer, id) {
  switch (id) {
    case 'warm': return lowpass(buffer, 3200, 0.7);
    case 'phone': return phone(buffer);
    case 'bright': return shelf(buffer, 3500, 6);
    case 'robot': return robot(buffer);
    case 'chipmunk': return tape(buffer, 1.4);
    case 'deep': return tape(buffer, 0.72);
    default: return buffer;
  }
}

// Tape-style pitch shift via playbackRate (pitch+tempo coupled; length scales).
async function tape(buffer, rate) {
  const outLen = Math.ceil(buffer.length / rate);
  const off = new OfflineAudioContext(buffer.numberOfChannels, outLen, buffer.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  src.connect(off.destination);
  src.start(0);
  return off.startRendering();
}

async function phone(buffer) {
  const off = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  const hp = off.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 300;
  const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3400;
  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -24; comp.knee.value = 30; comp.ratio.value = 12;
  comp.attack.value = 0.003; comp.release.value = 0.25;
  src.connect(hp).connect(lp).connect(comp).connect(off.destination);
  src.start(0);
  return off.startRendering();
}

async function lowpass(buffer, freq, q) {
  const off = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  const lp = off.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = freq; lp.Q.value = q || 0.7;
  src.connect(lp).connect(off.destination);
  src.start(0);
  return off.startRendering();
}

async function shelf(buffer, freq, gainDb) {
  const off = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  const hs = off.createBiquadFilter(); hs.type = 'highshelf'; hs.frequency.value = freq; hs.gain.value = gainDb;
  src.connect(hs).connect(off.destination);
  src.start(0);
  return off.startRendering();
}

// Ring modulation: oscillator drives a gain AudioParam (base 0) = input × osc.
async function robot(buffer) {
  const off = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = off.createBufferSource();
  src.buffer = buffer;
  const osc = off.createOscillator(); osc.frequency.value = 30; osc.type = 'sine';
  const g = off.createGain(); g.gain.value = 0;
  osc.connect(g.gain);
  src.connect(g).connect(off.destination);
  osc.start(0);
  src.start(0);
  return off.startRendering();
}
