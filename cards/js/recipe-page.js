// ── Recipe Builder — flavor compound pairing game ────────────
// Full ingredient deck with search/filter. Select 3-5 to build a dish.
// Score = average pairwise cosine similarity from FooDB compound embeddings.

import { FOOD_CATEGORIES, FOOD_POOL } from "./yum-pool.js";
import { RARITY_LABELS } from "./shared.js";

let emb = null;   // Float32Array of all embeddings
let idx = null;   // { dim, count, titles[], categories[] }
let wiki = null;  // { foods: { title: { thumb, extract } } }
let comp = null;  // complementarity data: { pmi, clusters, freq }
let pmiLookup = null; // Map("a|b" → pmi_score)
let ready = false;

let allCards = [];        // full deck: { title, category, stats, embIdx }
let filteredCards = [];   // after search/filter
let selected = new Set(); // titles of selected cards
let riffTarget = null;    // title of ingredient showing nearest neighbors
const history = [];

const PAGE_SIZE = 30;
let visibleCount = PAGE_SIZE;
let searchTerm = "";
let activeCategories = new Set(Object.keys(FOOD_CATEGORIES));

// ── Data loading ────────────────────────────────────────────

async function loadData() {
  const status = document.getElementById("rb-status");
  try {
    const [jr, br, wr, cr] = await Promise.all([
      fetch("data/yum-embeddings.json"),
      fetch("data/yum-embeddings.bin"),
      fetch("data/yum-wikipedia.json"),
      fetch("data/yum-complementarity.json"),
    ]);

    if (!jr.ok || !br.ok) {
      status.textContent = "Flavor data not available yet.";
      return;
    }

    idx = await jr.json();
    emb = new Float32Array(await br.arrayBuffer());

    if (wr.ok) {
      wiki = await wr.json();
      console.log(`Wikipedia data: ${wiki.matched} foods, ${wiki.with_thumbnails} thumbnails`);
    }

    if (cr.ok) {
      comp = await cr.json();
      // Build PMI lookup: "a|b" → score (bidirectional)
      pmiLookup = new Map();
      for (const [ia, ib, score] of comp.pmi) {
        const a = idx.titles[ia], b = idx.titles[ib];
        if (a && b) {
          pmiLookup.set(`${a}|${b}`, score);
          pmiLookup.set(`${b}|${a}`, score);
        }
      }
      console.log(`Complementarity: ${comp.n_recipes} recipes, ${comp.n_pairs} PMI pairs`);
    }

    // Build full card deck
    const titleIdx = {};
    idx.titles.forEach((t, i) => titleIdx[t] = i);

    allCards = FOOD_POOL.map(entry => {
      const [title, category, stats] = entry;
      const embIdx = titleIdx[title] ?? -1;
      return { title, category, stats, embIdx };
    }).filter(c => c.embIdx >= 0);

    ready = true;
    status.textContent = `${allCards.length} ingredients · ${idx.foodb_matched} flavor-compound matched`;
    applyFilters();
    renderFilters();
  } catch (err) {
    console.error(err);
    status.textContent = "Failed to load data.";
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

function coherenceScore(embIndices) {
  if (embIndices.length < 2) return 0;
  let sum = 0, count = 0;
  for (let i = 0; i < embIndices.length; i++) {
    for (let j = i + 1; j < embIndices.length; j++) {
      sum += cos(embIndices[i], embIndices[j]);
      count++;
    }
  }
  return sum / count;
}

function gradeScore(score) {
  if (score >= 0.8) return { grade: "S", label: "Transcendent", cls: "rb-grade-s" };
  if (score >= 0.6) return { grade: "A", label: "Exquisite", cls: "rb-grade-a" };
  if (score >= 0.4) return { grade: "B", label: "Harmonious", cls: "rb-grade-b" };
  if (score >= 0.2) return { grade: "C", label: "Interesting", cls: "rb-grade-c" };
  if (score >= 0.0) return { grade: "D", label: "Adventurous", cls: "rb-grade-d" };
  return { grade: "F", label: "Chaotic", cls: "rb-grade-f" };
}

// ── Filtering & Search ──────────────────────────────────────

function applyFilters() {
  const term = searchTerm.toLowerCase();
  filteredCards = allCards.filter(c => {
    if (!activeCategories.has(c.category)) return false;
    if (term && !c.title.toLowerCase().includes(term)) return false;
    return true;
  });

  // Sort: selected first, then alphabetical
  filteredCards.sort((a, b) => {
    const sa = selected.has(a.title) ? 0 : 1;
    const sb = selected.has(b.title) ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return a.title.localeCompare(b.title);
  });

  visibleCount = PAGE_SIZE;
  renderDeck();
  updateStatusLine();
}

function renderFilters() {
  const el = document.getElementById("rb-cat-chips");
  el.innerHTML = Object.entries(FOOD_CATEGORIES).map(([key, cat]) => {
    const count = allCards.filter(c => c.category === key).length;
    const active = activeCategories.has(key);
    return `<button class="filter-chip${active ? " active" : ""}" data-cat="${key}"
      style="--chip-color:${cat.color}">
      <span class="filter-chip-icon">${cat.icon}</span>
      ${cat.name}<span class="filter-chip-count">${count}</span>
    </button>`;
  }).join("");

  el.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.cat;
      if (activeCategories.has(key)) activeCategories.delete(key);
      else activeCategories.add(key);
      chip.classList.toggle("active");
      applyFilters();
    });
  });
}

