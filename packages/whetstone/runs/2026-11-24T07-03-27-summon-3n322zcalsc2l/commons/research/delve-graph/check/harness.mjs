// Runs www/delve-graph's script against stub DOM/canvas; reports layout health and fake click results.
import { readFileSync } from 'node:fs';
const root = new URL('../../../', import.meta.url);
const src = readFileSync(new URL('www/delve-graph/index.html', root), 'utf8').split('<script>')[1].split('</script>')[0];
const data = JSON.parse(readFileSync(new URL('www/delve-graph/data.json', root), 'utf8'));
const els = {}; const handlers = {};
const ctxCalls = { arc: 0, fillText: 0, stroke: 0 };
let lastArcs = [];
const ctxBase = { arc: (x, y, r) => { ctxCalls.arc++; lastArcs.push([x, y, r]); if (lastArcs.length > 400) lastArcs.shift(); } };
const ctx = new Proxy(ctxBase, { get: (t, k) => (k in t ? t[k] : (typeof k === 'string' && k in ctxCalls ? () => ctxCalls[k]++ : () => {})), set: (t, k, v) => ((t[k] = v), true) });
function el(id) {
  if (!els[id]) {
    const defaults = { colour: 'comm', edgemode: 'mutual', sizeby: 'in', charge: '120', len: '55', k: '25', g: '12' };
    els[id] = { id, value: defaults[id] ?? '', checked: true, style: {}, children: [], className: '', textContent: '', innerHTML: '',
      classList: { add() {}, remove() {} }, appendChild(c) { this.children.push(c); }, getContext: () => ctx, setPointerCapture() {},
      addEventListener(ev, f) { handlers[ev] = f; } };
  }
  return els[id];
}
globalThis.document = { getElementById: el, createElement: () => ({ style: {}, innerHTML: '', lastChild: {}, }) };
globalThis.window = { devicePixelRatio: 1 }; globalThis.innerWidth = 1600; globalThis.innerHeight = 1000;
globalThis.addEventListener = () => {};
let frames = 0; globalThis.requestAnimationFrame = (f) => { if (frames++ < 400) setImmediate(f); };
globalThis.fetch = async () => ({ json: async () => data });
await (0, eval)(src);
await new Promise((r) => setTimeout(r, 1500));
console.log('counts:', el('counts').textContent, '| frames', frames, '| arcs drawn', ctxCalls.arc, '| labels', ctxCalls.fillText);
const pts = lastArcs.slice(-172).map(([x, y]) => [x, y]);
const bad = pts.filter(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)).length;
const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
let minD = 1e9; for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) minD = Math.min(minD, Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]));
const sorted = (a) => a.slice().sort((p, q) => p - q);
console.log('non-finite:', bad, '| x span', Math.round(Math.min(...xs)), Math.round(Math.max(...xs)), '| y span', Math.round(Math.min(...ys)), Math.round(Math.max(...ys)), '| min pair dist', minD.toFixed(1), '| median |x|', Math.round(sorted(xs.map(Math.abs))[86]));
console.log('legend rows:', el('legend').children.length);
// click the seed node: canvas centre-ish? Use handler with world->screen not exposed; instead pick by scanning
let hit = 0; for (let x = 0; x < 1600 && !hit; x += 4) for (let y = 0; y < 1000 && !hit; y += 4) { handlers.pointerdown({ clientX: x, clientY: y, pointerId: 1 }); handlers.pointerup({ clientX: x, clientY: y }); if (el('info').innerHTML.includes('<b>')) hit = 1; }
console.log('click info:', el('info').innerHTML.replace(/<[^>]+>/g, ' ').slice(0, 200));
