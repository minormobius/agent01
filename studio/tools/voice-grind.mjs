#!/usr/bin/env node
// voice-grind.mjs — Whisper in the loop: tune the formant voice to be understood AND to sound like
// the reference voice (2c), one nudge at a time, keeping every step so the progress can be heard.
//
//   VOICE_PYLIB=… node studio/tools/voice-grind.mjs <reference dir> [--minutes 110]
//
// The objective, lower is better:  CER% (Whisper base.en, 20 Harvard sentences, each alone)
//                                 + 1.5 × tone (dB: how far the long-term spectrum's SHAPE is from the
//                                              reference's recordings of the same sentences)
//                                 + 1.0 × pitch (semitones: the median and the melody's range, off 2c's)
// The fits before this one moved only formant targets, and every voice sounded alike: what makes a
// voice sound like someone is its source and its prosody. So the parameters are the voice's own
// first (pitch, melody, pace, size, brightness, breath, the glottal pulse, resonance width, jitter),
// then the vowels' F1 and F2 (order kept: F1 < F2 < F3). Coordinate descent: a nudge each way, keep
// what helps, halve the steps when a whole pass finds nothing.
//
// Every accepted step writes studio/voice/grind/NN.wav (the paragraph's opening, 16 kHz) and a line
// in grind/progress.json; the voice page plays them in order. Touch grind/STOP to end it early.
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { speak, tracks, timing, phonemize, wav, VOICE, PHONES } from '../lib/chipvoice.js';
import { FITS } from '../lib/chipvoice-fit.js';
import { HARVARD, PARAGRAPH_SENTENCES } from '../voice/texts.js';

const here = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), refDir = argv[0];
// --weights tone=4,pitch=2 reweights the objective; --only global moves only the voice's own controls
const W = { tone: 1.5, pitch: 1 };
if (argv.includes('--weights')) for (const kv of argv[argv.indexOf('--weights') + 1].split(',')) { const [k, v] = kv.split('='); W[k] = Number(v); }
const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const MINUTES = Number(argv.includes('--minutes') ? argv[argv.indexOf('--minutes') + 1] : 110);
const out = join(here, '..', 'voice', 'grind'), tmp = '/tmp/voice-grind';
mkdirSync(out, { recursive: true }); mkdirSync(tmp, { recursive: true });
const lex = JSON.parse(readFileSync(join(here, '..', 'voice', 'lexicon.json'), 'utf8')).words;
const SR = 16000;
const EVAL = HARVARD.map((t, i) => ({ id: `h${i + 1}`, t })).filter((_, i) => i % 2 === 1 && i < 40);   // h2, h4 … h40
const SNAP = `${PARAGRAPH_SENTENCES[0]} ${PARAGRAPH_SENTENCES[1]}`;

// ---- Whisper, warm ------------------------------------------------------------------------------
const py = spawn('python3', [join(here, 'voice_asr_server.py'), 'base.en'], { env: { ...process.env, PYTHONPATH: [process.env.VOICE_PYLIB, process.env.PYTHONPATH].filter(Boolean).join(':') }, stdio: ['pipe', 'pipe', 'inherit'] });
let buf = '', waiting = null;
py.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 1); if (waiting) { const w = waiting; waiting = null; w(JSON.parse(line)); } } });
const ask = (msg) => new Promise((r) => { waiting = r; if (msg) py.stdin.write(JSON.stringify(msg) + '\n'); });
await ask(null);                                                 // { ready }

