// ── Transmute — vector-difference alchemy ────────────────────
// Given target C, find hand cards A,B where A−B ≈ C.
// Score = alignment(A−B, C) × triangle_area(A,B,C)
import { CATEGORIES, POOL, loadCatalog, fetchArticleData, showCardPreview, RARITY_LABELS } from "../core/shared.js";

let emb = null;   // Float32Array of all embeddings
let idx = null;   // { dim, count, titles[], bins[] }
let ready = false;
let loading = false;

let target = null;       // { idx, title, category, stats }
let hand = [];           // array of card objects
let selA = null;         // index into hand[]
let selB = null;         // index into hand[]
const history = [];

const HAND_SIZE = 8;

// ── Embedding loading ────────────────────────────────────────

async function loadEmb() {
  if (ready || loading) return;
  loading = true;
  const status = document.getElementById("tx-status");
  status.textContent = "Loading embeddings…";

  try {
    const [jr, br] = await Promise.all([
      fetch("../data/embeddings/embeddings.json"),
      fetch("../data/embeddings/embeddings.bin"),
    ]);
    if (!jr.ok || !br.ok) {
      status.textContent = "Transmute requires embedding data — coming soon.";
      status.classList.add("tx-unavailable");
      loading = false;
      return;
    }
    idx = await jr.json();
    emb = new Float32Array(await br.arrayBuffer());
    ready = true;
    status.textContent = `${idx.count.toLocaleString()} articles · ${idx.dim}d embeddings`;
  } catch (err) {
    console.error("Failed to load embeddings:", err);
    status.textContent = "Failed to load embeddings.";
  }
  loading = false;
}

// ── Vector math ──────────────────────────────────────────────

function vecSub(a, b) {
  const d = idx.dim;
  const oA = a * d, oB = b * d;
  const v = new Float32Array(d);
  for (let i = 0; i < d; i++) v[i] = emb[oA + i] - emb[oB + i];
  return v;
}

function cosDiff(diff, ci) {
  // cosine similarity between diff vector and embedding at index ci
  const d = idx.dim, o = ci * d;
  let dot = 0, nd = 0, ne = 0;
  for (let i = 0; i < d; i++) {
    dot += diff[i] * emb[o + i];
    nd += diff[i] * diff[i];
    ne += emb[o + i] * emb[o + i];
  }
  const denom = Math.sqrt(nd) * Math.sqrt(ne);
  return denom > 0 ? dot / denom : 0;
}

function triArea(ai, bi, ci) {
  // area of triangle A,B,C in embedding space
  // 0.5 * sqrt(|AB|²|AC|² − (AB·AC)²)
  const d = idx.dim;
  const oA = ai * d, oB = bi * d, oC = ci * d;
  let abSq = 0, acSq = 0, abAc = 0;
  for (let i = 0; i < d; i++) {
    const ab = emb[oB + i] - emb[oA + i];
    const ac = emb[oC + i] - emb[oA + i];
    abSq += ab * ab;
    acSq += ac * ac;
    abAc += ab * ac;
  }
  return 0.5 * Math.sqrt(Math.max(0, abSq * acSq - abAc * abAc));
}

function dotSim(ai, bi) {
  const d = idx.dim, oA = ai * d, oB = bi * d;
  let dot = 0;
  for (let i = 0; i < d; i++) dot += emb[oA + i] * emb[oB + i];
  return dot;
}

function findNearest(diff, exclude) {
  // find embedding closest to diff vector (by cosine)
  let best = -1, bestS = -Infinity;
  const n = idx.count;
  for (let i = 0; i < n; i++) {
    if (exclude.has(i)) continue;
    const s = cosDiff(diff, i);
    if (s > bestS) { bestS = s; best = i; }
  }
  return { idx: best, sim: bestS };
}

// ── Card drawing ─────────────────────────────────────────────

function drawCard() {
  const i = Math.floor(Math.random() * idx.count);
  const title = idx.titles[i];
  const bin = idx.bins[i];
  const pe = POOL.find(p => p[0] === title);
  const stats = pe ? pe[2] : { atk: 50, def: 50, spc: 50, spd: 50, hp: 500, rarity: "common" };
  return { idx: i, title, category: bin, stats };
}

function drawHand() {
  const h = [];
  const seen = new Set();
  if (target) seen.add(target.idx);
  while (h.length < HAND_SIZE) {
    const c = drawCard();
    if (!seen.has(c.idx)) { seen.add(c.idx); h.push(c); }
  }
  return h;
}

// ── Transmutation scoring ────────────────────────────────────

