// ── Lucky page — full catalog shuffle with filters ──────────
import { CATEGORIES, POOL, loadCatalog, fetchArticleData, RARITY_LABELS } from "../core/shared.js";

let luckyLoading = false;
const luckyHistory = [];
let luckyDeck = [];

// ── Filter state ────────────────────────────────────────────
const activeCats = new Set(Object.keys(CATEGORIES));
const activeRarities = new Set(["common", "uncommon", "rare", "legendary"]);

function getFilteredPool() {
  return POOL.filter(([, cat, stats]) =>
    activeCats.has(cat) && activeRarities.has(stats?.rarity || "common")
  );
}

function shuffleDeck() {
  luckyDeck = getFilteredPool();
  for (let i = luckyDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [luckyDeck[i], luckyDeck[j]] = [luckyDeck[j], luckyDeck[i]];
  }
}

function updatePoolCount() {
  const filtered = getFilteredPool().length;
  const el = document.getElementById("filter-pool-count");
  el.textContent = `${filtered} of ${POOL.length}`;
}

function renderFilterChips() {
  const catContainer = document.getElementById("cat-chips");
  const rarityContainer = document.getElementById("rarity-chips");

  catContainer.innerHTML = Object.entries(CATEGORIES).map(([key, cat]) => {
    const count = POOL.filter(([, c]) => c === key).length;
    const isActive = activeCats.has(key);
    return `<button class="filter-chip${isActive ? " active" : ""}" data-cat="${key}"
      style="--chip-color:${cat.color}">
      <span class="filter-chip-icon">${cat.icon}</span>
      ${cat.name}<span class="filter-chip-count">${count}</span>
    </button>`;
  }).join("");

  const rarityColors = { common: "", uncommon: "rarity-uncommon", rare: "rarity-rare", legendary: "rarity-legendary" };
  rarityContainer.innerHTML = Object.entries(RARITY_LABELS).map(([key, label]) => {
    const count = POOL.filter(([,, s]) => (s?.rarity || "common") === key).length;
    const isActive = activeRarities.has(key);
    return `<button class="filter-chip ${rarityColors[key]}${isActive ? " active" : ""}" data-rarity="${key}">
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
  luckyDeck = [];
}

const DEFAULT_STATS = { atk: 50, def: 50, spc: 50, spd: 50, hp: 500, rarity: "common" };

function drawFromDeck() {
  if (luckyDeck.length === 0) shuffleDeck();
  if (luckyDeck.length === 0) return null;
  const pick = luckyDeck.pop();
  return { title: pick[0], category: pick[1], stats: pick[2] || DEFAULT_STATS };
}

async function doLucky() {
  if (luckyLoading) return;

  const filtered = getFilteredPool();
  if (filtered.length === 0) {
    document.getElementById("lucky-result").innerHTML =
      `<div class="loading"><span>No articles match your filters. Adjust categories or rarity.</span></div>`;
    return;
  }

  luckyLoading = true;
  const btn = document.getElementById("lucky-btn");
  const result = document.getElementById("lucky-result");

  btn.classList.add("spinning");

  try {
    result.innerHTML = `<div class="loading"><div class="spinner"></div><span>Drawing from ${filtered.length.toLocaleString()} articles... (${luckyDeck.length} remaining in deck)</span></div>`;

    const draw = drawFromDeck();
    if (!draw) {
      result.innerHTML = `<div class="loading"><span>No articles match your filters.</span></div>`;
      btn.classList.remove("spinning");
      luckyLoading = false;
      return;
    }
    const { title, category, stats } = draw;
    const rarity = stats?.rarity || "common";

    const articlePages = await fetchArticleData([title]);
    const page = Object.values(articlePages).find((p) => p.pageid);

    if (page) {
      const cat = CATEGORIES[category];
      const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}`;

      result.innerHTML = `
        <div class="lucky-card rarity-${rarity}">
          <div class="lucky-card-inner">
            ${page.thumbnail ? `<img class="lucky-image" src="${page.thumbnail.source}" alt="${page.title}">` : `<div class="lucky-no-image">${cat.icon}</div>`}
            <div class="lucky-category" style="color:${cat.color}">${cat.name} — ${RARITY_LABELS[rarity]}</div>
            <div class="lucky-title">${page.title}</div>
            <div class="lucky-extract">${page.extract || ""}</div>
            <div class="lucky-stats">
              <div class="stat"><div class="stat-label">ATK</div><div class="stat-value">${stats.atk}</div></div>
              <div class="stat"><div class="stat-label">DEF</div><div class="stat-value">${stats.def}</div></div>
              <div class="stat"><div class="stat-label">SPC</div><div class="stat-value">${stats.spc}</div></div>
              <div class="stat"><div class="stat-label">SPD</div><div class="stat-value">${stats.spd}</div></div>
              <div class="stat"><div class="stat-label">HP</div><div class="stat-value">${stats.hp}</div></div>
            </div>
            <a class="lucky-wiki-link" href="${wikiUrl}" target="_blank">Read on Wikipedia &rarr;</a>
          </div>
        </div>
      `;

      luckyHistory.unshift({ title: page.title, category, rarity, thumbnail: page.thumbnail?.source });
      renderLuckyHistory();
    } else {
      result.innerHTML = `<div class="loading"><span>Couldn't load article data. Try again.</span></div>`;
    }
  } catch (err) {
    console.error(err);
    result.innerHTML = `<div class="loading"><span>Network error. Try again.</span></div>`;
  }

  btn.classList.remove("spinning");
  luckyLoading = false;
}

