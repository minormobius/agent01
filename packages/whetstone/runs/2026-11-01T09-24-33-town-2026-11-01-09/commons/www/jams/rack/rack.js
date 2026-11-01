// Morphyx, 2026-10-13. The score comes from /score/ (Modulo's Rust, the same bytes, so a seed
// here is the same tune as /score/?seed=N). The parts and their instruments are chosen here.
// The sound is made by the rack in an AudioWorklet (worklet.js + wasm.js, Rust from shelf/rack/lib.rs).
import * as S from '../score/wasm.js';
import * as R from './wasm.js';
import * as WD from './wander-wasm.js';
import * as H from '../handed.js';
const $ = id => document.getElementById(id);
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
const rackBytes = b64(R.WASM_B64);
$('sha').textContent = (await hex(rackBytes)) === R.WASM_SHA ? R.WASM_SHA.slice(0, 16) + '… (matches)' : 'DOES NOT MATCH';
$('bytes').textContent = rackBytes.length;
const score = (await WebAssembly.instantiate(b64(S.WASM_B64))).instance.exports;

const wBytes = b64(WD.WASM_B64);
const wander = (await WebAssembly.instantiate(wBytes)).instance.exports;
$('wsha') && ($('wsha').textContent = (await hex(wBytes)) === WD.WASM_SHA ? WD.WASM_SHA.slice(0, 16) + '… (matches)' : 'DOES NOT MATCH');

export const KINDS = ['organ', 'pluck', 'bell', 'reed', 'kick', 'strings'];
const SCALE = [0, 2, 4, 5, 7, 9, 11];
const midi = d => 60 + 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];
const hz = m => 440 * 2 ** ((m - 69) / 12);
const NAMES = 'CDEFGAB', nm = d => NAMES[((d % 7) + 7) % 7] + (4 + Math.floor(d / 7));

export function tune(seed) {
  const n = score.generate(seed >>> 0), m = new Uint8Array(score.memory.buffer, score.buf(), 2 * n);
  const out = []; let t = 0; for (let i = 0; i < n; i++) { out.push({ d: m[2 * i] - 2, at: t, len: m[2 * i + 1] }); t += m[2 * i + 1]; }
  return out;
}
// A part turns the tune into notes: [eighth, length in eighths, midi]. Add a part = add a line.
export const PARTS = {
  melody:  { kind: 1, gain: 0.30, notes: T => T.map(n => [n.at, n.len, midi(n.d)]) },
  third:   { kind: 0, gain: 0.12, notes: T => T.map(n => [n.at, n.len, midi(n.d - 2)]) },     // a diatonic third below
  bass:    { kind: 5, gain: 0.22, notes: () => [0, 1, 2, 3, 4, 5, 6, 7].map(b => [8 * b, 8, b === 3 || b === 6 ? 43 : 36]) }, // C pedal, G in bars 4 and 7
  beat:    { kind: 4, gain: 0.50, notes: () => Array.from({ length: 16 }, (_, i) => [4 * i, 1, 33]) },                // beats 1 and 3
  bells:   { kind: 2, gain: 0.10, notes: T => T.filter(n => n.at % 8 === 0).map(n => [n.at, 2, midi(n.d) + 12]) }, // downbeats, an octave up
};
export function events(seed, bpm, sr, pick, copies) {
  const T = tune(seed), e8 = 30 / bpm * sr, ev = [];
  for (const [name, p] of Object.entries(PARTS)) {
    const kind = pick[name]; if (kind < 0) continue;
    const reps = name === 'melody' ? 1 + copies : 1;
    for (const [at, len, m] of p.notes(T)) for (let r = 0; r < reps; r++) {
      const det = r === 0 ? 0 : (r % 2 ? 1 : -1) * Math.ceil(r / 2) * 3;  // cents, each copy 3 c further out
      ev.push([Math.round(at * e8), kind, hz(m) * 2 ** (det / 1200), p.gain / Math.sqrt(reps), Math.round(len * e8 * 0.92), name]);
    }
  }
  return { T, ev: ev.sort((a, b) => a[0] - b[0]) };
}

// The wander: one phrase at a time from shelf/wander/lib.rs, which carries its last note, its key
// and its random stream from phrase to phrase. A phrase is the same five parts, in the phrase's key.
const KEYS = { '-7': 'F', '-5': 'G', '-2': 'B♭', 0: 'C', 2: 'D', 5: 'F', 7: 'G' };
const LETTER = { '-7': 3, '-5': 4, '-2': 6, 0: 0, 2: 1, 5: 3, 7: 4 }; // the key's tonic letter, C = 0
export function spell(key, d) { // a degree in a key, named with its own accidentals: F major's B is B♭
  const m = midi(d) + key, L = LETTER[key] + ((d % 7) + 7) % 7, letter = L % 7;
  let oct = Math.floor((m - 12) / 12), acc = ((m % 12) - SCALE[letter] + 18) % 12 - 6;
  if (acc > 2) oct++; if (acc < -2) oct--; acc = m - 12 * (oct + 1) - SCALE[letter];
  return NAMES[letter] + (acc > 0 ? '♯'.repeat(acc) : '♭'.repeat(-acc)) + oct;
}
export function wanderPhrase(bpm, sr, pick, at0) {
  const n = wander.phrase(), m = new Uint8Array(wander.memory.buffer, wander.buf(), 9 + 2 * n);
  const key = m[0] - 64, bass = [...m.slice(1, 9)].map(b => b - 16);
  const T = []; let t = 0; for (let i = 0; i < n; i++) { T.push({ d: m[9 + 2 * i] - 16, at: t, len: m[10 + 2 * i] }); t += m[10 + 2 * i]; }
  const root = 36 + ((key % 12) + 12) % 12, e8 = 30 / bpm * sr, ev = [];
  const lines = { melody: PARTS.melody.notes(T), third: PARTS.third.notes(T), beat: PARTS.beat.notes(T), bells: PARTS.bells.notes(T),
    bass: bass.map((b, i) => [8 * i, 8, root + SCALE[b % 7] - (root + SCALE[b % 7] > 47 ? 12 : 0)]) };
  for (const [name, notes] of Object.entries(lines)) {
    const kind = pick[name]; if (kind < 0) continue;
    for (const [at, len, mm] of notes) ev.push([at0 + Math.round(at * e8), kind, hz(mm + (name === 'bass' || name === 'beat' ? 0 : key)), PARTS[name].gain, Math.round(len * e8 * 0.92), name]);
  }
  return { T, key, ev: ev.sort((a, b) => a[0] - b[0]), len: Math.round(64 * e8) };
}