// ── Rendering ────────────────────────────────────────────────

function renderDeck() {
  const el = document.getElementById("rb-deck");
  const visible = filteredCards.slice(0, visibleCount);

  el.innerHTML = visible.map(card => {
    const cat = FOOD_CATEGORIES[card.category] || {};
    const rarity = card.stats?.rarity || "common";
    const sel = selected.has(card.title);
    const w = wiki?.foods?.[card.title] || {};
    return `
      <div class="rb-card ${sel ? "rb-selected" : ""} rarity-${rarity}" data-title="${card.title}">
        ${w.thumb
          ? `<img class="rb-card-img" src="${w.thumb}" alt="${card.title}" loading="lazy">`
          : `<div class="rb-card-icon">${cat.icon || "?"}</div>`}
        <div class="rb-card-title">${card.title}</div>
        <div class="rb-card-cat" style="color:${cat.color || '#888'}">${cat.name || card.category}</div>
      </div>`;
  }).join("");

  // Show more button
  if (visibleCount < filteredCards.length) {
    el.innerHTML += `<button class="rb-show-more" id="rb-show-more">
      Show more (${filteredCards.length - visibleCount} remaining)
    </button>`;
    document.getElementById("rb-show-more").addEventListener("click", () => {
      visibleCount += PAGE_SIZE;
      renderDeck();
    });
  }

  el.querySelectorAll(".rb-card").forEach(cardEl => {
    cardEl.addEventListener("click", () => {
      toggleSelect(cardEl.dataset.title);
    });
  });
}

function toggleSelect(title) {
  if (selected.has(title)) {
    selected.delete(title);
  } else {
    if (selected.size >= 8) return;
    selected.add(title);
  }
  renderDeck();
  renderSelected();
  updateScore();
  updateMatrix();
  updateHints();
  updateSuggestions();
}

function removeSelected(title) {
  selected.delete(title);
  renderDeck();
  renderSelected();
  updateScore();
  updateMatrix();
  updateHints();
  updateSuggestions();
}

function clearSelection() {
  selected.clear();
  renderDeck();
  renderSelected();
  hideScore();
  hideMatrix();
  hideHints();
  updateStatusLine();
  const sug = document.getElementById("rb-suggestions");
  if (sug) sug.classList.add("hidden");
}

function findNearestNeighbors(title, n = 10) {
  const card = allCards.find(c => c.title === title);
  if (!card || card.embIdx < 0) return [];

  const scores = [];
  for (const c of allCards) {
    if (c.title === title || c.embIdx < 0) continue;
    if (selected.has(c.title)) continue; // skip already selected
    const sim = cos(card.embIdx, c.embIdx);
    scores.push({ title: c.title, category: c.category, sim });
  }
  scores.sort((a, b) => b.sim - a.sim);
  return scores.slice(0, n);
}