// ---- measures ----------------------------------------------------------------------------------
const norm = (s) => s.toLowerCase().replace(/[^a-z' ]+/g, ' ').replace(/'/g, '').split(/\s+/).filter(Boolean).join(' ');
function edit(a, b) { let prev = Array.from({ length: b.length + 1 }, (_, j) => j); for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; } return prev[b.length]; }
function readWav(p) {
  const b = readFileSync(p); let o = 12, data = null;
  while (o < b.length) { const id = b.toString('ascii', o, o + 4), n = b.readUInt32LE(o + 4); if (id === 'data') { data = b.subarray(o + 8, o + 8 + n); break; } o += 8 + n; }
  const x = new Float64Array(data.length >> 1); for (let i = 0; i < x.length; i++) x[i] = data.readInt16LE(i * 2) / 32768; return x;
}
// the long-term spectrum's shape in third-octave bands, over the louder 60% of 32 ms frames (the voice, not the gaps)
const BANDS = [125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300];
function ltas(chunks) {
  const N = 512, acc = new Float64Array(BANDS.length), frames = [];
  for (const x of chunks) for (let o = 0; o + N <= x.length; o += 256) { let e = 0; for (let i = 0; i < N; i++) e += x[o + i] ** 2; frames.push([x, o, e]); }
  const cut = frames.map((f) => f[2]).sort((a, b) => a - b)[Math.floor(frames.length * 0.4)];
  for (const [x, o, e] of frames) {
    if (e < cut) continue;
    // a direct DFT per band centre is enough at these frequencies
    BANDS.forEach((fc, bi) => { let p = 0; for (const f of [fc / 1.12, fc, fc * 1.12]) { let re = 0, im = 0; for (let i = 0; i < N; i += 2) { const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N), a = (2 * Math.PI * f * i) / SR; re += x[o + i] * w * Math.cos(a); im -= x[o + i] * w * Math.sin(a); } p += re * re + im * im; } acc[bi] += p; });
  }
  const db = Array.from(acc, (p) => 10 * Math.log10(p + 1e-12)), m = db.reduce((a, b) => a + b) / db.length;
  return db.map((v) => v - m);
}
const REF_LTAS = ltas(EVAL.map((s) => readWav(join(refDir, `${s.id}.wav`))));
const REF_F0 = 120.3, REF_RATIO = 155.3 / 99.8;                  // measured from 2c (voice_measure.py)

async function evaluate(voice) {
  const chunks = [];
  const files = EVAL.map((s) => { const { audio } = speak(s.t, lex, { rate: SR, voice }); chunks.push(Float64Array.from(audio)); const f = join(tmp, `${s.id}.wav`); writeFileSync(f, wav(audio, SR)); return f; });
  const { texts } = await ask({ files });
  let e = 0, n = 0;
  EVAL.forEach((s, i) => { const r = norm(s.t), h = norm(texts[i]); e += edit(r, h); n += r.length; });
  const cer = (100 * e) / n;
  const L = ltas(chunks), tone = Math.sqrt(L.reduce((s, v, i) => s + (v - REF_LTAS[i]) ** 2, 0) / L.length);
  // pitch: the voiced frames' F0 from the tracks the synthesiser plays
  const f0s = [];
  for (const s of EVAL) for (const t of tracks(timing(phonemize(s.t, lex), voice), voice)) if (t.AV > 0.3) f0s.push(t.F0);
  f0s.sort((a, b) => a - b);
  const q = (p) => f0s[Math.floor(p * (f0s.length - 1))], med = q(0.5), ratio = q(0.9) / q(0.1);
  const pitch = Math.abs(12 * Math.log2(med / REF_F0)) + Math.abs(12 * Math.log2(ratio / REF_RATIO));
  return { J: cer + W.tone * tone + W.pitch * pitch, cer, tone, pitch, heard: texts };
}