function renderLuckyHistory() {
  const container = document.getElementById("lucky-history");
  if (luckyHistory.length <= 1) {
    container.innerHTML = "";
    return;
  }

  const items = luckyHistory.slice(1, 11).map((h) => {
    const cat = CATEGORIES[h.category];
    return `<div class="lucky-history-item">
      <span class="lucky-history-dot" style="background:${cat.color}"></span>
      <span class="lucky-history-title">${h.title}</span>
      <span class="lucky-history-rarity rarity-${h.rarity}">${RARITY_LABELS[h.rarity]}</span>
    </div>`;
  }).join("");

  container.innerHTML = `<div class="lucky-history-label">Previous rolls</div>${items}`;
}

function initFilters() {
  renderFilterChips();
  updatePoolCount();

  document.getElementById("filter-toggle").addEventListener("click", () => {
    const panel = document.getElementById("filter-panel");
    const chevron = document.getElementById("filter-chevron");
    panel.classList.toggle("hidden");
    chevron.classList.toggle("open");
  });

  document.getElementById("cat-select-all").addEventListener("click", () => {
    Object.keys(CATEGORIES).forEach(k => activeCats.add(k));
    document.querySelectorAll("#cat-chips .filter-chip").forEach(c => c.classList.add("active"));
    onFilterChange();
  });
  document.getElementById("cat-select-none").addEventListener("click", () => {
    activeCats.clear();
    document.querySelectorAll("#cat-chips .filter-chip").forEach(c => c.classList.remove("active"));
    onFilterChange();
  });

  document.getElementById("rarity-select-all").addEventListener("click", () => {
    ["common", "uncommon", "rare", "legendary"].forEach(r => activeRarities.add(r));
    document.querySelectorAll("#rarity-chips .filter-chip").forEach(c => c.classList.add("active"));
    onFilterChange();
  });
  document.getElementById("rarity-select-none").addEventListener("click", () => {
    activeRarities.clear();
    document.querySelectorAll("#rarity-chips .filter-chip").forEach(c => c.classList.remove("active"));
    onFilterChange();
  });
}

// ── Init ──────────────────────────────────────────────────────
loadCatalog();
initFilters();
document.getElementById("lucky-btn").addEventListener("click", doLucky);