function swapIngredient(oldTitle, newTitle) {
  selected.delete(oldTitle);
  selected.add(newTitle);
  riffTarget = newTitle; // keep riff panel open on the new ingredient
  renderDeck();
  renderSelected();
  updateScore();
  updateMatrix();
  updateHints();
  updateSuggestions();
}

function renderSelected() {
  const el = document.getElementById("rb-selected");
  if (selected.size === 0) {
    el.innerHTML = '<div class="rb-sel-empty">Click ingredients below to build a dish</div>';
    riffTarget = null;
    return;
  }

  let html = [...selected].map(title => {
    const card = allCards.find(c => c.title === title);
    const cat = FOOD_CATEGORIES[card?.category] || {};
    const w = wiki?.foods?.[title] || {};
    const isRiff = riffTarget === title;
    return `<div class="rb-sel-chip ${isRiff ? "rb-sel-riffing" : ""}" data-title="${title}">
      ${w.thumb ? `<img class="rb-sel-thumb" src="${w.thumb}" alt="${title}">` : `<span class="rb-sel-icon">${cat.icon || "?"}</span>`}
      <span class="rb-sel-name">${title}</span>
      <button class="rb-sel-remove" data-title="${title}">&times;</button>
    </div>`;
  }).join("");

  // Riff panel: nearest neighbors for the selected ingredient
  if (riffTarget && selected.has(riffTarget)) {
    const neighbors = findNearestNeighbors(riffTarget);
    if (neighbors.length > 0) {
      const items = neighbors.map(n => {
        const cat = FOOD_CATEGORIES[n.category] || {};
        const w = wiki?.foods?.[n.title] || {};
        const pct = (n.sim * 100).toFixed(0);
        return `<div class="rb-riff-option" data-title="${n.title}">
          ${w.thumb ? `<img class="rb-sel-thumb" src="${w.thumb}" alt="${n.title}">` : `<span class="rb-sel-icon">${cat.icon || "?"}</span>`}
          <span class="rb-riff-name">${n.title}</span>
          <span class="rb-riff-sim">${pct}%</span>
        </div>`;
      }).join("");
      html += `<div class="rb-riff-panel">
        <div class="rb-riff-header">Swap <strong>${riffTarget}</strong> for:</div>
        <div class="rb-riff-list">${items}</div>
      </div>`;
    }
  }

  el.innerHTML = html;

  // Click chip to toggle riff panel
  el.querySelectorAll(".rb-sel-chip").forEach(chip => {
    chip.addEventListener("click", (e) => {
      if (e.target.closest(".rb-sel-remove")) return;
      const title = chip.dataset.title;
      riffTarget = riffTarget === title ? null : title;
      renderSelected();
    });
  });

  el.querySelectorAll(".rb-sel-remove").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (riffTarget === btn.dataset.title) riffTarget = null;
      removeSelected(btn.dataset.title);
    });
  });

  // Click a riff option to swap
  el.querySelectorAll(".rb-riff-option").forEach(opt => {
    opt.addEventListener("click", () => {
      swapIngredient(riffTarget, opt.dataset.title);
    });
  });
}

function updateStatusLine() {
  const el = document.getElementById("rb-status");
  if (!ready) return;
  const showing = Math.min(visibleCount, filteredCards.length);
  if (selected.size > 0) {
    const minMsg = selected.size < 2 ? " — need at least 2" : "";
    el.textContent = `${selected.size}/8 selected · ${showing}/${allCards.length} shown${minMsg}`;
  } else {
    el.textContent = `${showing}/${allCards.length} ingredients · pick ingredients to build a dish`;
  }
}

// ── Score ────────────────────────────────────────────────────

function updateScore() {
  const scoreEl = document.getElementById("rb-score");
  if (selected.size < 2) { scoreEl.classList.add("hidden"); updateStatusLine(); return; }

  const cards = [...selected].map(t => allCards.find(c => c.title === t)).filter(Boolean);
  const embIndices = cards.map(c => c.embIdx);
  const score = coherenceScore(embIndices);
  const { grade, cls } = gradeScore(score);

  document.getElementById("rb-grade").textContent = grade;
  document.getElementById("rb-grade").className = "rb-score-grade " + cls;
  document.getElementById("rb-score-value").textContent = `${(score * 100).toFixed(1)}%`;
  document.getElementById("rb-dish-name").textContent = [...selected].join(" + ");

  scoreEl.classList.remove("hidden");
  updateStatusLine();
}

