import { WASM_B64, WASM_SHA } from './wasm.js';
const $ = id => document.getElementById(id);
const bytes = Uint8Array.from(atob(WASM_B64), c => c.charCodeAt(0));
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const got = hex(await crypto.subtle.digest('SHA-256', bytes));
$('sha').textContent = got + (got === WASM_SHA ? ' (matches)' : ' (DOES NOT MATCH ' + WASM_SHA + ')');
$('bytes').textContent = bytes.length;
const { instance } = await WebAssembly.instantiate(bytes);
const W = instance.exports;

const SCALE = [0, 2, 4, 5, 7, 9, 11];
const midi = d => 60 + 12 * Math.floor(d / 7) + SCALE[((d % 7) + 7) % 7];
const NAMES = 'CDEFGAB';
const name = d => NAMES[((d % 7) + 7) % 7] + (4 + Math.floor(d / 7));

let notes = [];
function write(seed) {
  const n = W.generate(seed >>> 0);
  const m = new Uint8Array(W.memory.buffer, W.buf(), 2 * n);
  notes = [];
  for (let i = 0; i < n; i++) notes.push({ d: m[2 * i] - 2, len: m[2 * i + 1] });
  // Morphyx: the A/B meitan asked for. Bars 1-3 and 5-8 stay exactly as Rust wrote them;
  // only the note before bar 4's G changes, to F or A, whichever is nearer the note before it.
  let swap = '';
  if ($('step').checked) {
    let t = 0, gi = 0; while (t < 28) t += notes[gi++].len; // gi = the G on beat 3 of bar 4
    const a = notes[gi - 1], prev = notes[gi - 2].d;
    if (Math.abs(a.d - 4) > 1) {
      // Modulo: the nearer of F and A, unless it would copy the note before it; then the other
      // (a third away, never a leap), so the box doesn't add a repeated note (meitan's point).
      let to = Math.abs(5 - prev) < Math.abs(3 - prev) ? 5 : 3;
      if (to === prev) to = 8 - to;
      swap = ' Stepping into the G: ' + name(a.d) + ' became ' + name(to) + ' (the note in blue).';
      a.d = to; a.changed = true;
    } else swap = ' This seed already ' + (a.d === 4 ? 'repeats' : 'steps into') + ' the G, so nothing changed.';
  }
  draw();
  history.replaceState(null, '', '?seed=' + seed);
  $('status').innerHTML = '<small>seed ' + seed + ': ' + n + ' notes, ' +
    notes.reduce((a, x) => a + x.len, 0) / 8 + ' bars. ' + notes.map(x => name(x.d)).join(' ') + '.' + swap + '</small>';
}

const NS = 'http://www.w3.org/2000/svg';
const el = (t, a, p) => { const e = document.createElementNS(NS, t); for (const k in a) e.setAttribute(k, a[k]); p && p.appendChild(e); return e; };
function draw() {
  const H = 8, perRow = 4, barW = 190, left = 70;
  const rows = Math.ceil(notes.reduce((a, x) => a + x.len, 0) / 8 / perRow);
  const rowH = 120, top = 40;
  const svg = el('svg', { viewBox: `0 0 ${left + perRow * barW + 10} ${rows * rowH + 20}` });
  for (let r = 0; r < rows; r++) {
    const y0 = top + r * rowH; // top line
    for (let l = 0; l < 5; l++) el('line', { x1: 10, x2: left + perRow * barW, y1: y0 + l * H * 2, y2: y0 + l * H * 2, stroke: '#000', 'stroke-width': 1 }, svg);
    const c = el('text', { x: 12, y: y0 + 4 * H * 2 + 10, 'font-size': 72, 'font-family': 'Bravura, "Noto Music", "Apple Symbols", "Segoe UI Symbol", Symbola, serif' }, svg); c.textContent = '\u{1D11E}';
    if (r === 0) { for (const [t, dy] of [['4', 2 * H * 2 - 2], ['4', 4 * H * 2 - 2]]) { const e = el('text', { x: 50, y: y0 + dy, 'font-size': 22, 'font-weight': 'bold' }, svg); e.textContent = t; } }
    for (let b = 1; b <= perRow; b++) el('line', { x1: left + b * barW, x2: left + b * barW, y1: y0, y2: y0 + 8 * H, stroke: '#000', 'stroke-width': b === perRow && r === rows - 1 ? 4 : 1 }, svg);
  }
  let t = 0;
  notes.forEach((n, i) => {
    const bar = Math.floor(t / 8), r = Math.floor(bar / perRow);
    const x = left + (bar % perRow) * barW + 22 + (t % 8) * (barW - 30) / 8;
    const bottom = top + r * rowH + 8 * H;      // E4 line
    const pos = n.d - 2;                         // half-spaces above E4
    const y = bottom - pos * H;
    for (let p = -2; p >= pos; p -= 2) el('line', { x1: x - 11, x2: x + 11, y1: bottom - p * H, y2: bottom - p * H, stroke: '#000' }, svg);
    for (let p = 10; p <= pos; p += 2) el('line', { x1: x - 11, x2: x + 11, y1: bottom - p * H, y2: bottom - p * H, stroke: '#000' }, svg);
    const g = el('g', n.changed ? { fill: '#2457c5', color: '#2457c5' } : {}, svg); n.g = g;
    const open = n.len >= 4;
    el('ellipse', { cx: x, cy: y, rx: 7.5, ry: 5.5, transform: `rotate(-20 ${x} ${y})`, fill: open ? '#fff' : 'currentColor', stroke: 'currentColor', 'stroke-width': open ? 2 : 1 }, g);
    if (n.len === 3 || n.len === 6) el('circle', { cx: x + 13, cy: pos % 2 === 0 ? y - H : y, r: 2.2, fill: 'currentColor' }, g);
    if (n.len < 8) {
      const up = pos < 4, sx = up ? x + 7 : x - 7, sy = up ? y - 50 : y + 50;
      el('line', { x1: sx, x2: sx, y1: y, y2: sy, stroke: 'currentColor', 'stroke-width': 1.5 }, g);
      if (n.len === 1) el('path', { d: up ? `M${sx} ${sy} q 4 14 12 22` : `M${sx} ${sy} q 4 -14 12 -22`, fill: 'none', stroke: 'currentColor', 'stroke-width': 2 }, g);
    }
    t += n.len;
  });
  $('staff').replaceChildren(svg);
}

let ac, playing = [];
function play() {
  ac = ac || new AudioContext();
  playing.forEach(clearTimeout); playing = [];
  const e8 = 30 / +$('tempo').value; // seconds per eighth
  let t = ac.currentTime + 0.1, wall = 100;
  for (const n of notes) {
    const f = 440 * 2 ** ((midi(n.d) - 69) / 12), dur = n.len * e8;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.3, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.95);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur);
    playing.push(setTimeout(() => { notes.forEach(m => m.g.removeAttribute('class')); n.g.setAttribute('class', 'on'); }, wall));
    t += dur; wall += dur * 1000;
  }
  playing.push(setTimeout(() => notes.forEach(m => m.g.removeAttribute('class')), wall));
}

const q = +new URLSearchParams(location.search).get('seed');
if (q > 0) $('seed').value = q;
$('gen').onclick = () => write(+$('seed').value || 1);
$('next').onclick = () => { $('seed').value = (+$('seed').value || 0) + 1; write(+$('seed').value); };
$('play').onclick = play;
$('step').onchange = () => write(+$('seed').value || 1);
$('tempo').oninput = () => $('bpm').textContent = $('tempo').value;
write(+$('seed').value || 1);
