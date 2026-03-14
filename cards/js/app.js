// ── Hub page: Daily Pack + navigation grid ──────────────────
import { CATEGORIES, POOL, BINS } from "./pool.js";
import { loadCatalog } from "./pds-catalog.js";
import { mulberry32, hashString, fetchArticleData, RARITY_LABELS } from "./shared.js";

// ── Daily seed ────────────────────────────────────────────────
function todaySeed() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  document.getElementById("pack-date").textContent = dateStr;
  return hashString(dateStr);
}

// ── Pick 5 articles — category-balanced ───────────────────────
const BIN_KEYS = Object.keys(BINS);

function pickPack(seed, count = 5) {
  const rng = mulberry32(seed);
  const used = new Set();
  const picks = [];
  for (let i = 0; i < count; i++) {
    let binKey;
    let attempts = 0;
    do {
      binKey = BIN_KEYS[Math.floor(rng() * BIN_KEYS.length)];
      attempts++;
    } while (picks.some((p) => p[1] === binKey) && attempts < 30);

    const [start, binCount] = BINS[binKey];
    let idx;
    attempts = 0;
    do {
      idx = start + Math.floor(rng() * binCount);
      attempts++;
    } while (used.has(idx) && attempts < 50);
    used.add(idx);
    picks.push(POOL[idx]);
  }
  return picks;
}

// ── Card rendering ────────────────────────────────────────────