function hideScore() { document.getElementById("rb-score").classList.add("hidden"); }

// ── Pairing Matrix ──────────────────────────────────────────

function updateMatrix() {
  const matrixEl = document.getElementById("rb-matrix");
  const gridEl = document.getElementById("rb-matrix-grid");
  if (selected.size < 2) { matrixEl.classList.add("hidden"); return; }

  const titles = [...selected];
  const cards = titles.map(t => allCards.find(c => c.title === t)).filter(Boolean);
  const n = cards.length;

  let html = '<table class="rb-matrix-table"><tr><th></th>';
  for (const c of cards) {
    const name = c.title.length > 12 ? c.title.slice(0, 11) + "..." : c.title;
    html += `<th class="rb-matrix-header">${name}</th>`;
  }
  html += '</tr>';

  for (let r = 0; r < n; r++) {
    const name = cards[r].title.length > 12 ? cards[r].title.slice(0, 11) + "..." : cards[r].title;
    html += `<tr><th class="rb-matrix-row-header">${name}</th>`;
    for (let c = 0; c < n; c++) {
      if (r === c) {
        html += '<td class="rb-matrix-cell rb-matrix-diag">-</td>';
      } else {
        const sim = cos(cards[r].embIdx, cards[c].embIdx);
        const color = simColor(sim);
        const pct = (sim * 100).toFixed(0);
        html += `<td class="rb-matrix-cell" style="background:${color}" title="${cards[r].title} × ${cards[c].title}: ${pct}%">${pct}</td>`;
      }
    }
    html += '</tr>';
  }
  html += '</table>';
  gridEl.innerHTML = html;
  matrixEl.classList.remove("hidden");
}

function simColor(sim) {
  if (sim >= 0) {
    const g = Math.round(80 + sim * 120);
    const r = Math.round(40 - sim * 30);
    return `rgba(${r}, ${g}, 60, ${0.3 + sim * 0.5})`;
  } else {
    const r = Math.round(80 + Math.abs(sim) * 140);
    return `rgba(${r}, 40, 40, ${0.3 + Math.abs(sim) * 0.5})`;
  }
}

function hideMatrix() { document.getElementById("rb-matrix").classList.add("hidden"); }

// ── Hints ───────────────────────────────────────────────────

function updateHints() {
  const el = document.getElementById("rb-hints");
  if (selected.size < 3) { el.classList.add("hidden"); return; }

  const titles = [...selected];
  const cards = titles.map(t => allCards.find(c => c.title === t)).filter(Boolean);

  let bestPair = null, bestSim = -2;
  let worstPair = null, worstSim = 2;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const sim = cos(cards[i].embIdx, cards[j].embIdx);
      if (sim > bestSim) { bestSim = sim; bestPair = [cards[i], cards[j]]; }
      if (sim < worstSim) { worstSim = sim; worstPair = [cards[i], cards[j]]; }
    }
  }

  let html = '';
  if (bestPair) {
    const pmi = getPMI(bestPair[0].title, bestPair[1].title);
    const pmiNote = pmi > 0 ? ` · PMI +${pmi.toFixed(1)}` : '';
    html += `<div class="rb-hint rb-hint-best">Best pairing: <strong>${bestPair[0].title}</strong> + <strong>${bestPair[1].title}</strong> (${(bestSim * 100).toFixed(0)}% similar${pmiNote})</div>`;
  }
  if (worstPair && worstSim < 0) {
    html += `<div class="rb-hint rb-hint-worst">Clash: <strong>${worstPair[0].title}</strong> + <strong>${worstPair[1].title}</strong> (${(worstSim * 100).toFixed(0)}%)</div>`;
  }
  // Highest PMI pair (may differ from highest similarity)
  if (pmiLookup && cards.length >= 2) {
    let bestPMIPair = null, bestPMI = -Infinity;
    for (let i = 0; i < cards.length; i++) {
      for (let j = i + 1; j < cards.length; j++) {
        const p = getPMI(cards[i].title, cards[j].title);
        if (p > bestPMI) { bestPMI = p; bestPMIPair = [cards[i], cards[j]]; }
      }
    }
    if (bestPMIPair && bestPMI > 0) {
      html += `<div class="rb-hint rb-hint-comp">Classic combo: <strong>${bestPMIPair[0].title}</strong> + <strong>${bestPMIPair[1].title}</strong> (PMI +${bestPMI.toFixed(1)})</div>`;
    }
  }
  el.innerHTML = html;
  el.classList.remove("hidden");
}