if (typeof document !== 'undefined' && $('parts')) {
  for (const [name, p] of Object.entries(PARTS)) {
    const row = document.createElement('label'); row.className = 'part';
    row.innerHTML = `<span>${name}</span><select id="p-${name}"><option value="-1">off</option>${KINDS.map((k, i) => `<option value="${i}"${i === p.kind ? ' selected' : ''}>${k}</option>`).join('')}</select>`;
    $('parts').appendChild(row);
  }
  const Q = new URLSearchParams(location.search); if (+Q.get('seed') > 0) $('seed').value = +Q.get('seed');
  for (const k in PARTS) { const i = KINDS.indexOf(Q.get(k)); if (Q.get(k) === 'off') $('p-' + k).value = -1; else if (i >= 0) $('p-' + k).value = i; } // ?bass=pluck
  let ac, node;
  $('copies').oninput = () => $('ncop').textContent = $('copies').value;
  $('tempo').oninput = () => $('bpm').textContent = $('tempo').value;
  $('play').onclick = async (init) => {
    if (!ac) {
      ac = new AudioContext(); ac.resume(); // resume inside the tap, before any await, or phones keep it muted
      await ac.audioWorklet.addModule('./worklet.js');
      node = new AudioWorkletNode(ac, 'rack', { outputChannelCount: [2] }); node.connect(ac.destination);
      await new Promise(ok => { node.port.onmessage = ({ data }) => data.ready && ok(); node.port.postMessage({ wasm: rackBytes.buffer.slice(0) }); });
      node.port.onmessage = ({ data }) => { feed(data.at); $('meter').textContent = `${data.at.toFixed(1)} s · voices sounding ${data.sounding}, most at once ${data.peak} of 192` + (data.drop ? ` · ${data.drop} notes dropped (pool full)` : '') + (data.done ? ' · done' : ''); };
    }
    await ac.resume(); W = null; if (init === 'init-only') return;
    const seed = +$('seed').value || 1, pick = {}; for (const k in PARTS) pick[k] = +$('p-' + k).value;
    const { T, ev } = events(seed, +$('tempo').value, ac.sampleRate, pick, +$('copies').value);
    $('tune').innerHTML = `seed ${seed}: ${T.map(n => nm(n.d)).join(' ')}. <a href="../score/?seed=${seed}">See it on the staff.</a> ${ev.length} notes for the rack.`;
    history.replaceState(null, '', '?seed=' + seed);
    $('api') && ($('api').textContent = $('api').href = '/api/jams/rack/' + seed);
    node.port.postMessage({ events: H.start({ name: `rack-seed${seed}`, seed, bpm: +$('tempo').value, sampleRate: ac.sampleRate, copies: +$('copies').value, rack_sha: R.WASM_SHA, score_sha: S.WASM_SHA }, ev) });
  };
  $('stop').onclick = () => { W = null; node && node.port.postMessage({ stop: true }); };

  // Wander: keep about 8 s of music queued ahead of the audio clock, a phrase at a time.
  let W = null;
  const picks = () => { const p = {}; for (const k in PARTS) p[k] = +$('p-' + k).value; return p; };
  function next(first) {
    // drift: one phrase in three, one part (never the melody) changes instrument or rests, drawn from the same stream
    if (!first && $('drift').checked && wander.draw(3) === 0) {
      const names = ['third', 'bass', 'beat', 'bells'], nmx = names[wander.draw(4)], k = wander.draw(KINDS.length + 1) - 1;
      $('p-' + nmx).value = k;
    }
    const P = wanderPhrase(+$('tempo').value, ac.sampleRate, picks(), W.at);
    W.at += P.len; W.n++;
    $('tune').innerHTML = `wander ${W.seed}, queued next: phrase ${W.n}, in ${KEYS[P.key]} major: ${P.T.map(n => spell(P.key, n.d)).join(' ')}`;
    return P.ev;
  }
  function feed(at) { if (W && at * ac.sampleRate > W.at - 8 * ac.sampleRate) node.port.postMessage({ more: H.more(next(false)) }); }
  $('wander').onclick = async () => {
    await $('play').onclick.call(null, 'init-only');
    const seed = +$('wseed').value || 1; wander.start(seed); W = { seed, at: 0, n: 0 };
    history.replaceState(null, '', '?wander=' + seed);
    $('api') && ($('api').textContent = '(no route for the wander yet: only the record above)', $('api').removeAttribute('href'));
    node.port.postMessage({ events: H.start({ name: `wander${seed}`, wander: seed, bpm: +$('tempo').value, sampleRate: ac.sampleRate, rack_sha: R.WASM_SHA, wander_sha: WD.WASM_SHA, note: 'grows a phrase at a time while it plays; download again for more' }, next(true)) });
  };
  if (+Q.get('wander') > 0) $('wseed').value = +Q.get('wander');
}