function createCardElement(cardData, index) {
  const { title, category, extract, thumbnail, stats, rarity } = cardData;
  const cat = CATEGORIES[category];

  const container = document.createElement("div");
  container.className = `card-container rarity-${rarity}`;
  container.style.setProperty("--cat-color", cat.color);

  container.innerHTML = `
    <div class="card">
      <div class="card-face card-back">
        <div class="card-back-pattern"></div>
      </div>
      <div class="card-face card-front">
        <div class="card-category" style="background:${cat.color}">
          <span>${cat.name}</span>
          <span class="card-rarity">${RARITY_LABELS[rarity]}</span>
        </div>
        <div class="card-image-wrap">
          ${thumbnail ? `<img src="${thumbnail}" alt="${title}" loading="lazy">` : `<div class="no-image">${cat.icon}</div>`}
        </div>
        <div class="card-body">
          <div class="card-title">${title}</div>
          <div class="card-extract">${extract || ""}</div>
        </div>
        <div class="card-stats">
          <div class="stat">
            <div class="stat-label">ATK</div>
            <div class="stat-value">${stats.atk}</div>
          </div>
          <div class="stat">
            <div class="stat-label">DEF</div>
            <div class="stat-value">${stats.def}</div>
          </div>
          <div class="stat">
            <div class="stat-label">SPC</div>
            <div class="stat-value">${stats.spc}</div>
          </div>
          <div class="stat">
            <div class="stat-label">SPD</div>
            <div class="stat-value">${stats.spd}</div>
          </div>
          <div class="stat">
            <div class="stat-label">HP</div>
            <div class="stat-value">${stats.hp}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  container.addEventListener("click", () => {
    if (!container.classList.contains("revealed")) {
      container.classList.add("revealed");
      checkAllRevealed();
    } else {
      showDetail(cardData);
    }
  });

  return container;
}

function showDetail(cardData) {
  const { title, category, extract, thumbnail, stats, rarity } = cardData;
  const cat = CATEGORIES[category];
  const detail = document.getElementById("card-detail");
  const content = document.getElementById("detail-content");

  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

  content.innerHTML = `
    ${thumbnail ? `<img class="detail-image" src="${thumbnail}" alt="${title}">` : ""}
    <div class="detail-category" style="color:${cat.color}">${cat.name} — ${RARITY_LABELS[rarity]}</div>
    <div class="detail-title">${title}</div>
    <div class="detail-extract">${extract || ""}</div>
    <div class="detail-stats">
      <div class="stat">
        <div class="detail-stat-label">ATK</div>
        <div class="detail-stat-value">${stats.atk}</div>
      </div>
      <div class="stat">
        <div class="detail-stat-label">DEF</div>
        <div class="detail-stat-value">${stats.def}</div>
      </div>
      <div class="stat">
        <div class="detail-stat-label">SPC</div>
        <div class="detail-stat-value">${stats.spc}</div>
      </div>
      <div class="stat">
        <div class="detail-stat-label">SPD</div>
        <div class="detail-stat-value">${stats.spd}</div>
      </div>
      <div class="stat">
        <div class="detail-stat-label">HP</div>
        <div class="detail-stat-value">${stats.hp}</div>
      </div>
    </div>
    <a class="detail-link" href="${wikiUrl}" target="_blank">Read on Wikipedia &rarr;</a>
  `;

  detail.classList.remove("hidden");
}

function checkAllRevealed() {
  const cards = document.querySelectorAll(".card-container");
  const revealed = document.querySelectorAll(".card-container.revealed");
  if (revealed.length === cards.length) {
    document.getElementById("flip-all-btn").classList.add("hidden");
    document.getElementById("new-pack-btn").classList.remove("hidden");
  }
}

// ── Pack opening flow ────────────────────────────────────────
let packCards = [];

async function openPack(seed) {
  if (seed === undefined) seed = todaySeed();
  const picks = pickPack(seed);
  const packScreen = document.getElementById("pack-screen");
  const cardsScreen = document.getElementById("cards-screen");
  const grid = document.getElementById("card-grid");
  const pack = document.getElementById("pack");

  pack.classList.add("opening");
  document.getElementById("open-btn").style.display = "none";

  await new Promise((r) => setTimeout(r, 700));

  packScreen.classList.remove("active");
  cardsScreen.classList.add("active");

  grid.innerHTML = `<div class="loading"><div class="spinner"></div><span>Fetching articles from Wikipedia...</span></div>`;

  try {
    const titles = picks.map(([t]) => t);
    const articlePages = await fetchArticleData(titles);

    packCards = [];
    for (const [title, category, stats] of picks) {
      const page = Object.values(articlePages).find(
        (p) =>
          p.title === title ||
          p.title?.replace(/ /g, "_") === title.replace(/ /g, "_")
      );

      packCards.push({
        title: page?.title || title,
        category,
        extract: page?.extract || "",
        thumbnail: page?.thumbnail?.source || null,
        stats: stats || { atk: 50, def: 50, spc: 50, spd: 50, hp: 500 },
        rarity: stats?.rarity || "common",
      });
    }

    grid.innerHTML = "";
    packCards.forEach((cd, i) => grid.appendChild(createCardElement(cd, i)));
    document.getElementById("flip-all-btn").classList.remove("hidden");
    document.getElementById("new-pack-btn").classList.add("hidden");
  } catch (err) {
    grid.innerHTML = `<div class="loading"><span>Failed to fetch articles. Try refreshing.</span></div>`;
    console.error(err);
  }
}

function rerollPack() {
  const seed = Date.now() ^ (Math.random() * 0xffffffff);
  const grid = document.getElementById("card-grid");
  grid.innerHTML = "";
  document.getElementById("flip-all-btn").classList.add("hidden");
  document.getElementById("new-pack-btn").classList.add("hidden");
  openPack(seed);
}

// ── Init ──────────────────────────────────────────────────────
function init() {
  todaySeed();
  loadCatalog();

  document.getElementById("open-btn").addEventListener("click", () => openPack());
  document.getElementById("pack").addEventListener("click", () => openPack());
}

// Close detail overlay
document.getElementById("close-detail").addEventListener("click", () => {
  document.getElementById("card-detail").classList.add("hidden");
});
document.getElementById("card-detail").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.classList.add("hidden");
  }
});

// Reveal all button
document.getElementById("flip-all-btn").addEventListener("click", () => {
  document.querySelectorAll(".card-container:not(.revealed)").forEach((c) => {
    c.classList.add("revealed");
  });
  checkAllRevealed();
});

// New pack / reroll button
document.getElementById("new-pack-btn").addEventListener("click", rerollPack);

// Escape to close detail
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("card-detail").classList.add("hidden");
  }
});

init();