function hideHints() { document.getElementById("rb-hints").classList.add("hidden"); }

// ── Complementarity Suggestions ────────────────────────────

function getPMI(a, b) {
  if (!pmiLookup) return 0;
  return pmiLookup.get(`${a}|${b}`) || 0;
}

function suggestComplements(selectedTitles) {
  if (!pmiLookup || selectedTitles.length === 0) return [];

  const selSet = new Set(selectedTitles);
  const scores = new Map();

  // For each unselected ingredient, compute average PMI with all selected
  for (const card of allCards) {
    if (selSet.has(card.title)) continue;
    let sum = 0, count = 0;
    for (const sel of selectedTitles) {
      const pmi = getPMI(card.title, sel);
      if (pmi !== 0) { sum += pmi; count++; }
    }
    if (count > 0) {
      scores.set(card.title, sum / count);
    }
  }

  // Sort by average PMI descending
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([title, score]) => ({ title, score }));
}

function updateSuggestions() {
  const el = document.getElementById("rb-suggestions");
  if (!el) return;
  if (selected.size === 0 || !pmiLookup) {
    el.classList.add("hidden");
    return;
  }

  const suggestions = suggestComplements([...selected]);
  if (suggestions.length === 0) {
    el.classList.add("hidden");
    return;
  }

  const items = suggestions.map(s => {
    const card = allCards.find(c => c.title === s.title);
    const cat = FOOD_CATEGORIES[card?.category] || {};
    const w = wiki?.foods?.[s.title] || {};
    return `<div class="rb-suggest-chip" data-title="${s.title}">
      ${w.thumb ? `<img class="rb-sel-thumb" src="${w.thumb}" alt="${s.title}">` : `<span class="rb-sel-icon">${cat.icon || "?"}</span>`}
      <span class="rb-sel-name">${s.title}</span>
      <span class="rb-suggest-score">+${s.score.toFixed(1)}</span>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="rb-suggest-label">Suggested complements</div><div class="rb-suggest-list">${items}</div>`;
  el.classList.remove("hidden");

  el.querySelectorAll(".rb-suggest-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      toggleSelect(chip.dataset.title);
    });
  });
}

// ── History ─────────────────────────────────────────────────

function saveDish() {
  if (selected.size < 3) return;
  const titles = [...selected];
  const cards = titles.map(t => allCards.find(c => c.title === t)).filter(Boolean);
  const score = coherenceScore(cards.map(c => c.embIdx));
  const { grade } = gradeScore(score);
  history.unshift({ names: titles, score, grade });
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

loadData();

document.getElementById("rb-search").addEventListener("input", (e) => {
  searchTerm = e.target.value;
  applyFilters();
});

document.getElementById("rb-clear").addEventListener("click", clearSelection);

document.getElementById("rb-save").addEventListener("click", () => {
  if (selected.size >= 3) {
    saveDish();
    clearSelection();
  }
});

document.getElementById("rb-cat-all").addEventListener("click", () => {
  activeCategories = new Set(Object.keys(FOOD_CATEGORIES));
  document.querySelectorAll("#rb-cat-chips .filter-chip").forEach(c => c.classList.add("active"));
  applyFilters();
});

document.getElementById("rb-cat-none").addEventListener("click", () => {
  activeCategories.clear();
  document.querySelectorAll("#rb-cat-chips .filter-chip").forEach(c => c.classList.remove("active"));
  applyFilters();
});