// ---- parameters ---------------------------------------------------------------------------------
const voice = { ...VOICE, fit: 3 };
FITS.whisper = FITS.whisper || {};
const GLOBAL = [
  ['warmth', 0, 3, 0.25], ['bw1', 0.6, 3, 0.25], ['hiss', 0.3, 1.5, 0.1],
  ['f0', 80, 170, 8], ['range', 0, 0.8, 0.06], ['rate', 0.85, 1.3, 0.05], ['scale', 0.95, 1.3, 0.03], ['oq', 0.35, 0.8, 0.05],
  ['breath', 0, 2.5, 0.2], ['tilt', 0, 0.9, 0.1], ['bw', 0.6, 2.2, 0.15], ['jitter', 0, 0.03, 0.005],
].map(([key, lo, hi, step]) => ({ kind: 'voice', key, lo, hi, step, label: key }));
// phase 3: the consonants. The hiss's envelope and level, the stops' breath, closure and voice bar
// (voice controls), and the phonemes' own noise: the s's two bands, sh's, z's level, f/th's hiss,
// the t/p/k bursts. A phoneme parameter is a path into its PHONES entry, fitted into FITS.whisper.
const CONS_VOICE = [
  ['fricAttack', 0, 150, 15], ['fricRelease', 0, 120, 15], ['hiss', 0.3, 1.5, 0.1], ['aspLevel', 0.3, 2, 0.15],
  ['aspMs', 0.5, 1.8, 0.15], ['closure', 0.5, 1.5, 0.1], ['voiceBar', 0, 0.4, 0.05],
].map(([key, lo, hi, step]) => ({ kind: 'voice', key, lo, hi, step, label: key }));
const CONS_PHONE = [
  ['S', ['fr', 0, 0], 3300, 6500, 300], ['S', ['fr', 0, 2], 0.3, 1.5, 0.15], ['S', ['fr', 1, 0], 4500, 7500, 400], ['S', ['fr', 1, 2], 0, 1.2, 0.15],
  ['SH', ['fr', 0, 0], 1800, 3500, 250], ['Z', ['amp'], 0.2, 1.2, 0.1], ['F', ['bypass'], 0, 0.4, 0.05], ['TH', ['bypass'], 0, 0.4, 0.05],
  ['T', ['burst', 'fr', 0, 0], 3000, 6000, 300], ['T', ['burst', 'fr', 0, 2], 0.3, 1.5, 0.15], ['P', ['burst', 'bypass'], 0, 0.6, 0.05], ['K', ['burst', 'fr', 0, 2], 0.3, 1.5, 0.15],
].map(([p, path, lo, hi, step]) => ({ kind: 'phone', p, path, lo, hi, step, label: `${p} ${path.join('.')}` }));
const VOWELS = ['IY', 'IH', 'EH', 'AE', 'AA', 'AO', 'UH', 'UW', 'AH', 'ER', 'AX'];
const VPAR = VOWELS.flatMap((p) => [0, 1].map((k) => ({ kind: 'vowel', p, k, rel: 0.06, label: `${p} F${k + 1}` })));
const vowelF = (p) => (FITS.whisper[p]?.F || PHONES[p].F);
const merged = (p) => JSON.parse(JSON.stringify({ ...PHONES[p], ...(FITS.whisper[p] || {}) }));
const getP = (q) => (q.kind === 'voice' ? voice[q.key] : q.kind === 'phone' ? q.path.reduce((o, k) => o[k], merged(q.p)) : vowelF(q.p)[q.k]);
function setP(q, v) {
  if (q.kind === 'voice') { voice[q.key] = v; return true; }
  if (q.kind === 'phone') {
    if (v < q.lo || v > q.hi) return false;
    const m = merged(q.p); let o = m; for (const k of q.path.slice(0, -1)) o = o[k]; o[q.path[q.path.length - 1]] = v;
    const top = q.path[0]; FITS.whisper[q.p] = { ...(FITS.whisper[q.p] || {}), [top]: m[top] }; return true;
  }
  const F = [...vowelF(q.p)]; F[q.k] = v;
  const b = PHONES[q.p].F[q.k];
  if (v < b * 0.75 || v > b * 1.25 || F[0] + 150 > F[1] || F[1] + 150 > F[2]) return false;   // bounded, and in order
  FITS.whisper[q.p] = { F }; return true;
}
const fmt = (q, v) => (q.kind !== 'vowel' ? (Math.abs(v) < 10 ? v.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') : v.toFixed(0)) : v.toFixed(0));

// ---- the grind ----------------------------------------------------------------------------------
const t0 = Date.now() - (argv.includes('--resume') ? 60000 * JSON.parse(readFileSync(join(out, 'progress.json'), 'utf8')).steps.slice(-1)[0].minute : 0), minutes = () => (Date.now() - t0) / 60000;
const progress = [];
function snapshot(r, change) {
  const n = String(progress.length).padStart(2, '0');
  const { audio } = speak(SNAP, lex, { rate: SR, voice });
  writeFileSync(join(out, `${n}.wav`), wav(audio, SR));
  const vowels = Object.fromEntries(Object.entries(FITS.whisper).filter(([, f]) => f.F).map(([p, f]) => [p, f.F.map(Math.round)]));
  const phones = Object.fromEntries(Object.entries(FITS.whisper).map(([p, f]) => [p, Object.fromEntries(Object.entries(f).filter(([k]) => k !== 'F'))]).filter(([, f]) => Object.keys(f).length));
  const voiceNow = Object.fromEntries([...GLOBAL, ...CONS_VOICE].map((g) => [g.key, +voice[g.key].toFixed(4)]));
  progress.push({ n, minute: +minutes().toFixed(1), J: +r.J.toFixed(2), cer: +r.cer.toFixed(1), tone: +r.tone.toFixed(2), pitch: +r.pitch.toFixed(2), change, voice: voiceNow, vowels, phones });
  writeFileSync(join(out, 'progress.json'), JSON.stringify({ text: SNAP, reference: 'ElevenLabs 2c (NkiasLzNGB7MWA6gNgU4)', objective: `CER% + ${W.tone} × tone dB + ${W.pitch} × pitch semitones`, steps: progress }, null, 1));
  writeFileSync(join(here, '..', 'lib', 'chipvoice-fit.js'), readFileSync(join(here, '..', 'lib', 'chipvoice-fit.js'), 'utf8').replace(/\nwhisper: .*,\n/, '\n').replace(/\n};\n$/, `\nwhisper: ${JSON.stringify(FITS.whisper, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v))},\n};\n`));
  console.log(`[${n}] ${minutes().toFixed(1)} min  J ${r.J.toFixed(2)} = CER ${r.cer.toFixed(1)}% + ${W.tone}×tone ${r.tone.toFixed(2)} dB + ${W.pitch}×pitch ${r.pitch.toFixed(2)} st   ${change}`);
}
// --resume: carry on from the last step of grind/progress.json (the voice, the vowels, the numbering)
let best;
if (argv.includes('--resume')) {
  const prev = JSON.parse(readFileSync(join(out, 'progress.json'), 'utf8')).steps, last = prev[prev.length - 1];
  Object.assign(voice, last.voice);
  for (const [p, F] of Object.entries(last.vowels)) FITS.whisper[p] = { F };
  for (const [p, f] of Object.entries(last.phones || {})) FITS.whisper[p] = { ...(FITS.whisper[p] || {}), ...f };
  progress.push(...prev);
  best = await evaluate(voice);
  snapshot(best, ONLY === 'consonants' ? 'phase 3: the consonants (the hiss envelope added: s swells in over 60 ms)' : argv.includes('--weights') ? `phase 2: the objective reweighted (tone ×${W.tone}, pitch ×${W.pitch})${ONLY ? ', the voice controls only' : ''}` : 'resumed, with new controls');
} else {
  for (const f of readdirSync(out)) if (/^\d\d\.wav$/.test(f)) writeFileSync(join(out, f), '');   // clear an old run's snapshots
  best = await evaluate(voice);
  snapshot(best, 'the start: the textbook voice');
}
const params = ONLY === 'global' ? GLOBAL : ONLY === 'consonants' ? [...CONS_VOICE, ...CONS_PHONE] : [...GLOBAL, ...VPAR];
let scale = 1;
outer: while (minutes() < MINUTES && scale > 0.12) {
  let moved = 0;
  for (const q of params) {
    if (minutes() >= MINUTES || existsSync(join(out, 'STOP'))) break outer;
    const v0 = getP(q);
    for (const dir of [1, -1]) {
      let v = q.kind === 'vowel' ? v0 * (1 + dir * q.rel * scale) : v0 + dir * q.step * scale;
      if (q.kind !== 'vowel') v = Math.min(q.hi, Math.max(q.lo, v));
      if (Math.abs(v - v0) < 1e-9) continue;
      if (!setP(q, v)) { setP(q, v0); continue; }
      const r = await evaluate(voice);
      if (r.J < best.J - 0.05) { best = r; moved++; snapshot(r, `${q.label} ${fmt(q, v0)} → ${fmt(q, v)}`); break; }
      setP(q, v0);
    }
  }
  if (!moved) { scale /= 2; console.log(`— a pass found nothing: steps halved (×${scale})`); }
}
console.log(`done after ${minutes().toFixed(1)} min: J ${best.J.toFixed(2)} (CER ${best.cer.toFixed(1)}%, tone ${best.tone.toFixed(2)} dB, pitch ${best.pitch.toFixed(2)} st)`);
writeFileSync(join(out, 'best-voice.json'), JSON.stringify(Object.fromEntries(GLOBAL.map((g) => [g.key, +voice[g.key].toFixed(4)])), null, 1));
py.stdin.end();
process.exit(0);
