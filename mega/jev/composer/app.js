// app.js — the composer overlay.
//
// One loop over five generators. Each step: enumerate the legal moves, REDRAW
// AND MEASURE every one of them, put the measurements to Jev, apply its pick,
// repeat. Greedy and random then replay the identical enumerated sets, so the
// three arms differ only in who chose.
//
// Everything renders from cells the generator emits, client-side — no API round
// trip per candidate, which is what makes showing the whole option set
// affordable. The one network call per step is the decision itself.
import { GENERATORS, BRIEFS, TRAITS, BRIEF_KEYS, CIRCULAR, legalMoves, traitsOf, briefDistance,
  moveCriteria, composeDoc, hueName, hueGap, COLOURS } from '../lab/gen.mjs';
import { briefFromText } from '../lab/steer.mjs';

const $ = (id) => document.getElementById(id);
const ENDPOINT = '../api/ask';

// ------------------------------------------------------------- rendering ----
/**
 * Draw a cell set into a canvas, fitted to its own bounding box.
 *
 * Fitting to the INK rather than the grid matters: an eel occupies a wide strip
 * of a wide grid and a brittle-star a circle of a square one, and drawing both
 * at grid scale would make the comparison a comparison of grids.
 */
function draw(cv, cells) {
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  if (!cells?.length) return;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const c of cells) {
    if (c.x < x0) x0 = c.x; if (c.x > x1) x1 = c.x;
    if (c.y < y0) y0 = c.y; if (c.y > y1) y1 = c.y;
  }
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const s = Math.max(1, Math.floor(Math.min(cv.width / (w + 2), cv.height / (h + 2))));
  const ox = Math.floor((cv.width - w * s) / 2), oy = Math.floor((cv.height - h * s) / 2);
  for (const c of cells) {
    ctx.fillStyle = c.c || '#888';
    ctx.fillRect(ox + (c.x - x0) * s, oy + (c.y - y0) * s, s, s);
  }
}
const cellsOf = (genId, genes) => { try { return GENERATORS[genId].cells(genes); } catch { return []; } };

// ------------------------------------------------------------- the model ----
async function ask(state, questions) {
  const r = await fetch(ENDPOINT, { method: 'POST',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify({ state, questions }) });
  const b = await r.json();
  if (!r.ok) throw new Error(b?.error || `jev ${r.status}`);
  return b;
}

// --------------------------------------------------------------- the run ----
let running = false;

/** Enumerate, redraw, measure. The caller computes; the model decides. */
function enumerate(genId, genes, brief) {
  return legalMoves(genId, genes, brief).map((m) => {
    const t = traitsOf(genId, m.genes);
    return { ...m, traits: t, d: briefDistance(t, brief) };
  }).filter((m) => m.traits);
}

const swatch = (deg) => `<span class="sw" style="background:hsl(${deg} 62% 55%)"></span>`;

function paintTraits(t, brief) {
  $('traitBody').innerHTML = BRIEF_KEYS.filter((k) => brief.target[k] != null).map((k) => {
    // A circular axis has no signed gap, so it does not get a column pretending
    // it has one. It is either the colour asked for or a different colour.
    if (CIRCULAR.includes(k)) {
      const on = hueGap(t[k], brief.target[k]) < 20;
      return `<tr><td>${k}</td><td>${swatch(t[k])}${hueName(t[k])}</td>` +
        `<td>${swatch(brief.target[k])}${hueName(brief.target[k])}</td>` +
        `<td>${on ? 'on target' : 'wrong'}</td></tr>`;
    }
    const gap = brief.target[k] - t[k];
    return `<tr><td>${k}</td><td>${t[k].toFixed(2)}</td><td>${brief.target[k].toFixed(2)}</td>` +
      `<td>${gap > 0 ? '+' : ''}${gap.toFixed(2)}</td></tr>`;
  }).join('');
}