function transmute(a, b, t) {
  const diff = vecSub(a.idx, b.idx);
  const alignment = cosDiff(diff, t.idx);
  const area = triArea(a.idx, b.idx, t.idx);
  // find what the diff vector actually maps to
  const phantom = findNearest(diff, new Set([a.idx, b.idx, t.idx]));
  const phantomTitle = idx.titles[phantom.idx];
  const phantomBin = idx.bins[phantom.idx];
  const phantomPE = POOL.find(p => p[0] === phantomTitle);
  const phantomStats = phantomPE ? phantomPE[2] : { atk: 50, def: 50, spc: 50, spd: 50, hp: 500, rarity: "common" };

  // combined score: alignment × area, scaled for display
  // area of unit-sphere triangle max ≈ 0.87, typical 0.2–0.5
  // score in [0, ~0.5] range, scale to percentage
  const raw = Math.max(0, alignment) * area;
  const score = Math.min(100, raw * 200);  // scale so good results hit 50-80%

  const grade =
    score >= 70 ? "S" :
    score >= 50 ? "A" :
    score >= 30 ? "B" :
    score >= 15 ? "C" :
    score >= 5  ? "D" : "F";

  return { alignment, area, score, grade, phantom: {
    title: phantomTitle, category: phantomBin, stats: phantomStats, sim: phantom.sim
  }};
}

// ── Rendering ────────────────────────────────────────────────

function renderTarget() {
  const el = document.getElementById("tx-target-card");
  if (!target) { el.innerHTML = ""; return; }
  const cat = CATEGORIES[target.category];
  const r = target.stats?.rarity || "common";
  el.innerHTML = `
    <div class="tx-tgt rarity-${r}" title="Click to preview" style="cursor:pointer">
      <div class="tx-tgt-cat" style="color:${cat?.color || '#888'}">${cat?.icon || ''} ${cat?.name || target.category}</div>
      <div class="tx-tgt-title">${target.title}</div>
      <div class="tx-tgt-rarity">${RARITY_LABELS[r]}</div>
    </div>`;
  el.querySelector(".tx-tgt").onclick = () =>
    showCardPreview("tx-preview", target.title, target.category, target.stats);
}

function renderHand() {
  const el = document.getElementById("tx-hand");
  el.innerHTML = hand.map((c, i) => {
    const cat = CATEGORIES[c.category];
    const r = c.stats?.rarity || "common";
    const selClass =
      selA === i ? "tx-sel-a" :
      selB === i ? "tx-sel-b" : "";
    const label =
      selA === i ? '<div class="tx-sel-label">A</div>' :
      selB === i ? '<div class="tx-sel-label">B</div>' : '';
    return `<div class="tx-hcard ${selClass} rarity-${r}" data-hi="${i}" title="${c.title}">
      ${label}
      <div class="tx-hcard-cat" style="color:${cat?.color || '#888'}">${cat?.icon || ''}</div>
      <div class="tx-hcard-title">${c.title}</div>
      <div class="tx-hcard-rarity">${RARITY_LABELS[r]}</div>
    </div>`;
  }).join("");

  el.querySelectorAll(".tx-hcard").forEach(card => {
    card.onclick = () => {
      const i = parseInt(card.dataset.hi);
      if (selA === i) { selA = null; }
      else if (selB === i) { selB = null; }
      else if (selA === null) { selA = i; }
      else if (selB === null) { selB = i; }
      else { selA = selB; selB = i; }  // shift selection
      renderHand();
      updateTransmuteBtn();
    };
    card.oncontextmenu = (e) => {
      e.preventDefault();
      const i = parseInt(card.dataset.hi);
      showCardPreview("tx-preview", hand[i].title, hand[i].category, hand[i].stats);
    };
  });
}

function updateTransmuteBtn() {
  const btn = document.getElementById("tx-go");
  if (selA !== null && selB !== null && target) {
    btn.classList.remove("hidden");
  } else {
    btn.classList.add("hidden");
  }
}

function renderFormula(a, b, t) {
  return `<span class="tx-eq-term">${a}</span>` +
    ` <span class="tx-eq-op">&minus;</span> ` +
    `<span class="tx-eq-term">${b}</span>` +
    ` <span class="tx-eq-op">&approx;</span> ` +
    `<span class="tx-eq-term">${t}</span>`;
}

