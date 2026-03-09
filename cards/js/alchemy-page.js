// ── Alchemy page — embedding-space combination ─────────────
import { CATEGORIES, POOL, loadCatalog, fetchArticleData, showCardPreview, RARITY_LABELS } from "./shared.js";

let alchemyEmbeddings = null;
let alchemyIndex = null;
let alchemyLoaded = false;
let alchemyLoading = false;
let slotA = null;
let slotB = null;
const alchemyHistoryList = [];

async function loadAlchemy() {
  if (alchemyLoaded || alchemyLoading) return;
  alchemyLoading = true;
  const status = document.getElementById("alchemy-status");
  status.textContent = "Loading embeddings...";

  try {
    const [indexRes, binRes] = await Promise.all([
      fetch("data/embeddings.json"),
      fetch("data/embeddings.bin"),
    ]);

    if (!indexRes.ok || !binRes.ok) {
      status.textContent = "Alchemy requires embedding data — coming soon.";
      status.classList.add("alchemy-unavailable");
      document.getElementById("draw-a").disabled = true;
      document.getElementById("draw-b").disabled = true;
      alchemyLoading = false;
      return;
    }

    alchemyIndex = await indexRes.json();
    const buf = await binRes.arrayBuffer();
    alchemyEmbeddings = new Float32Array(buf);
    alchemyLoaded = true;
    status.textContent = `${alchemyIndex.count.toLocaleString()} articles loaded (${alchemyIndex.dim}d embeddings)`;
  } catch (err) {
    console.error("Failed to load embeddings:", err);
    status.textContent = "Failed to load embeddings.";
  }
  alchemyLoading = false;
}

function alchemyDrawRandom() {
  if (!alchemyLoaded) return null;
  const idx = Math.floor(Math.random() * alchemyIndex.count);
  const title = alchemyIndex.titles[idx];
  const bin = alchemyIndex.bins[idx];
  const poolEntry = POOL.find((p) => p[0] === title);
  const stats = poolEntry ? poolEntry[2] : { atk: 50, def: 50, spc: 50, spd: 50, hp: 500, rarity: "common" };
  return { idx, title, category: bin, stats };
}

function renderSlot(slotId, data) {
  const content = document.getElementById(`${slotId}-content`);
  if (!data) {
    content.innerHTML = `<div class="alchemy-empty">?</div>`;
    return;
  }
  const cat = CATEGORIES[data.category];
  const rarity = data.stats?.rarity || "common";
  content.innerHTML = `
    <div class="alchemy-filled rarity-${rarity}" style="cursor:pointer" title="Click to preview">
      <div class="alchemy-card-cat" style="color:${cat?.color || '#888'}">${cat?.icon || ''} ${cat?.name || data.category}</div>
      <div class="alchemy-card-title">${data.title}</div>
      <div class="alchemy-card-rarity">${RARITY_LABELS[rarity]}</div>
    </div>
  `;
  content.querySelector(".alchemy-filled").onclick = () => {
    showCardPreview("alchemy-preview", data.title, data.category, data.stats);
  };
}

function updateCombineButton() {
  const btn = document.getElementById("combine-btn");
  if (slotA && slotB) {
    btn.classList.remove("hidden");
  } else {
    btn.classList.add("hidden");
  }
}

function alchemyCombine() {
  if (!slotA || !slotB || !alchemyLoaded) return;

  const dim = alchemyIndex.dim;
  const vecA = alchemyEmbeddings.subarray(slotA.idx * dim, (slotA.idx + 1) * dim);
  const vecB = alchemyEmbeddings.subarray(slotB.idx * dim, (slotB.idx + 1) * dim);

  const centroid = new Float32Array(dim);
  let norm = 0;
  for (let i = 0; i < dim; i++) {
    centroid[i] = vecA[i] + vecB[i];
    norm += centroid[i] * centroid[i];
  }
  norm = Math.sqrt(norm);
  if (norm > 0) {
    for (let i = 0; i < dim; i++) centroid[i] /= norm;
  }

  let bestIdx = -1;
  let bestSim = -Infinity;
  const n = alchemyIndex.count;
  for (let i = 0; i < n; i++) {
    if (i === slotA.idx || i === slotB.idx) continue;
    let dot = 0;
    const offset = i * dim;
    for (let j = 0; j < dim; j++) {
      dot += alchemyEmbeddings[offset + j] * centroid[j];
    }
    if (dot > bestSim) {
      bestSim = dot;
      bestIdx = i;
    }
  }

  if (bestIdx < 0) return;

  const resultTitle = alchemyIndex.titles[bestIdx];
  const resultBin = alchemyIndex.bins[bestIdx];
  const poolEntry = POOL.find((p) => p[0] === resultTitle);
  const resultStats = poolEntry ? poolEntry[2] : { atk: 50, def: 50, spc: 50, spd: 50, hp: 500, rarity: "common" };
  const resultRarity = resultStats?.rarity || "common";

  showAlchemyResult(resultTitle, resultBin, resultStats, resultRarity, bestSim);

  alchemyHistoryList.unshift({
    a: slotA.title,
    b: slotB.title,
    result: resultTitle,
    sim: bestSim,
    category: resultBin,
    rarity: resultRarity,
  });
  renderAlchemyHistory();
}