function paintOptions(moves, chosenId, conf) {
  const best = Math.min(...moves.map((m) => m.d));
  $('opts').innerHTML = '';
  for (const m of moves) {
    const el = document.createElement('div');
    el.className = 'opt' + (m.id === chosenId ? ' chosen' : '') + (Math.abs(m.d - best) < 1e-9 ? ' best' : '');
    el.innerHTML = `${m.id === chosenId ? '<span class="tick">✓</span>' : ''}` +
      `<canvas width="80" height="80"></canvas>` +
      `<div class="lab">${m.id === chosenId ? 'chosen · ' : ''}` +
      `${m.dir === 0 ? `${swatch(COLOURS[m.colour])}${m.colour}` : `${m.gene} ${m.dir > 0 ? '↑' : '↓'}`}</div>` +
      `<div class="d">${m.d.toFixed(3)}</div>`;
    $('opts').appendChild(el);
    draw(el.querySelector('canvas'), cellsOf(currentGen, m.genes));
  }
  $('optWhy').innerHTML = `${moves.length} legal moves, each redrawn and measured before Jev saw it. ` +
    `<b>✓ is the one it took</b>${conf != null ? ` (confidence ${conf.toFixed(2)})` : ''}; ` +
    `the bold number is the best gap available. An edit that would leave the generator's own bounds is ` +
    `never offered, so the answer <b>cannot</b> be an illegal creature.`;
}

let currentGen = 'quad';

// ------------------------------------------------------- the typed brief ----
// A brief derived from someone's sentence is an ordinary brief: a label and a
// partial target. `briefDistance` and `composeDoc` already ignore absent
// traits, so a three-trait brief needs no special case anywhere downstream —
// which is the whole reason the self-check is allowed to drop traits.
let typedBrief = null;
const activeBrief = () => ($('brief').value === '__typed' && typedBrief ? typedBrief : BRIEFS[$('brief').value]);

/** Show what the words became, including — especially — what they did not. */
function paintDerived(b) {
  if (!b) { $('derived').innerHTML = ''; return; }
  const rows = BRIEF_KEYS.filter((t) => b.detail[t]).map((t) => {
    const d = b.detail[t];
    return `<tr><td>${t}</td><td>${d.score == null ? '—' : d.score.toFixed(2)}</td>` +
      `<td>${CIRCULAR.includes(t) ? `${swatch(d.value)}${d.rung}` : d.value}</td>` +
      `<td>${d.have == null ? '—' : d.have.toFixed(2)}</td>` +
      `<td>${CIRCULAR.includes(t) ? 'a choice, not a rung — hue has no order' : d.rung}</td></tr>`;
  }).join('');
  const drops = b.dropped.length
    ? `<p class="note drop">left out, and deliberately: ` +
      b.dropped.map((d) => `<b>${d.trait}</b> — ${d.why}`).join('; ') + `.</p>`
    : '';
  const head = b.empty
    ? `<p class="note"><b>Nothing was constrained.</b> The self-check said this description does not decide any
       of the six measured traits, so there is no brief to compose against — it would be a random walk with a
       caption. Try naming a size, a proportion, how solid it is, or where the weight sits.</p>`
    : `<p class="note">${Object.keys(b.target).length} of ${BRIEF_KEYS.length} traits constrained by your words` +
      `${b.source ? ` · ${b.source === 'typesafe' ? 'live jev' : b.source}` : ''}. ` +
      `<b>score</b> is the expectation over the ordered rungs (a 2.4 really is between rung 2 and rung 3); ` +
      `<b>p(says)</b> is the self-check that decides whether the trait is used at all.</p>`;
  $('derived').innerHTML = head + (rows
    ? `<table><thead><tr><th>trait</th><th>score</th><th>target</th><th>p(says)</th><th>what that rung reads as</th>` +
      `</tr></thead><tbody>${rows}</tbody></table>` : '') + drops;
}

