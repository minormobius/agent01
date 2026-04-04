// ── Yum — food card draw page ────────────────────────────────
import { FOOD_CATEGORIES, FOOD_POOL } from "./yum-pool.js";
import { fetchArticleData, RARITY_LABELS } from "./shared.js";

const STAT_LABELS = {
  atk: "FLV",   // Flavor intensity
  def: "SHF",   // Shelf stability
  spc: "CUL",   // Cultural significance
  spd: "SPD",   // Prep speed
  hp:  "SAT",   // Satiety
};

let deck = [];
let loading = false;
const history = [];

// ── Filter state ────────────────────────────────────────────
const activeCats = new Set(Object.keys(FOOD_CATEGORIES));
const activeRarities = new Set(["common", "uncommon", "rare", "legendary"]);

function getFilteredPool() {
  return FOOD_POOL.filter(([, cat, stats]) =>
    activeCats.has(cat) && activeRarities.has(stats?.rarity || "common")
  );
}

function shuffleDeck() {
  deck = getFilteredPool().slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function updatePoolCount() {
  const filtered = getFilteredPool().length;
  document.getElementById("yum-pool-count").textContent = `${filtered} of ${FOOD_POOL.length}`;
  document.getElementById("yum-pack-count").textContent = `${FOOD_POOL.length} foods`;
}

// ── Rendering ───────────────────────────────────────────────

function renderCard(title, category, stats, page) {
  const cat = FOOD_CATEGORIES[category] || {};
  const rarity = stats?.rarity || "common";
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

  return `
    <div class="yum-card rarity-${rarity}">
      <div class="yum-card-inner">
        ${page?.thumbnail
          ? `<img class="yum-card-img" src="${page.thumbnail.source}" alt="${title}">`
          : `<div class="yum-card-no-img">${cat.icon || "?"}</div>`}
        <div class="yum-card-cat" style="color:${cat.color || '#888'}">${cat.name || category} — ${RARITY_LABELS[rarity]}</div>
        <div class="yum-card-title">${title}</div>
        <div class="yum-card-extract">${page?.extract || ""}</div>
        <div class="yum-card-stats">
          <div class="stat"><div class="stat-label">${STAT_LABELS.atk}</div><div class="stat-value">${stats.atk}</div></div>
          <div class="stat"><div class="stat-label">${STAT_LABELS.def}</div><div class="stat-value">${stats.def}</div></div>
          <div class="stat"><div class="stat-label">${STAT_LABELS.spc}</div><div class="stat-value">${stats.spc}</div></div>
          <div class="stat"><div class="stat-label">${STAT_LABELS.spd}</div><div class="stat-value">${stats.spd}</div></div>
          <div class="stat"><div class="stat-label">${STAT_LABELS.hp}</div><div class="stat-value">${stats.hp}</div></div>
        </div>
        <a class="yum-card-link" href="${wikiUrl}" target="_blank">Wikipedia &rarr;</a>
      </div>
    </div>`;
}

async function doDraw() {
  if (loading) return;

  const filtered = getFilteredPool();
  if (filtered.length === 0) {
    document.getElementById("yum-cards").innerHTML =
      `<div class="loading"><span>No foods match your filters.</span></div>`;
    return;
  }

  loading = true;
  const cardsEl = document.getElementById("yum-cards");
  const detailEl = document.getElementById("yum-detail");
  detailEl.classList.add("hidden");

  cardsEl.innerHTML = `<div class="loading"><div class="spinner"></div><span>Drawing 6 foods...</span></div>`;

  // Draw 6 unique cards
  const drawn = [];
  const seen = new Set();
  while (drawn.length < 6) {
    if (deck.length === 0) shuffleDeck();
    if (deck.length === 0) break;
    const pick = deck.pop();
    if (!seen.has(pick[0])) {
      seen.add(pick[0]);
      drawn.push({ title: pick[0], category: pick[1], stats: pick[2] });
    }
  }

  if (drawn.length === 0) {
    cardsEl.innerHTML = `<div class="loading"><span>No foods available.</span></div>`;
    loading = false;
    return;
  }

  // Fetch Wikipedia data for all 5
  try {
    const titles = drawn.map(d => d.title);
    const pages = await fetchArticleData(titles);

    // Map pages by title (Wikipedia may normalize titles)
    const pageMap = {};
    for (const p of Object.values(pages)) {
      if (p.pageid) pageMap[p.title] = p;
    }

    cardsEl.innerHTML = drawn.map((d, i) => {
      const page = pageMap[d.title] || Object.values(pages).find(p => p.title === d.title);
      return `<div class="yum-card-wrap" data-idx="${i}">${renderCard(d.title, d.category, d.stats, page)}</div>`;
    }).join("");

    // Click to expand
    cardsEl.querySelectorAll(".yum-card-wrap").forEach(wrap => {
      wrap.style.cursor = "pointer";
      wrap.addEventListener("click", () => {
        const i = parseInt(wrap.dataset.idx);
        const d = drawn[i];
        const page = pageMap[d.title] || Object.values(pages).find(p => p.title === d.title);
        showDetail(d, page);
      });
    });

    // Add to history
    for (const d of drawn) {
      history.unshift({ title: d.title, category: d.category, rarity: d.stats.rarity });
    }
    renderHistory();
  } catch (err) {
    console.error(err);
    // Fallback: render without Wikipedia data
    cardsEl.innerHTML = drawn.map((d, i) =>
      `<div class="yum-card-wrap" data-idx="${i}">${renderCard(d.title, d.category, d.stats, null)}</div>`
    ).join("");
  }

  loading = false;
}

function showDetail(d, page) {
  const el = document.getElementById("yum-detail");
  const cat = FOOD_CATEGORIES[d.category] || {};
  const rarity = d.stats?.rarity || "common";
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(d.title.replace(/ /g, "_"))}`;

  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="yum-detail-card rarity-${rarity}">
      <button class="yum-detail-close">&times;</button>
      ${page?.thumbnail
        ? `<img class="yum-detail-img" src="${page.thumbnail.source}" alt="${d.title}">`
        : `<div class="yum-detail-no-img">${cat.icon || "?"}</div>`}
      <div class="yum-detail-cat" style="color:${cat.color || '#888'}">${cat.name || d.category} — ${RARITY_LABELS[rarity]}</div>
      <div class="yum-detail-title">${d.title}</div>
      <div class="yum-detail-extract">${page?.extract || ""}</div>
      <div class="yum-detail-stats">
        <div class="stat"><div class="stat-label">${STAT_LABELS.atk}</div><div class="stat-value">${d.stats.atk}</div></div>
        <div class="stat"><div class="stat-label">${STAT_LABELS.def}</div><div class="stat-value">${d.stats.def}</div></div>
        <div class="stat"><div class="stat-label">${STAT_LABELS.spc}</div><div class="stat-value">${d.stats.spc}</div></div>
        <div class="stat"><div class="stat-label">${STAT_LABELS.spd}</div><div class="stat-value">${d.stats.spd}</div></div>
        <div class="stat"><div class="stat-label">${STAT_LABELS.hp}</div><div class="stat-value">${d.stats.hp}</div></div>
      </div>
      <a class="yum-detail-link" href="${wikiUrl}" target="_blank">Read on Wikipedia &rarr;</a>
    </div>`;

  el.querySelector(".yum-detail-close").addEventListener("click", () => el.classList.add("hidden"));
}

