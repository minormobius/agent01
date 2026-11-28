// The jams player (Modulo, 2026-10-13): one page for every form (track, wander) and genre
// (garden, jazz, electronica), heard as sound and readable as text while it plays.
// Tunes come from the Rust (score and wander wasm); core.js arranges them, the same file the
// /api/play/ route runs; the rack (Rust, in the audio thread) makes the sound.
import * as S from './score/wasm.js';
import * as WD from './rack/wander-wasm.js';
import * as R from './rack/wasm.js';
import * as G from './genre/genre.js';
import * as H from './handed.js';
import { jam, partsOf, KINDS, GENRES, FORMS, BPM, noteName } from './core.js';
const $ = id => document.getElementById(id);
const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
const hex = async b => [...new Uint8Array(await crypto.subtle.digest('SHA-256', b))].map(x => x.toString(16).padStart(2, '0')).join('');
const rackB = b64(R.WASM_B64), scoreB = b64(S.WASM_B64), wB = b64(WD.WASM_B64);
const ok = async (b, sha) => (await hex(b)) === sha ? sha.slice(0, 12) + '… matches' : 'DOES NOT MATCH';
$('sha').textContent = `rack ${await ok(rackB, R.WASM_SHA)} · score ${await ok(scoreB, S.WASM_SHA)} · wander ${await ok(wB, WD.WASM_SHA)}`;
const score = (await WebAssembly.instantiate(scoreB)).instance.exports, wnd = (await WebAssembly.instantiate(wB)).instance.exports;
const DEPS = {
  tune(seed) { const n = score.generate(seed >>> 0), m = new Uint8Array(score.memory.buffer, score.buf(), 2 * n); return Array.from({ length: n }, (_, i) => [m[2 * i] - 2, m[2 * i + 1]]); },
  walker(seed) { wnd.start(seed >>> 0); return { draw: n => wnd.draw(n), phrase() { const n = wnd.phrase(), m = new Uint8Array(wnd.memory.buffer, wnd.buf(), 9 + 2 * n);
    return { key: m[0] - 64, bass: [...m.slice(1, 9)].map(b => b - 16), notes: Array.from({ length: n }, (_, i) => [m[9 + 2 * i] - 16, m[10 + 2 * i]]) }; } }; },
  arrange: G.arrange, CHARTS: G.CHARTS, GPARTS: G.PARTS,
};

const Q = new URLSearchParams(location.search);
let form = FORMS.includes(Q.get('form')) ? Q.get('form') : 'track', genre = GENRES.includes(Q.get('genre')) ? Q.get('genre') : 'garden';
if (+Q.get('seed') > 0) $('seed').value = +Q.get('seed');
// The page's own address carries the whole performance: anything not at its default (tempo, swing,
// drift, a part's instrument) goes in it, so two listeners with one link hear one performance.
let first = true;
if (Q.has('ride')) { const r = +Q.get('ride'); if (r >= 1 && r <= 3.5) { $('ride').value = r; $('rv').textContent = r.toFixed(2); } }
if (Q.get('drift') === '0') $('drift').checked = false;
const hz = m => 440 * 2 ** ((m - 69) / 12);
function drawParts(keep) {
  const old = {}; if (keep) for (const s of document.querySelectorAll('#parts select')) old[s.dataset.part] = s.value;
  $('parts').innerHTML = '';
  for (const [name, p] of Object.entries(partsOf(genre, DEPS))) {
    const row = document.createElement('label'); row.className = 'part';
    row.innerHTML = `<span>${name}</span><select data-part="${name}" id="p-${name}"><option value="-1">off</option>${KINDS.map((k, i) => `<option value="${i}"${i === p.kind ? ' selected' : ''}>${k}</option>`).join('')}</select>`;
    $('parts').appendChild(row);
    const q = first && Q.get(name); if (!keep && q) { const i = KINDS.indexOf(q); if (q === 'off') row.lastChild.value = -1; else if (i >= 0) row.lastChild.value = i; }
  }
  for (const b of document.querySelectorAll('[data-form]')) b.setAttribute('aria-pressed', b.dataset.form === form);
  for (const b of document.querySelectorAll('[data-genre]')) b.setAttribute('aria-pressed', b.dataset.genre === genre);
  $('swingrow').hidden = genre !== 'jazz'; $('driftrow').hidden = form !== 'wander';
  const t = first && +Q.get('tempo'); $('tempo').value = t >= 60 && t <= 200 ? t : BPM[genre]; $('bpm').textContent = $('tempo').value;
  first = false; links();
}
const picks = () => { const p = {}; for (const s of document.querySelectorAll('#parts select')) p[s.dataset.part] = +s.value; return p; };
function query(from) {
  const P = partsOf(genre, DEPS), pk = picks(), q = [];
  if (form === 'wander') { q.push(`from=${from}`, 'n=4'); if (!$('drift').checked) q.push('drift=0'); }
  if (genre === 'jazz' && +$('ride').value !== 2.5) q.push('ride=' + $('ride').value);
  for (const k in P) if (pk[k] !== P[k].kind) q.push(`${k}=${pk[k] < 0 ? 'off' : KINDS[pk[k]]}`);
  return q.length ? '?' + q.join('&') : '';
}
function links(from = 0) {
  const seed = +$('seed').value || 1, base = `/api/play/${form}/${genre}/${seed}`, q = query(from), amp = q ? '&' : '?';
  $('api-json').href = base + q; $('api-json').textContent = base + q;
  $('api-abc').href = base + q + amp + 'format=abc'; $('api-text').href = base + q + amp + 'format=text';
  const extra = query(0).replace(/^\?/, '').split('&').filter(x => x && !/^(from|n)=/.test(x));
  if (+$('tempo').value !== BPM[genre]) extra.unshift('tempo=' + $('tempo').value);
  history.replaceState(null, '', `?form=${form}&genre=${genre}&seed=${seed}` + extra.map(x => '&' + x).join(''));
}
for (const b of document.querySelectorAll('[data-form]')) b.onclick = () => { form = b.dataset.form; drawParts(true); if (ac) play(); };
for (const b of document.querySelectorAll('[data-genre]')) b.onclick = () => { genre = b.dataset.genre; drawParts(false); if (ac) play(); };
$('tempo').oninput = () => { $('bpm').textContent = $('tempo').value; links(); };
$('ride').oninput = () => { $('rv').textContent = (+$('ride').value).toFixed(2); links(); };
$('seed').onchange = () => links(); $('drift').onchange = () => links(); $('parts').onchange = () => links();

