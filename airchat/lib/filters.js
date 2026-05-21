// airchat/lib/filters.js — voice filter library.
//
// All filters run client-side via OfflineAudioContext. Output is always
// WAV (audio/wav) because browsers don't natively encode webm/opus
// from rendered audio. WAV is uncompressed (mono 16-bit @ 44.1kHz =
// ~88 KB/sec, well under our 16 MB cap for a 90s clip).
//
// SoundTouchJS (anonymous filter) loads from a CDN on first use. If the
// CDN is unreachable, we fall back to a tape-style pitch shift so the
// feature degrades rather than failing outright.

export const FILTERS = [
  { id: 'none',      label: 'None',      description: 'Original recording' },
  { id: 'chipmunk',  label: 'Chipmunk',  description: 'Pitch up ~5 semitones (tape-style)' },
  { id: 'deep',      label: 'Deep',      description: 'Pitch down ~5 semitones (tape-style)' },
  { id: 'phone',     label: 'Phone',     description: '300–3400 Hz bandpass + compression' },
  { id: 'robot',     label: 'Robot',     description: 'Ring modulation at 30 Hz' },
  { id: 'anonymous', label: 'Anonymous', description: 'Pitch -5 semi (no tempo change) + low-pass' },
];

// ─── public api ─────────────────────────────────────────────────────────
export async function applyFilter(blob, filterId) {
  if (!filterId || filterId === 'none') return blob;
  const buffer = await decodeAudio(blob);
  let result;
  switch (filterId) {
    case 'chipmunk':  result = await tapeFilter(buffer, 1.4); break;
    case 'deep':      result = await tapeFilter(buffer, 0.72); break;
    case 'phone':     result = await phoneFilter(buffer); break;
    case 'robot':     result = await robotFilter(buffer); break;
    case 'anonymous': result = await anonymousFilter(buffer); break;
    default: return blob;
  }
  return audioBufferToWavBlob(result);
}

// ─── decoding ───────────────────────────────────────────────────────────
async function decodeAudio(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    return await ctx.decodeAudioData(arrayBuffer);
  } finally {
    ctx.close();
  }
}

// ─── filters ────────────────────────────────────────────────────────────

// Tape-style pitch shift via playbackRate. Pitch and tempo are coupled
// (rate > 1 → chipmunk, < 1 → deep). Output length scales by 1/rate.
async function tapeFilter(buffer, rate) {
  const outLen = Math.ceil(buffer.length / rate);
  const offline = new OfflineAudioContext(buffer.numberOfChannels, outLen, buffer.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  src.playbackRate.value = rate;
  src.connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

// Phone filter — narrow the frequency response to ~300–3400 Hz (POTS
// bandwidth) and run through dynamics compression for that classic
// "tinny phone call" sound.
async function phoneFilter(buffer) {
  const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  const hp = offline.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 300;
  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 3400;
  const comp = offline.createDynamicsCompressor();
  comp.threshold.value = -24;
  comp.knee.value = 30;
  comp.ratio.value = 12;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  src.connect(hp).connect(lp).connect(comp).connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

// Ring modulation — multiply the signal by a low-frequency sine. Web
// Audio doesn't have a multiply node, but routing an OscillatorNode
// into a GainNode's `gain` AudioParam gives the same effect (gain
// swings ±1 around its base value of 0, so output = input × osc).
async function robotFilter(buffer) {
  const offline = new OfflineAudioContext(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = buffer;
  const osc = offline.createOscillator();
  osc.frequency.value = 30;
  osc.type = 'sine';
  const gain = offline.createGain();
  gain.gain.value = 0;
  osc.connect(gain.gain);
  src.connect(gain).connect(offline.destination);
  osc.start(0);
  src.start(0);
  return offline.startRendering();
}

// Anonymous — proper pitch shift without tempo change via SoundTouchJS,
// plus a 4 kHz low-pass to muddy formant peaks (makes voice ID harder).
// Loads SoundTouchJS dynamically on first use; falls back to tape pitch
// shift if the CDN is unreachable.
let _soundtouchModule = null;
let _soundtouchTried = false;
async function loadSoundTouch() {
  if (_soundtouchModule) return _soundtouchModule;
  if (_soundtouchTried) return null;
  _soundtouchTried = true;
  try {
    // esm.sh re-serves npm modules as ESM with proper exports.
    _soundtouchModule = await import('https://esm.sh/soundtouchjs@0.2.1');
    return _soundtouchModule;
  } catch (e) {
    console.error('soundtouchjs load failed; falling back to tape pitch shift', e);
    return null;
  }
}

async function anonymousFilter(buffer) {
  const st = await loadSoundTouch();
  if (!st || !st.SoundTouch) {
    // Degradation path: tape-style pitch shift (changes tempo too).
    // Still anonymizes casually; just sounds slower.
    return tapeFilter(buffer, 0.72);
  }
  const { SoundTouch, SimpleFilter, WebAudioBufferSource } = st;

  const numChannels = buffer.numberOfChannels;
  const soundTouch = new SoundTouch(buffer.sampleRate);
  soundTouch.pitchSemitones = -5;
  soundTouch.tempo = 1;
  soundTouch.rate = 1;

  const source = new WebAudioBufferSource(buffer);
  const filter = new SimpleFilter(source, soundTouch);

  // Pull samples in chunks. SoundTouchJS emits interleaved L/R regardless
  // of input channels — we just take channel 0 if mono, both if stereo.
  const BUFFER_FRAMES = 4096;
  const interleaved = new Float32Array(BUFFER_FRAMES * 2);
  const collected = [];
  let totalFrames = 0;
  while (true) {
    const n = filter.extract(interleaved, BUFFER_FRAMES);
    if (n === 0) break;
    const l = new Float32Array(n);
    const r = numChannels > 1 ? new Float32Array(n) : null;
    for (let i = 0; i < n; i++) {
      l[i] = interleaved[i * 2];
      if (r) r[i] = interleaved[i * 2 + 1];
    }
    collected.push({ l, r });
    totalFrames += n;
  }

  // Pack into an AudioBuffer at the original sample rate.
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const shifted = ctx.createBuffer(numChannels, totalFrames, buffer.sampleRate);
  const lOut = shifted.getChannelData(0);
  const rOut = numChannels > 1 ? shifted.getChannelData(1) : null;
  let offset = 0;
  for (const chunk of collected) {
    lOut.set(chunk.l, offset);
    if (rOut && chunk.r) rOut.set(chunk.r, offset);
    offset += chunk.l.length;
  }
  ctx.close();

  // Run the pitch-shifted buffer through a gentle low-pass to soften
  // residual formant peaks. Makes the voice harder to identify than
  // pitch shift alone.
  const offline = new OfflineAudioContext(numChannels, shifted.length, shifted.sampleRate);
  const src = offline.createBufferSource();
  src.buffer = shifted;
  const lp = offline.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 4000;
  lp.Q.value = 0.7;
  src.connect(lp).connect(offline.destination);
  src.start(0);
  return offline.startRendering();
}

// ─── WAV encoding ───────────────────────────────────────────────────────
function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;                                  // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  writeStr(view, 0,  'RIFF');
  view.setUint32(4,  36 + dataSize, true);
  writeStr(view, 8,  'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);                              // PCM subchunk size
  view.setUint16(20, 1, true);                               // PCM format
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);              // bits/sample
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channels = [];
  for (let ch = 0; ch < numChannels; ch++) channels.push(buffer.getChannelData(ch));
  for (let i = 0; i < length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([buf], { type: 'audio/wav' });
}

function writeStr(view, offset, str) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
