// main.js — the voice lab: hear the chip voice, see it, bend it, type at it.
//
// Everything is synthesised here, in the page, by ../lib/chipvoice.js: no recordings, no
// model. report.json is the last scoring run (studio/tools/voice.mjs --report): what Whisper
// heard for each test sentence.

import { speak, VOICE, phonemize } from '../lib/chipvoice.js';
import { PARAGRAPH, HARVARD } from './texts.js';

const $ = (id) => document.getElementById(id);
let lexicon = null, fullLoaded = false;
const small = fetch('./lexicon.json').then((r) => r.json()).then((j) => { lexicon = { ...j.words }; });
/** The whole CMU dictionary (3.6 MB), fetched the first time something is typed. */
async function fullLexicon() {
  if (fullLoaded) return;
  fullLoaded = true;
  $('lexstate').textContent = 'loading the dictionary…';
  const txt = await (await fetch('./cmudict.txt')).text();
  for (const line of txt.split('\n')) {
    if (line.startsWith(';;;')) continue;
    const sp = line.indexOf(' ');
    if (sp < 0) continue;
    const w = line.slice(0, sp);
    if (!w.includes('(') && !(w in lexicon)) lexicon[w] = line.slice(sp + 1).trim();
  }
  $('lexstate').textContent = `${Object.keys(lexicon).length.toLocaleString()} words`;
}

// ---- the voice's knobs --------------------------------------------------------------
const KNOBS = [
  ['f0', 'pitch', 70, 220, 1, 'Hz'], ['scale', 'size (formants)', 0.8, 1.4, 0.01, '×'], ['rate', 'rate', 0.6, 1.6, 0.01, '×'],
  ['breath', 'breath', 0, 2, 0.01, ''], ['oq', 'glottis open', 0.35, 0.85, 0.01, ''], ['range', 'melody', 0, 0.6, 0.01, ''],
];
const voice = { ...VOICE };
const knobs = $('knobs');
for (const [k, label, min, max, step, unit] of KNOBS) {
  const row = document.createElement('label');
  row.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${voice[k]}"><output>${voice[k]}${unit}</output>`;
  const inp = row.querySelector('input'), out = row.querySelector('output');
  inp.addEventListener('input', () => { voice[k] = Number(inp.value); out.textContent = `${inp.value}${unit}`; });
  knobs.append(row);
}
$('reset').addEventListener('click', () => { Object.assign(voice, VOICE); knobs.querySelectorAll('input').forEach((inp, i) => { inp.value = voice[KNOBS[i][0]]; inp.dispatchEvent(new Event('input')); }); });

// ---- playing, and the spectrogram ------------------------------------------------------
let ctx = null, analyser = null, current = null;
function audioCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser(); analyser.fftSize = 1024; analyser.smoothingTimeConstant = 0;
    analyser.connect(ctx.destination);
  }
  ctx.resume();
  return ctx;
}
async function say(text, over = null) {
  await small;
  const c = audioCtx();                         // made in the tap, before any await that isn't instant
  const rate = 22050;
  const t0 = performance.now();
  const { audio, phonemes } = speak(text, lexicon, { rate, voice: over ? { ...voice, ...over } : voice });
  $('took').textContent = `${audio.length / rate < 10 ? (audio.length / rate).toFixed(1) : Math.round(audio.length / rate)} s of speech made in ${Math.round(performance.now() - t0)} ms`;
  $('phones').textContent = phonemes.filter((p) => !p.pause).map((p) => p.p + (p.stress > 0 ? 'ˈ'.repeat(p.stress === 1 ? 1 : 0) : '')).join(' ');
  if (current) try { current.stop(); } catch {}
  const buf = c.createBuffer(1, audio.length, rate); buf.copyToChannel(audio, 0);
  const src = c.createBufferSource(); src.buffer = buf; src.connect(analyser); src.start();
  current = src;
  lastWav = { audio, rate, text };
}
let lastWav = null;
$('download').addEventListener('click', async () => {
  if (!lastWav) return;
  const { wav } = await import('../lib/chipvoice.js');
  const url = URL.createObjectURL(new Blob([wav(lastWav.audio, lastWav.rate)], { type: 'audio/wav' }));
  const a = document.createElement('a'); a.href = url; a.download = `chipvoice-${lastWav.text.slice(0, 24).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.wav`; a.click();
});
// a scrolling spectrogram, 0–8 kHz, of whatever is playing
const sg = $('sg'), sgc = sg.getContext('2d');
function spectrogram() {
  requestAnimationFrame(spectrogram);
  if (!analyser) return;
  const W = sg.width, H = sg.height, bins = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(bins);
  sgc.drawImage(sg, -2, 0);
  const top = Math.floor((8000 / (ctx.sampleRate / 2)) * bins.length);
  for (let y = 0; y < H; y++) {
    const v = bins[Math.floor(((H - 1 - y) / H) * top)] / 255;
    sgc.fillStyle = `hsl(${280 - 250 * v}, 80%, ${8 + 62 * v}%)`;
    sgc.fillRect(W - 2, y, 2, 1);
  }
}
sgc.fillStyle = '#0b0b16'; sgc.fillRect(0, 0, sg.width, sg.height);
spectrogram();

// ---- the texts ------------------------------------------------------------------------------
$('paragraph').textContent = PARAGRAPH;
$('sayParagraph').addEventListener('click', () => say(PARAGRAPH));
// the first try at being 2c: everything measured from it, switched on (lib/chipvoice-profile.js)
$('sayFit2').addEventListener('click', () => { $('fit2Note').hidden = false; say(PARAGRAPH, { fit: 2 }); });
$('sayFit').addEventListener('click', () => { $('fitNote').hidden = false; say(PARAGRAPH, { fit: 1 }); });
$('sayAs2c').addEventListener('click', () => { $('as2cNote').hidden = false; say(PARAGRAPH, { profile: 3, f0: 120, range: 0.35 }); });
$('sayTyped').addEventListener('click', async () => { await small; await fullLexicon(); say($('typed').value); });
$('typed').addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) $('sayTyped').click(); });
fetch('./report.json').then((r) => r.json()).then((rep) => {
  $('score').innerHTML = `Whisper (${rep.judge.split(' (')[0]}) gets <b>${(100 - rep.paragraph.wer).toFixed(0)}%</b> of the paragraph's words and <b>${(100 - rep.harvard.wer).toFixed(0)}%</b> of the test sentences' (${rep.date}).`;
  const list = $('sentences');
  for (const s of rep.sentences.filter((s) => s.id[0] === 'h')) {
    const li = document.createElement('li');
    li.innerHTML = `<button type="button" aria-label="say it">▶</button><div><div class="said">${s.text}</div><div class="heard ${s.wer === 0 ? 'ok' : s.wer > 40 ? 'bad' : ''}">heard: “${s.heard}”</div></div>`;
    li.querySelector('button').addEventListener('click', () => say(s.text));
    list.append(li);
  }
}).catch(() => { $('score').textContent = ''; });
// the candidate reference voices, when a design run has made some (studio/tools/voice-ref.mjs)
fetch('./candidates/candidates.json').then((r) => (r.ok ? r.json() : null)).then((c) => {
  if (!c || !c.candidates?.length) return;
  $('audition').hidden = false;
  for (const k of c.candidates) {
    const li = document.createElement('li');
    li.innerHTML = `<div><span class="n">${k.n}</span><span class="d">${k.measured || ''}</span></div><div class="d">${k.description}</div><audio controls preload="none" src="./candidates/${k.n}.mp3"></audio>`;
    $('candidates').append(li);
  }
}).catch(() => {});
window.__voice = { say, voice, phonemize };