function renderHistory() {
  const el = document.getElementById("yum-history");
  if (history.length === 0) { el.innerHTML = ""; return; }

  const items = history.slice(0, 15).map(h => {
    const cat = FOOD_CATEGORIES[h.category] || {};
    return `<div class="yum-hist-item">
      <span class="yum-hist-dot" style="background:${cat.color || '#888'}"></span>
      <span class="yum-hist-title">${h.title}</span>
      <span class="yum-hist-rarity rarity-${h.rarity}">${RARITY_LABELS[h.rarity]}</span>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="yum-hist-label">Previous draws</div>${items}`;
}

// ── Filters ─────────────────────────────────────────────────

function renderFilterChips() {
  const catContainer = document.getElementById("yum-cat-chips");
  const rarityContainer = document.getElementById("yum-rarity-chips");

  catContainer.innerHTML = Object.entries(FOOD_CATEGORIES).map(([key, cat]) => {
    const count = FOOD_POOL.filter(([, c]) => c === key).length;
    return `<button class="filter-chip active" data-cat="${key}"
      style="--chip-color:${cat.color}">
      <span class="filter-chip-icon">${cat.icon}</span>
      ${cat.name}<span class="filter-chip-count">${count}</span>
    </button>`;
  }).join("");

  const rarityColors = { common: "", uncommon: "rarity-uncommon", rare: "rarity-rare", legendary: "rarity-legendary" };
  rarityContainer.innerHTML = Object.entries(RARITY_LABELS).map(([key, label]) => {
    const count = FOOD_POOL.filter(([,, s]) => (s?.rarity || "common") === key).length;
    return `<button class="filter-chip ${rarityColors[key]} active" data-rarity="${key}">
      ${label}<span class="filter-chip-count">${count}</span>
    </button>`;
  }).join("");

  catContainer.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.cat;
      if (activeCats.has(key)) activeCats.delete(key); else activeCats.add(key);
      chip.classList.toggle("active");
      onFilterChange();
    });
  });

  rarityContainer.querySelectorAll(".filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      const key = chip.dataset.rarity;
      if (activeRarities.has(key)) activeRarities.delete(key); else activeRarities.add(key);
      chip.classList.toggle("active");
      onFilterChange();
    });
  });
}

function onFilterChange() {
  updatePoolCount();
  deck = [];
}

function initFilters() {
  renderFilterChips();
  updatePoolCount();

  document.getElementById("yum-filter-toggle").addEventListener("click", () => {
    document.getElementById("yum-filter-panel").classList.toggle("hidden");
    document.getElementById("yum-chevron").classList.toggle("open");
  });

  document.getElementById("yum-cat-all").addEventListener("click", () => {
    Object.keys(FOOD_CATEGORIES).forEach(k => activeCats.add(k));
    document.querySelectorAll("#yum-cat-chips .filter-chip").forEach(c => c.classList.add("active"));
    onFilterChange();
  });
  document.getElementById("yum-cat-none").addEventListener("click", () => {
    activeCats.clear();
    document.querySelectorAll("#yum-cat-chips .filter-chip").forEach(c => c.classList.remove("active"));
    onFilterChange();
  });
  document.getElementById("yum-rarity-all").addEventListener("click", () => {
    ["common", "uncommon", "rare", "legendary"].forEach(r => activeRarities.add(r));
    document.querySelectorAll("#yum-rarity-chips .filter-chip").forEach(c => c.classList.add("active"));
    onFilterChange();
  });
  document.getElementById("yum-rarity-none").addEventListener("click", () => {
    activeRarities.clear();
    document.querySelectorAll("#yum-rarity-chips .filter-chip").forEach(c => c.classList.remove("active"));
    onFilterChange();
  });
}

// ── Init ────────────────────────────────────────────────────
initFilters();
document.getElementById("yum-draw").addEventListener("click", doDraw);