async function renderResult(r, a, b) {
  const el = document.getElementById("tx-result");
  const cat = CATEGORIES[r.phantom.category];
  const pr = r.phantom.stats?.rarity || "common";
  const tCat = CATEGORIES[target.category];
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(r.phantom.title.replace(/ /g, "_"))}`;

  el.innerHTML = `<div class="loading"><div class="spinner"></div><span>Resolving…</span></div>`;

  try {
    const pages = await fetchArticleData([r.phantom.title]);
    const page = Object.values(pages).find(p => p.pageid);

    el.innerHTML = `
      <div class="tx-result-card rarity-${pr}">
        <div class="tx-result-header">
          <div class="tx-result-eq">${renderFormula(a.title, b.title, target.title)}</div>
          <div class="tx-result-scores">
            <div class="tx-score-item">
              <span class="tx-score-label">Alignment</span>
              <span class="tx-score-val">${(r.alignment * 100).toFixed(1)}%</span>
            </div>
            <div class="tx-score-item">
              <span class="tx-score-label">Spread</span>
              <span class="tx-score-val">${r.area.toFixed(3)}</span>
            </div>
            <div class="tx-score-item tx-score-grade">
              <span class="tx-score-label">Grade</span>
              <span class="tx-grade tx-grade-${r.grade.toLowerCase()}">${r.grade}</span>
            </div>
          </div>
        </div>
        <div class="tx-result-body">
          <div class="tx-phantom-label">The difference produced:</div>
          ${page?.thumbnail
            ? `<img class="tx-result-img" src="${page.thumbnail.source}" alt="${r.phantom.title}">`
            : `<div class="tx-result-no-img">${cat?.icon || '?'}</div>`}
          <div class="tx-result-cat" style="color:${cat?.color || '#888'}">${cat?.name || r.phantom.category} — ${RARITY_LABELS[pr]}</div>
          <div class="tx-result-title">${r.phantom.title}</div>
          <div class="tx-result-extract">${page?.extract || ""}</div>
          <div class="tx-result-sim">Phantom similarity: ${(r.phantom.sim * 100).toFixed(1)}%</div>
          <a class="tx-result-link" href="${wikiUrl}" target="_blank">Read on Wikipedia &rarr;</a>
        </div>
      </div>`;
  } catch (_) {
    el.innerHTML = `
      <div class="tx-result-card rarity-${pr}">
        <div class="tx-result-header">
          <div class="tx-result-eq">${renderFormula(a.title, b.title, target.title)}</div>
          <div class="tx-result-scores">
            <div class="tx-score-item"><span class="tx-score-label">Grade</span><span class="tx-grade tx-grade-${r.grade.toLowerCase()}">${r.grade}</span></div>
          </div>
        </div>
        <div class="tx-result-body">
          <div class="tx-phantom-label">The difference produced:</div>
          <div class="tx-result-title">${r.phantom.title}</div>
          <a class="tx-result-link" href="${wikiUrl}" target="_blank">Read on Wikipedia &rarr;</a>
        </div>
      </div>`;
  }
}

function renderHistory() {
  const el = document.getElementById("tx-history");
  if (history.length === 0) { el.innerHTML = ""; return; }
  const items = history.slice(0, 12).map((h, i) => {
    const cat = CATEGORIES[h.phantomCat];
    return `<div class="tx-hist-item" data-hi="${i}" style="cursor:pointer">
      <span class="tx-hist-formula">${h.a} &minus; ${h.b}</span>
      <span class="tx-hist-arrow">&rarr;</span>
      <span class="tx-hist-phantom">${h.phantom}</span>
      <span class="tx-grade tx-grade-${h.grade.toLowerCase()} tx-hist-grade">${h.grade}</span>
      <span class="tx-hist-dot" style="background:${cat?.color || '#888'}"></span>
    </div>`;
  }).join("");
  el.innerHTML = `<div class="tx-hist-label">Previous transmutations</div>${items}`;
  el.querySelectorAll(".tx-hist-item").forEach(row => {
    row.onclick = () => {
      const h = history[parseInt(row.dataset.hi)];
      const pe = POOL.find(p => p[0] === h.phantom);
      const stats = pe ? pe[2] : { atk: 50, def: 50, spc: 50, spd: 50, hp: 500, rarity: "common" };
      showCardPreview("tx-preview", h.phantom, h.phantomCat, stats);
    };
  });
}

// ── Actions ──────────────────────────────────────────────────

async function doNewTarget() {
  if (!ready) await loadEmb();
  if (!ready) return;
  target = drawCard();
  hand = drawHand();
  selA = null;
  selB = null;
  renderTarget();
  renderHand();
  updateTransmuteBtn();
  document.getElementById("tx-result").innerHTML = "";
}

function doTransmute() {
  if (selA === null || selB === null || !target) return;
  const a = hand[selA], b = hand[selB];
  const r = transmute(a, b, target);
  renderResult(r, a, b);

  history.unshift({
    a: a.title, b: b.title, target: target.title,
    phantom: r.phantom.title, phantomCat: r.phantom.category,
    grade: r.grade, score: r.score
  });
  renderHistory();
}

function doRedraw() {
  if (!ready) return;
  hand = drawHand();
  selA = null;
  selB = null;
  renderHand();
  updateTransmuteBtn();
}

function doSwap() {
  if (selA === null || selB === null) return;
  [selA, selB] = [selB, selA];
  renderHand();
}

// ── Init ─────────────────────────────────────────────────────
loadCatalog();

document.getElementById("tx-new-target").addEventListener("click", doNewTarget);
document.getElementById("tx-go").addEventListener("click", doTransmute);
document.getElementById("tx-redraw").addEventListener("click", doRedraw);
document.getElementById("tx-swap").addEventListener("click", doSwap);

// auto-start
doNewTarget();
