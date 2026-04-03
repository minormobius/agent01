// ── Recipe Builder — flavor compound pairing game ────────────
// Draw 6 foods, select 3-5 to build a "dish".
// Score = average pairwise cosine similarity from FooDB compound embeddings.

import { FOOD_CATEGORIES, FOOD_POOL } from "./yum-pool.js";
import { fetchArticleData, RARITY_LABELS } from "./shared.js";

let emb = null;   // Float32Array of all embeddings
let idx = null;   // { dim, count, titles[], categories[] }
let ready = false;

let hand = [];        // 6 drawn cards: { poolIdx, title, category, stats, page }
let selected = new Set(); // indices into hand[]
const history = [];

// ── Embedding loading ────────────────────────────────────────

async function loadEmb() {
  const status = document.getElementById("rb-status");
  try {
    const [jr, br] = await Promise.all([
      fetch("data/yum-embeddings.json"),
      fetch("data/yum-embeddings.bin"),
    ]);
    if (!jr.ok || !br.ok) {
      status.textContent = "Flavor data not available yet.";
      return;
    }
    idx = await jr.json();
    emb = new Float32Array(await br.arrayBuffer());
    ready = true;
    status.textContent = `${idx.count} foods · ${idx.dim}d flavor embeddings · ${idx.foodb_matched} compound-matched`;
    document.getElementById("rb-draw").disabled = false;
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to load flavor data.";
  }
}

// ── Vector math ──────────────────────────────────────────────

