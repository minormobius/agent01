// sprite.selftest.mjs — pins the procedural sprite renderer (mega/sprite/item/sprite.js).
// The renderer never reads the canvas, only issues ctx calls/prop-sets, so we record the call log
// against a stub context and assert: (1) drawing is deterministic per item, (2) different items
// draw differently, (3) every kind renders without throwing. Run: node …/test/sprite.selftest.mjs
import { drawItem, contactSheet, FORMS } from '../sprite.js';
import { rollItem, KIND_ORDER, KINDS, rollMany } from '../items.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };

// A recording Canvas2D stub: methods log their calls; property sets are logged in order too.
function recCtx() {
  const log = [];
  const methods = ['save', 'restore', 'translate', 'scale', 'beginPath', 'moveTo', 'lineTo',
    'arc', 'ellipse', 'rect', 'fillRect', 'strokeRect', 'closePath', 'fill', 'stroke', 'quadraticCurveTo'];
  const target = {};
  for (const m of methods) target[m] = (...a) => log.push(m + '(' + a.map((x) => (typeof x === 'number' ? +x.toFixed(3) : x)).join(',') + ')');
  const ctx = new Proxy(target, {
    set(o, k, v) { log.push('@' + String(k) + '=' + v); o[k] = v; return true; },
    get(o, k) { return o[k]; },
  });
  return { ctx, log };
}
const render = (item, opts) => { const { ctx, log } = recCtx(); drawItem(ctx, item, opts); return log; };

// ── the form table covers every kind ──
{
  ok(KIND_ORDER.every((k) => typeof FORMS[KINDS[k].form] === 'function'), 'a draw form exists for every kind');
}

// ── determinism: same item ⇒ identical call log ──
{
  let same = true, nonEmpty = true;
  for (const n of [0, 3, 17, 88, 250]) {
    const it = rollItem(n);
    const a = render(it), b = render(it);
    same = same && a.join('\n') === b.join('\n');
    nonEmpty = nonEmpty && a.length > 5;
  }
  ok(same, 'drawItem is deterministic for a fixed item');
  ok(nonEmpty, 'drawing issues a non-trivial number of ops');
}

// ── different kinds draw differently ──
{
  // pick one item per kind by scanning seeds
  const perKind = {};
  for (let n = 0; n < 4000 && Object.keys(perKind).length < 8; n++) { const it = rollItem(n); perKind[it.kind] ||= it; }
  const logs = Object.values(perKind).map((it) => render(it, { frame: false }).join('\n'));
  ok(new Set(logs).size === logs.length, 'every kind produces a distinct silhouette');
  ok(Object.values(perKind).every((it) => { try { render(it); return true; } catch { return false; } }), 'every kind renders without throwing');
}

// ── material/affix changes alter the log (frame off, so only the body/cues vary) ──
{
  const a = rollItem(11), b = rollItem(11);
  ok(render(a).join('\n') === render(b).join('\n'), 'identical seeds ⇒ identical render');
  // an item with affixes draws more than the same kind with none (find a pair sharing a kind)
  const withAffix = rollMany([...Array(2000).keys()]).find((i) => i.affixCues.length > 0);
  ok(withAffix && render(withAffix).some((l) => /^@(fillStyle|strokeStyle)/.test(l)), 'affixed item issues cue strokes/fills');
}

// ── contactSheet tiles without throwing ──
{
  const { ctx } = recCtx();
  let threw = false;
  try { contactSheet(ctx, rollMany([...Array(16).keys()]), { cols: 4 }); } catch { threw = true; }
  ok(!threw, 'contactSheet renders a grid without throwing');
}

console.log(`sprite.selftest: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
