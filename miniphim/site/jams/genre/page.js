// Modulo, 2026-10-13. The page: the score's wasm writes the tune, genre.js arranges it,
// and the rack's own worklet and wasm (unchanged, from ../rack/) make the sound.
import * as S from '../score/wasm.js';
import * as R from '../rack/wasm.js';
import * as G from './genre.js';
import * as H from '../handed.js';
const $ = id => document.getElementById(id);
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
const rackBytes = b64(R.WASM_B64), scoreBytes = b64(S.WASM_B64);
$('sha').textContent = `rack ${(await hex(rackBytes)) === R.WASM_SHA ? R.WASM_SHA.slice(0, 12) + '… matches' : 'DOES NOT MATCH'}, score ${(await hex(scoreBytes)) === S.WASM_SHA ? S.WASM_SHA.slice(0, 12) + '… matches' : 'DOES NOT MATCH'}`;
const score = (await WebAssembly.instantiate(scoreBytes)).instance.exports;
const KINDS = ['organ', 'pluck', 'bell', 'reed', 'kick', 'strings'];
const hz = m => 440 * 2 ** ((m - 69) / 12);
let style = 'jazz', ac, node;
const Q = new URLSearchParams(location.search);
if (Q.get('style') in G.PARTS) style = Q.get('style');
if (+Q.get('seed') > 0) $('seed').value = +Q.get('seed');
function drawParts() {
  $('parts').innerHTML = '';
  for (const [name, p] of Object.entries(G.PARTS[style])) {
    const row = document.createElement('label'); row.className = 'part';
    row.innerHTML = `<span>${name}</span><select id="p-${name}"><option value="-1">off</option>${KINDS.map((k, i) => `<option value="${i}"${i === p.kind ? ' selected' : ''}>${k}</option>`).join('')}</select>`;
    $('parts').appendChild(row);
  }
  for (const b of document.querySelectorAll('[data-style]')) b.setAttribute('aria-pressed', b.dataset.style === style);
  $('swingrow').style.display = style === 'jazz' ? '' : 'none';
  $('tempo').value = G.DEFAULT_BPM[style]; $('bpm').textContent = $('tempo').value;
}
for (const b of document.querySelectorAll('[data-style]')) b.onclick = () => { style = b.dataset.style; drawParts(); play(); };
$('tempo').oninput = () => $('bpm').textContent = $('tempo').value;
$('ride').oninput = () => { const r = +$('ride').value; $('rv').textContent = r.toFixed(2); $('sv').textContent = (1 + 0.5 * (r - 1)).toFixed(2); };
async function play() {
  if (!ac) {
    ac = new AudioContext(); ac.resume(); // inside the tap, before any await, or phones stay muted
    await ac.audioWorklet.addModule('../rack/worklet.js');
    node = new AudioWorkletNode(ac, 'rack', { outputChannelCount: [2] }); node.connect(ac.destination);
    await new Promise(ok => { node.port.onmessage = ({ data }) => data.ready && ok(); node.port.postMessage({ wasm: rackBytes.buffer.slice(0) }); });
    node.port.onmessage = ({ data }) => { $('meter').textContent = `${data.at.toFixed(1)} s · voices ${data.sounding}, most at once ${data.peak} of 192` + (data.drop ? ` · ${data.drop} dropped` : '') + (data.done ? ' · done' : ''); };
  }
  await ac.resume();
  const seed = +$('seed').value || 1, bpm = +$('tempo').value, spb = 60 / bpm * ac.sampleRate, parts = G.PARTS[style];
  const T = G.tuneFrom(score, seed), ev = [];
  for (const e of G.arrange(style, T, seed, { ride: +$('ride').value })) {
    const kind = +$('p-' + e.part).value; if (kind < 0) continue;
    ev.push([Math.round(e.t * spb + 0.05 * ac.sampleRate), kind, hz(e.m), parts[e.part].gain * e.g, Math.round(e.d * spb), e.part]);
  }
  ev.sort((a, b) => a[0] - b[0]);
  history.replaceState(null, '', `?style=${style}&seed=${seed}`);
  $('api').textContent = $('api').href = `/api/jams/genre/${style}/${seed}` + (style === 'jazz' ? `?ride=${$('ride').value}` : '');
  $('tune').innerHTML = `${style}, seed ${seed}: ${ev.length} notes. The melody is <a href="../score/?seed=${seed}">/score/?seed=${seed}</a>; <a href="../rack/?seed=${seed}">the rack</a> plays it as written.`;
  node.port.postMessage({ events: H.start({ name: `${style}-seed${seed}`, style, seed, bpm, ride: style === 'jazz' ? +$('ride').value : null, sampleRate: ac.sampleRate, rack_sha: R.WASM_SHA, score_sha: S.WASM_SHA }, ev) });
}
$('play').onclick = play;
$('stop').onclick = () => node && node.port.postMessage({ stop: true });
drawParts();