async function readText() {
  const text = $('text').value.trim();
  if (!text || running) return;
  $('read').disabled = true;
  $('derived').innerHTML = '<p class="note">asking — twelve typed questions in one call…</p>';
  try {
    const b = await briefFromText(text, ask);
    typedBrief = b;
    paintDerived(b);
    if (!b.empty) {
      if (!$('brief').querySelector('option[value="__typed"]')) {
        $('brief').insertAdjacentHTML('beforeend', '<option value="__typed"></option>');
      }
      const o = $('brief').querySelector('option[value="__typed"]');
      o.textContent = `your words — ${b.label}`;
      $('brief').value = '__typed';
      preview();
      $('mode').textContent = 'brief read from your words — press compose';
    } else if ($('brief').value === '__typed') {
      // A second read that constrains nothing must not leave the previous
      // sentence's brief selected under a caption saying nothing was
      // constrained. Fall back to a real brief rather than composing against
      // an empty target, which has no gap to close and would wander.
      $('brief').value = Object.keys(BRIEFS)[0];
      preview();
      $('mode').textContent = 'nothing was constrained — back to a written brief';
    }
  } catch (e) {
    // Same rule as the chain: say the call failed. A steering box that quietly
    // fell back to keyword matching would be claiming a result it did not get.
    // The message is inserted as text, never as markup — it comes off the wire.
    $('derived').textContent =
      `the call failed — ${String(e.message).slice(0, 120)}. Nothing was derived; the brief is unchanged.`;
  } finally { $('read').disabled = false; }
}

async function compose() {
  if (running) return;
  running = true;
  $('run').disabled = true; $('shuffle').disabled = true;
  const genId = currentGen = $('gen').value;
  const brief = activeBrief();
  const steps = Number($('steps').value);
  const start = { ...GENERATORS[genId].defaults };

  draw($('cvStart'), cellsOf(genId, start));
  let genes = { ...start };
  let t = traitsOf(genId, genes);
  const startD = briefDistance(t, brief);
  paintTraits(t, brief);
  draw($('cvNow'), cellsOf(genId, genes));

  const history = [];
  let refusals = 0;
  for (let i = 0; i < steps; i++) {
    const moves = enumerate(genId, genes, brief);
    if (!moves.length) break;
    $('mode').textContent = `edit ${i + 1} of ${steps} — asking…`;
    paintOptions(moves, null, null);

    let pick = null;
    try {
      const q = { type: 'choice', criteria: moveCriteria(moves, t, brief),
        instructions: `Which single edit leaves the SMALLEST overall gap to the brief (${brief.label})? Each option states the gap it would produce; lower is closer.` };
      const reply = await ask(composeDoc(genId, t, brief, { step: i, total: steps, history }), { edit: q });
      const a = reply.answers?.edit;
      if (a?.choice) pick = { id: a.choice, conf: a.confidence ?? null, source: reply.source };
      $('mode').textContent = `edit ${i + 1} of ${steps} — ${reply.source === 'typesafe' ? 'live jev' : reply.source || 'stand-in'}`;
    } catch (e) {
      // Say the call failed rather than silently falling back to a rule — a
      // composer that quietly became greedy would be the worst possible demo.
      $('mode').textContent = `edit ${i + 1}: call failed — ${String(e.message).slice(0, 60)}`;
      refusals++;
      break;
    }
    const m = moves.find((x) => x.id === pick?.id);
    paintOptions(moves, m?.id ?? null, pick?.conf);
    if (!m) { refusals++; break; }

    const before = briefDistance(t, brief);
    genes = m.genes; t = m.traits;
    history.push({ id: m.id, before, after: m.d });
    paintTraits(t, brief);
    draw($('cvNow'), cellsOf(genId, genes));
    $('capNow').textContent = `after ${history.length} edit${history.length === 1 ? '' : 's'}`;
    $('gapLine').innerHTML = `gap <b>${startD.toFixed(3)}</b> → <b>${m.d.toFixed(3)}</b> · ` +
      `${history.filter((h) => h.after < h.before).length} of ${history.length} edits improved it`;
    await new Promise((r) => setTimeout(r, 120));
  }

  // The controls, on the identical enumerated sets. They cost nothing — no
  // model call — which is exactly why there is no excuse for omitting them.
  const replay = (pickFn) => {
    let g = { ...start }, tt = traitsOf(genId, g);
    for (let i = 0; i < history.length; i++) {
      const ms = enumerate(genId, g, brief);
      if (!ms.length) break;
      const m = pickFn(ms, i);
      g = m.genes; tt = m.traits;
    }
    return { genes: g, d: briefDistance(tt, brief) };
  };
  const greedy = replay((ms) => ms.reduce((a, b) => (b.d < a.d ? b : a)));
  let seed = 1234;
  const random = replay((ms) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return ms[seed % ms.length]; });
  const jevD = briefDistance(t, brief);

  $('race').innerHTML = '';
  for (const [label, g, d, note] of [
    ['Jev', genes, jevD, refusals ? 'chain cut short' : `${history.length} edits`],
    ['greedy', greedy.genes, greedy.d, 'myopic ceiling'],
    ['random', random.genes, random.d, 'same legal set'],
  ]) {
    const f = document.createElement('figure');
    f.innerHTML = `<canvas width="160" height="160"></canvas>` +
      `<figcaption><b>${label}</b><br><span class="num">gap ${d.toFixed(3)}</span><br>${note}</figcaption>`;
    $('race').appendChild(f);
    draw(f.querySelector('canvas'), cellsOf(genId, g));
  }
  $('mode').textContent = history.length
    ? `done — Jev ${jevD.toFixed(3)}, greedy ${greedy.d.toFixed(3)}, random ${random.d.toFixed(3)}`
    : 'no edits were made';
  running = false; $('run').disabled = false; $('shuffle').disabled = false;
}