async function showAlchemyResult(title, bin, stats, rarity, similarity) {
  const result = document.getElementById("alchemy-result");
  const cat = CATEGORIES[bin];
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

  result.innerHTML = `<div class="loading"><div class="spinner"></div><span>Fetching result...</span></div>`;

  try {
    const pages = await fetchArticleData([title]);
    const page = Object.values(pages).find((p) => p.pageid);

    result.innerHTML = `
      <div class="alchemy-result-card rarity-${rarity}">
        <div class="alchemy-result-eq">
          <span class="alchemy-eq-term">${slotA.title}</span>
          <span class="alchemy-eq-op">+</span>
          <span class="alchemy-eq-term">${slotB.title}</span>
          <span class="alchemy-eq-op">=</span>
        </div>
        <div class="alchemy-result-inner">
          ${page?.thumbnail ? `<img class="alchemy-result-img" src="${page.thumbnail.source}" alt="${title}">` : `<div class="alchemy-result-no-img">${cat?.icon || '?'}</div>`}
          <div class="alchemy-result-cat" style="color:${cat?.color || '#888'}">${cat?.name || bin} — ${RARITY_LABELS[rarity]}</div>
          <div class="alchemy-result-title">${title}</div>
          <div class="alchemy-result-extract">${page?.extract || ""}</div>
          <div class="alchemy-result-sim">Similarity: ${(similarity * 100).toFixed(1)}%</div>
          <div class="alchemy-result-stats">
            <div class="stat"><div class="stat-label">ATK</div><div class="stat-value">${stats.atk}</div></div>
            <div class="stat"><div class="stat-label">DEF</div><div class="stat-value">${stats.def}</div></div>
            <div class="stat"><div class="stat-label">SPC</div><div class="stat-value">${stats.spc}</div></div>
            <div class="stat"><div class="stat-label">SPD</div><div class="stat-value">${stats.spd}</div></div>
            <div class="stat"><div class="stat-label">HP</div><div class="stat-value">${stats.hp}</div></div>
          </div>
          <a class="alchemy-result-link" href="${wikiUrl}" target="_blank">Read on Wikipedia &rarr;</a>
        </div>
      </div>
    `;
  } catch (err) {
    result.innerHTML = `<div class="alchemy-result-card rarity-${rarity}">
      <div class="alchemy-result-eq">
        <span class="alchemy-eq-term">${slotA.title}</span>
        <span class="alchemy-eq-op">+</span>
        <span class="alchemy-eq-term">${slotB.title}</span>
        <span class="alchemy-eq-op">=</span>
      </div>
      <div class="alchemy-result-inner">
        <div class="alchemy-result-cat" style="color:${cat?.color || '#888'}">${cat?.name || bin}</div>
        <div class="alchemy-result-title">${title}</div>
        <div class="alchemy-result-sim">Similarity: ${(similarity * 100).toFixed(1)}%</div>
        <a class="alchemy-result-link" href="${wikiUrl}" target="_blank">Read on Wikipedia &rarr;</a>
      </div>
    </div>`;
  }
}

function renderAlchemyHistory() {
  const container = document.getElementById("alchemy-history");
  if (alchemyHistoryList.length === 0) {
    container.innerHTML = "";
    return;
  }

  const items = alchemyHistoryList.slice(0, 10).map((h, i) => {
    const cat = CATEGORIES[h.category];
    return `<div class="alchemy-history-item" data-hi="${i}" style="cursor:pointer">
      <span class="alchemy-hist-formula">${h.a} + ${h.b}</span>
      <span class="alchemy-hist-arrow">=</span>
      <span class="alchemy-hist-result">${h.result}</span>
      <span class="alchemy-hist-dot" style="background:${cat?.color || '#888'}"></span>
    </div>`;
  }).join("");

  container.innerHTML = `<div class="alchemy-history-label">Previous combinations</div>${items}`;

  container.querySelectorAll(".alchemy-history-item").forEach(el => {
    el.onclick = () => {
      const h = alchemyHistoryList[parseInt(el.dataset.hi)];
      const poolEntry = POOL.find(p => p[0] === h.result);
      const stats = poolEntry ? poolEntry[2] : { atk: 50, def: 50, spc: 50, spd: 50, hp: 500, rarity: h.rarity };
      showCardPreview("alchemy-preview", h.result, h.category, stats);
    };
  });
}

// ── Init ──────────────────────────────────────────────────────
loadCatalog();

document.getElementById("draw-a").addEventListener("click", async () => {
  if (!alchemyLoaded) await loadAlchemy();
  if (!alchemyLoaded) return;
  slotA = alchemyDrawRandom();
  renderSlot("slot-a", slotA);
  updateCombineButton();
});

document.getElementById("draw-b").addEventListener("click", async () => {
  if (!alchemyLoaded) await loadAlchemy();
  if (!alchemyLoaded) return;
  slotB = alchemyDrawRandom();
  renderSlot("slot-b", slotB);
  updateCombineButton();
});

document.getElementById("combine-btn").addEventListener("click", alchemyCombine);