let ac, node, J = null, at0 = 0, spb = 0, queued = [], shown = 0, log = [];
async function boot() {
  ac = new AudioContext(); ac.resume(); // inside the tap, before any await, or phones stay muted
  await ac.audioWorklet.addModule('./rack/worklet.js');
  node = new AudioWorkletNode(ac, 'rack', { outputChannelCount: [2] }); node.connect(ac.destination);
  await new Promise(ok => { node.port.onmessage = ({ data }) => data.ready && ok(); node.port.postMessage({ wasm: rackB.buffer.slice(0) }); });
  node.port.onmessage = ({ data }) => heard(data);
}
// One phrase into worklet events: [sample, kind, hz, gain, length, part]
function phraseEvents(p) {
  const ev = p.notes.map(e => [at0 + Math.round(e.t * spb), e.kind, hz(e.m), e.g, Math.max(1, Math.round(e.d * spb)), e.part]);
  queued.push({ start: at0, end: at0 + Math.round(32 * spb), p, ev }); at0 += Math.round(32 * spb); return ev;
}
async function play() {
  if (!ac) await boot(); await ac.resume();
  const seed = +$('seed').value || 1, bpm = +$('tempo').value;
  spb = 60 / bpm * ac.sampleRate; at0 = Math.round(0.08 * ac.sampleRate); queued = []; shown = 0; log = [];
  J = jam({ form, genre, seed, drift: $('drift').checked, ride: genre === 'jazz' ? +$('ride').value : undefined, picks: picks() }, DEPS);
  const ev = phraseEvents(J.next()); if (form === 'wander') ev.push(...phraseEvents(J.next()));
  links();
  node.port.postMessage({ events: H.start({ name: `${form}-${genre}-seed${seed}`, form, genre, seed, bpm, sampleRate: ac.sampleRate, ride: genre === 'jazz' ? +$('ride').value : null,
    drift: form === 'wander' ? $('drift').checked : null, rack_sha: R.WASM_SHA, score_sha: S.WASM_SHA, wander_sha: WD.WASM_SHA,
    api: location.origin + $('api-json').getAttribute('href'), note: form === 'wander' ? 'grows a phrase at a time while it plays; download again for more' : undefined }, ev) });
}
// The worklet reports its clock about six times a second: queue more wander, and write what's sounding as text.
function heard(d) {
  if (!J) return;
  const now = d.at * ac.sampleRate;
  if (form === 'wander' && now > at0 - 8 * ac.sampleRate) { const p = J.next(); if (p) node.port.postMessage({ more: H.more(phraseEvents(p)) }); }
  const cur = queued.find(q => now >= q.start && now < q.end);
  if (cur) {
    const p = cur.p, bar = Math.min(8, 1 + Math.floor((now - cur.start) / spb / 4));
    const ch = p.chords ? p.chords.split(' | ')[bar - 1] : null;
    $('now').innerHTML = `${form === 'wander' ? `phrase ${p.index}` : 'track'} · <b>${p.keyName}</b> · bar ${bar} of 8${ch ? ` · chord <b>${ch}</b>` : ''}`;
    if (form === 'wander') $('inst').textContent = Object.entries(p.picks).map(([k, v]) => `${k} ${v}`).join(' · ');
  }
  // notes whose start has passed since the last report, as names; melody first, drums counted
  for (const q of queued) for (const e of q.ev) if (e[0] > shown && e[0] <= now) {
    const part = e[5]; if (part === 'beat' || part === 'kick' || part === 'ride') continue;
    log.push(`${((e[0]) / ac.sampleRate).toFixed(2).padStart(7)} s  ${part.padEnd(7)} ${KINDS[e[1]].padEnd(8)} ${noteName(69 + 12 * Math.log2(e[2] / 440), q.p.key)}`);
  }
  shown = now; if (log.length > 14) log = log.slice(-14);
  $('log').textContent = log.join('\n') || ' ';
  $('meter').textContent = `${d.at.toFixed(1)} s · voices ${d.sounding}, most at once ${d.peak} of 192` + (d.drop ? ` · ${d.drop} dropped (pool full)` : '') + (d.done ? ' · done' : '');
  while (queued.length > 3 && queued[0].end < now) queued.shift();
}
$('play').onclick = play;
$('stop').onclick = () => { J = null; node && node.port.postMessage({ stop: true }); };
drawParts(false);