function cos(ai, bi) {
  const d = idx.dim, oA = ai * d, oB = bi * d;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < d; i++) {
    dot += emb[oA + i] * emb[oB + i];
    na += emb[oA + i] * emb[oA + i];
    nb += emb[oB + i] * emb[oB + i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function coherenceScore(indices) {
  // Average pairwise cosine similarity
  if (indices.length < 2) return 0;
  let sum = 0, count = 0;
  for (let i = 0; i < indices.length; i++) {
    for (let j = i + 1; j < indices.length; j++) {
      sum += cos(indices[i], indices[j]);
      count++;
    }
  }
  return sum / count;
}

function gradeScore(score) {
  // Score ranges roughly -1 to 1, but typical good dishes 0.3-0.9
  if (score >= 0.8) return { grade: "S", label: "Transcendent", cls: "rb-grade-s" };
  if (score >= 0.6) return { grade: "A", label: "Exquisite", cls: "rb-grade-a" };
  if (score >= 0.4) return { grade: "B", label: "Harmonious", cls: "rb-grade-b" };
  if (score >= 0.2) return { grade: "C", label: "Interesting", cls: "rb-grade-c" };
  if (score >= 0.0) return { grade: "D", label: "Adventurous", cls: "rb-grade-d" };
  return { grade: "F", label: "Chaotic", cls: "rb-grade-f" };
}

// ── Drawing ──────────────────────────────────────────────────

// Build title→embedding index mapping
function titleToEmbIdx(title) {
  if (!idx) return -1;
  return idx.titles.indexOf(title);
}

function shuffledPool() {
  const arr = FOOD_POOL.map((entry, i) => ({ entry, i }));
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

async function drawHand() {
  hand = [];
  selected.clear();

  const handEl = document.getElementById("rb-hand");
  handEl.innerHTML = '<div class="loading"><div class="spinner"></div><span>Drawing...</span></div>';
  hideScore();
  hideMatrix();
  hideHints();

  // Pick 6 that have embeddings
  const pool = shuffledPool();
  const picks = [];
  for (const { entry } of pool) {
    const embIdx = titleToEmbIdx(entry[0]);
    if (embIdx >= 0 && picks.length < 6) {
      picks.push({ title: entry[0], category: entry[1], stats: entry[2], embIdx });
    }
    if (picks.length >= 6) break;
  }

  // Fetch Wikipedia data
  const titles = picks.map(p => p.title);
  let pages = {};
  try {
    pages = await fetchArticleData(titles);
  } catch (e) { /* offline fallback */ }

  hand = picks.map(p => {
    const page = Object.values(pages).find(pg => pg.title === p.title) || {};
    return { ...p, page };
  });

  renderHand();
  document.getElementById("rb-clear").disabled = false;
  document.getElementById("rb-redraw").disabled = false;
}

// ── Rendering ────────────────────────────────────────────────

function renderHand() {
  const el = document.getElementById("rb-hand");
  el.innerHTML = hand.map((card, i) => {
    const cat = FOOD_CATEGORIES[card.category] || {};
    const rarity = card.stats?.rarity || "common";
    const sel = selected.has(i);
    const thumb = card.page?.thumbnail?.source;
    return `
      <div class="rb-card ${sel ? "rb-selected" : ""} rarity-${rarity}" data-idx="${i}">
        ${thumb
          ? `<img class="rb-card-img" src="${thumb}" alt="${card.title}">`
          : `<div class="rb-card-icon">${cat.icon || "?"}</div>`}
        <div class="rb-card-title">${card.title}</div>
        <div class="rb-card-cat" style="color:${cat.color || '#888'}">${cat.name || card.category}</div>
      </div>`;
  }).join("");

  el.querySelectorAll(".rb-card").forEach(cardEl => {
    cardEl.addEventListener("click", () => {
      const i = parseInt(cardEl.dataset.idx);
      toggleSelect(i);
    });
  });
}

function toggleSelect(i) {
  if (selected.has(i)) {
    selected.delete(i);
  } else {
    if (selected.size >= 5) return; // max 5
    selected.add(i);
  }
  renderHand();
  updateScore();
  updateMatrix();
  updateHints();
}

function clearSelection() {
  selected.clear();
  renderHand();
  hideScore();
  hideMatrix();
  hideHints();
}

// ── Score ────────────────────────────────────────────────────

function updateScore() {
  const scoreEl = document.getElementById("rb-score");

  if (selected.size < 2) {
    scoreEl.classList.add("hidden");
    return;
  }

  const embIndices = [...selected].map(i => hand[i].embIdx);
  const score = coherenceScore(embIndices);
  const { grade, label, cls } = gradeScore(score);

  const gradeEl = document.getElementById("rb-grade");
  const valueEl = document.getElementById("rb-score-value");
  const dishEl = document.getElementById("rb-dish-name");

  gradeEl.textContent = grade;
  gradeEl.className = "rb-score-grade " + cls;
  valueEl.textContent = `${(score * 100).toFixed(1)}%`;

  // Show selected ingredients as dish name
  const names = [...selected].map(i => hand[i].title);
  dishEl.textContent = names.join(" + ");

  scoreEl.classList.remove("hidden");

  // Update status with selection count
  const minMsg = selected.size < 3 ? " (select at least 3)" : "";
  document.getElementById("rb-status").textContent =
    `${selected.size}/5 ingredients selected${minMsg}`;
}

function hideScore() {
  document.getElementById("rb-score").classList.add("hidden");
}

// ── Pairing Matrix ──────────────────────────────────────────

function updateMatrix() {
  const matrixEl = document.getElementById("rb-matrix");
  const gridEl = document.getElementById("rb-matrix-grid");

  if (selected.size < 2) {
    matrixEl.classList.add("hidden");
    return;
  }

  const sel = [...selected];
  const n = sel.length;

  // Build table
  let html = '<table class="rb-matrix-table">';

  // Header row
  html += '<tr><th></th>';
  for (const i of sel) {
    const name = hand[i].title.length > 12
      ? hand[i].title.slice(0, 11) + "..."
      : hand[i].title;
    html += `<th class="rb-matrix-header">${name}</th>`;
  }
  html += '</tr>';

  // Data rows
  for (let r = 0; r < n; r++) {
    const name = hand[sel[r]].title.length > 12
      ? hand[sel[r]].title.slice(0, 11) + "..."
      : hand[sel[r]].title;
    html += `<tr><th class="rb-matrix-row-header">${name}</th>`;
    for (let c = 0; c < n; c++) {
      if (r === c) {
        html += '<td class="rb-matrix-cell rb-matrix-diag">-</td>';
      } else {
        const sim = cos(hand[sel[r]].embIdx, hand[sel[c]].embIdx);
        const color = simColor(sim);
        const pct = (sim * 100).toFixed(0);
        html += `<td class="rb-matrix-cell" style="background:${color}" title="${hand[sel[r]].title} × ${hand[sel[c]].title}: ${pct}%">${pct}</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</table>';

  gridEl.innerHTML = html;
  matrixEl.classList.remove("hidden");
}

function simColor(sim) {
  // -1 (red) → 0 (neutral) → 1 (green)
  if (sim >= 0) {
    const g = Math.round(80 + sim * 120);
    const r = Math.round(40 - sim * 30);
    return `rgba(${r}, ${g}, 60, ${0.3 + sim * 0.5})`;
  } else {
    const r = Math.round(80 + Math.abs(sim) * 140);
    return `rgba(${r}, 40, 40, ${0.3 + Math.abs(sim) * 0.5})`;
  }
}

function hideMatrix() {
  document.getElementById("rb-matrix").classList.add("hidden");
}

// ── Hints: best pair / worst pair ───────────────────────────

function updateHints() {
  const el = document.getElementById("rb-hints");

  if (selected.size < 3) {
    el.classList.add("hidden");
    return;
  }

  const sel = [...selected];
  let bestPair = null, bestSim = -2;
  let worstPair = null, worstSim = 2;

  for (let i = 0; i < sel.length; i++) {
    for (let j = i + 1; j < sel.length; j++) {
      const sim = cos(hand[sel[i]].embIdx, hand[sel[j]].embIdx);
      if (sim > bestSim) { bestSim = sim; bestPair = [sel[i], sel[j]]; }
      if (sim < worstSim) { worstSim = sim; worstPair = [sel[i], sel[j]]; }
    }
  }

  let html = '';
  if (bestPair) {
    html += `<div class="rb-hint rb-hint-best">Best pairing: <strong>${hand[bestPair[0]].title}</strong> + <strong>${hand[bestPair[1]].title}</strong> (${(bestSim * 100).toFixed(0)}%)</div>`;
  }
  if (worstPair && worstSim < 0) {
    html += `<div class="rb-hint rb-hint-worst">Clash: <strong>${hand[worstPair[0]].title}</strong> + <strong>${hand[worstPair[1]].title}</strong> (${(worstSim * 100).toFixed(0)}%)</div>`;
  }

  // Suggest the best unselected card
  const unselected = hand.map((_, i) => i).filter(i => !selected.has(i));
  if (unselected.length > 0 && selected.size < 5) {
    let bestAdd = null, bestAddScore = -2;
    for (const ui of unselected) {
      // Score if we added this card
      const testIndices = [...sel, ui].map(i => hand[i].embIdx);
      const testScore = coherenceScore(testIndices);
      if (testScore > bestAddScore) {
        bestAddScore = testScore;
        bestAdd = ui;
      }
    }
    if (bestAdd !== null) {
      const delta = bestAddScore - coherenceScore(sel.map(i => hand[i].embIdx));
      const arrow = delta >= 0 ? "+" : "";
      html += `<div class="rb-hint rb-hint-suggest">Try adding: <strong>${hand[bestAdd].title}</strong> (${arrow}${(delta * 100).toFixed(1)})</div>`;
    }
  }

  el.innerHTML = html;
  el.classList.remove("hidden");
}

function hideHints() {
  document.getElementById("rb-hints").classList.add("hidden");
}

// ── History ─────────────────────────────────────────────────

function saveDish() {
  if (selected.size < 3) return;
  const sel = [...selected];
  const embIndices = sel.map(i => hand[i].embIdx);
  const score = coherenceScore(embIndices);
  const { grade } = gradeScore(score);
  const names = sel.map(i => hand[i].title);
  const cats = sel.map(i => hand[i].category);

  history.unshift({ names, cats, score, grade });
  renderHistory();
}

function renderHistory() {
  const el = document.getElementById("rb-history");
  if (history.length === 0) { el.innerHTML = ""; return; }

  const items = history.slice(0, 10).map(h => {
    const { grade } = gradeScore(h.score);
    return `<div class="rb-hist-item">
      <span class="rb-hist-grade rb-grade-${grade.toLowerCase()}">${grade}</span>
      <span class="rb-hist-names">${h.names.join(" + ")}</span>
      <span class="rb-hist-score">${(h.score * 100).toFixed(0)}%</span>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="rb-hist-label">Previous Dishes</div>${items}`;
}

// ── Init ────────────────────────────────────────────────────

loadEmb();

document.getElementById("rb-draw").addEventListener("click", () => {
  // Save current dish if valid
  if (selected.size >= 3) saveDish();
  drawHand();
});

document.getElementById("rb-clear").addEventListener("click", clearSelection);

document.getElementById("rb-redraw").addEventListener("click", () => {
  if (selected.size >= 3) saveDish();
  drawHand();
});
