// airchat/lib/music-render.js — render a com.minomobi.music.composition
// record (or a JSON file in that shape) to an audio/wav Blob.
//
// Ported from /music's synth + WAV export with no changes to the
// behavior so anything composed in /music renders identically here.
// We just consume the data shape: { bpm, steps, tracks: [{ instrument,
// volume, notes: ["pitch,start,duration,velocity", …] }] }.

const MIDI_A4 = 69;
const SAMPLE_RATE = 44100;

function midiFreq(midi) {
  return 440 * Math.pow(2, (midi - MIDI_A4) / 12);
}

// Normalize track volume — /music's UI stores ints 0-100 (per the
// lexicon) but legacy/demo data is sometimes float 0-1. Handle both.
function normalizeVolume(v) {
  if (v == null) return 0.7;
  return v > 1 ? v / 100 : v;
}

// Decode a single note: "pitch,start,duration,velocity"
function decodeNote(s) {
  const parts = String(s).split(',').map(Number);
  return {
    pitch:    parts[0],
    start:    parts[1],
    duration: parts[2] || 1,
    velocity: parts[3] || 100,
  };
}

// ─── public api ─────────────────────────────────────────────────────────
//
//   await renderComposition(composition) → Blob (audio/wav)
//
// composition is the parsed JSON of a com.minomobi.music.composition
// record's value (or any object in that shape).

export async function renderComposition(composition) {
  const bpm = composition.bpm || 120;
  const steps = composition.steps || 16;
  const tracks = composition.tracks || [];
  const stepDur = 60 / bpm / 4;                          // length of a 16th note in seconds
  const totalDur = steps * stepDur + 0.5;                // tail for release tails

  const ctx = new OfflineAudioContext(2, Math.ceil(totalDur * SAMPLE_RATE), SAMPLE_RATE);

  for (const track of tracks) {
    const instrument = track.instrument || 'square';
    const volume = normalizeVolume(track.volume);
    for (const noteStr of (track.notes || [])) {
      const n = decodeNote(noteStr);
      playNote(ctx, ctx.destination, instrument, n.pitch, n.duration * stepDur, n.velocity, volume, n.start * stepDur);
    }
  }

  const rendered = await ctx.startRendering();
  return audioBufferToWavBlob(rendered);
}

// ─── synth (mirrors /music/index.html playNote) ─────────────────────────
function playNote(ctx, dest, instrument, pitch, durationSec, velocity, volume, when) {
  const gain = (velocity / 127) * volume * 0.25;

  if (instrument === 'noise') {
    const nBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = nBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = nBuf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + Math.min(durationSec, 0.15));
    src.connect(g); g.connect(dest);
    src.start(when);
    src.stop(when + 0.3);
    return;
  }

  const osc = ctx.createOscillator();
  osc.type = instrument === 'pulse' ? 'square' : instrument;
  osc.frequency.setValueAtTime(midiFreq(pitch), when);

  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, when);
  g.gain.setValueAtTime(gain, when + durationSec * 0.9);
  g.gain.exponentialRampToValueAtTime(0.001, when + durationSec);

  osc.connect(g); g.connect(dest);
  osc.start(when);
  osc.stop(when + durationSec + 0.02);

  // Pulse = two slightly detuned squares stacked — that warmer chip sound.
  if (instrument === 'pulse') {
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(midiFreq(pitch), when);
    osc2.detune.setValueAtTime(25, when);
    const g2 = ctx.createGain();
    g2.gain.setValueAtTime(gain * 0.5, when);
    g2.gain.setValueAtTime(gain * 0.5, when + durationSec * 0.9);
    g2.gain.exponentialRampToValueAtTime(0.001, when + durationSec);
    osc2.connect(g2); g2.connect(dest);
    osc2.start(when);
    osc2.stop(when + durationSec + 0.02);
  }
}

// ─── WAV encode ─────────────────────────────────────────────────────────
function audioBufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const length = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = length * blockAlign;

  const buf = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buf);

  writeStr(view, 0,  'RIFF');
  view.setUint32(4,  36 + dataSize, true);
  writeStr(view, 8,  'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channels = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));
  let offset = 44;
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

// ─── library helpers ────────────────────────────────────────────────────
//
// Two ways to source compositions: the bundled library (assets in
// /compositions) or an ATProto record on a PDS. Both end at the same
// `renderComposition(value)` call.

export async function loadBundledIndex(base = '/compositions/') {
  const res = await fetch(base + 'index.json');
  if (!res.ok) throw new Error(`index.json fetch failed (${res.status})`);
  return res.json();
}

export async function loadBundledComposition(entry, base = '/compositions/') {
  const file = entry?.file || `${entry?.id}.json`;
  const res = await fetch(base + file);
  if (!res.ok) throw new Error(`${file} fetch failed (${res.status})`);
  return res.json();
}

// ─── PDS import ─────────────────────────────────────────────────────────
//
// Fetch all com.minomobi.music.composition records from a handle's repo.
// Resolves handle → DID via bsky's public API, DID → PDS endpoint via
// PLC directory (or did:web's well-known doc), then listRecords on the
// custom collection.
//
// Returns: [{ uri, cid, value }, …] where value is the composition shape
// that renderComposition() consumes directly.

const BSKY_PUBLIC_API = 'https://api.bsky.app';
const PLC_DIR = 'https://plc.directory';

export async function fetchCompositionsByHandle(rawHandle) {
  const handle = String(rawHandle || '').replace(/^@/, '').trim().toLowerCase();
  if (!handle) throw new Error('empty handle');

  // 1) handle → DID
  const r1 = await fetch(`${BSKY_PUBLIC_API}/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(handle)}`);
  if (!r1.ok) throw new Error(`could not resolve @${handle}`);
  const { did } = await r1.json();

  // 2) DID → PDS service endpoint
  const pdsUrl = await resolvePds(did);
  if (!pdsUrl) throw new Error(`no PDS endpoint for ${did}`);

  // 3) listRecords for our composition collection
  const records = [];
  let cursor;
  for (let page = 0; page < 5; page++) {            // safety cap, 5×100 = 500 max
    const params = new URLSearchParams({
      repo: did,
      collection: 'com.minomobi.music.composition',
      limit: '100',
    });
    if (cursor) params.set('cursor', cursor);
    const r2 = await fetch(`${pdsUrl.replace(/\/$/, '')}/xrpc/com.atproto.repo.listRecords?${params}`);
    if (!r2.ok) throw new Error(`listRecords failed (${r2.status})`);
    const data = await r2.json();
    for (const rec of (data.records || [])) {
      records.push({ uri: rec.uri, cid: rec.cid, value: rec.value });
    }
    if (!data.cursor || (data.records || []).length === 0) break;
    cursor = data.cursor;
  }
  return { did, handle, pdsUrl, records };
}

async function resolvePds(did) {
  try {
    if (did.startsWith('did:plc:')) {
      const r = await fetch(`${PLC_DIR}/${did}`);
      if (!r.ok) return null;
      const doc = await r.json();
      const pds = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
      return pds?.serviceEndpoint || null;
    }
    if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).replace(/:/g, '/');
      const r = await fetch(`https://${host}/.well-known/did.json`);
      if (!r.ok) return null;
      const doc = await r.json();
      const pds = (doc.service || []).find((s) => s.id === '#atproto_pds' || s.type === 'AtprotoPersonalDataServer');
      return pds?.serviceEndpoint || null;
    }
  } catch {}
  return null;
}