// ----------------------------------------------------------------- setup ----
for (const [id, g] of Object.entries(GENERATORS)) {
  $('gen').insertAdjacentHTML('beforeend', `<option value="${id}">${g.label}</option>`);
}
for (const [id, b] of Object.entries(BRIEFS)) {
  $('brief').insertAdjacentHTML('beforeend', `<option value="${id}">${id} — ${b.label}</option>`);
}

function preview() {
  currentGen = $('gen').value;
  const brief = activeBrief();
  const start = { ...GENERATORS[currentGen].defaults };
  const t = traitsOf(currentGen, start);
  draw($('cvStart'), cellsOf(currentGen, start));
  draw($('cvNow'), cellsOf(currentGen, start));
  $('capNow').textContent = 'now';
  paintTraits(t, brief);
  $('gapLine').innerHTML = `gap <b>${briefDistance(t, brief).toFixed(3)}</b> — not composed yet`;
  paintOptions(enumerate(currentGen, start, brief), null, null);
  $('race').innerHTML = '';
}

// The stumble move: a random generator and a random brief, which is the fastest
// way to see that the SAME brief means the same thing to five different bodies.
$('shuffle').addEventListener('click', () => {
  const gens = Object.keys(GENERATORS), briefs = Object.keys(BRIEFS);
  $('gen').value = gens[Math.floor(Math.random() * gens.length)];
  $('brief').value = briefs[Math.floor(Math.random() * briefs.length)];
  preview();
  $('mode').textContent = 'shuffled — press compose';
});
$('gen').addEventListener('change', preview);
$('brief').addEventListener('change', preview);
$('run').addEventListener('click', compose);
$('read').addEventListener('click', readText);
$('text').addEventListener('keydown', (e) => { if (e.key === 'Enter') readText(); });
preview();

// The headless hook, the house `__foam` / `__jev` / `__jevlab` pattern.
window.__composer = { compose, preview, enumerate, draw, readText,
  typed: () => typedBrief,
  state: () => ({ gen: currentGen, brief: $('brief').value }) };
