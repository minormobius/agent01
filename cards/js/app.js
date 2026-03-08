import { CATEGORIES, POOL } from "./pool.js";

// ── Seeded PRNG (mulberry32) ──────────────────────────────────
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}

// ── Daily seed ────────────────────────────────────────────────
function todaySeed() {
  const d = new Date();
  const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  document.getElementById("pack-date").textContent = dateStr;
  return hashString(dateStr);
}

// ── Pick 5 articles from pool ─────────────────────────────────
function pickPack(seed, count = 5) {
  const rng = mulberry32(seed);
  const pool = [...POOL];
  const picks = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(rng() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}

// ── Wikipedia API ─────────────────────────────────────────────
const WIKI_API = "https://en.wikipedia.org/w/api.php";

async function fetchArticleData(titles) {
  const params = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "extracts|pageimages|info|langlinks",
    exintro: "1",
    explaintext: "1",
    exsentences: "4",
    piprop: "thumbnail",
    pithumbsize: "400",
    inprop: "length",
    lllimit: "500",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${WIKI_API}?${params}`);
  if (!res.ok) throw new Error("Wikipedia API request failed");
  const data = await res.json();
  return data.query?.pages || {};
}

async function fetchPageLinks(titles) {
  const params = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "links",
    pllimit: "500",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${WIKI_API}?${params}`);
  if (!res.ok) return {};
  const data = await res.json();
  return data.query?.pages || {};
}

// ── Stat derivation ──────────────────────────────────────────
function deriveStats(page) {
  const len = page.length || 5000;
  const langlinks = page.langlinks?.length || 0;
  const links = page.links?.length || 0;

  // ATK: links density, scaled 20-99
  const linkDensity = links / Math.max(1, len / 1000);
  const atk = Math.min(99, Math.max(20, Math.round(linkDensity * 8 + 30)));

  // DEF: langlinks (global staying power), scaled 20-99
  const def = Math.min(99, Math.max(20, Math.round(langlinks * 0.5 + 25)));

  // HP: article length, scaled 100-999
  const hp = Math.min(999, Math.max(100, Math.round(len / 80)));

  return { atk, def, hp };
}

function deriveRarity(stats) {
  const power = stats.atk + stats.def + stats.hp / 10;
  if (power >= 160) return "legendary";
  if (power >= 130) return "rare";
  if (power >= 100) return "uncommon";
  return "common";
}

const RARITY_LABELS = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};

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
          <div class="card-extract">${extract || "Loading..."}</div>
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
            <div class="stat-label">HP</div>
            <div class="stat-value">${stats.hp}</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Click to flip
  container.addEventListener("click", (e) => {
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

async function openPack() {
  const seed = todaySeed();
  const picks = pickPack(seed);
  const packScreen = document.getElementById("pack-screen");
  const cardsScreen = document.getElementById("cards-screen");
  const grid = document.getElementById("card-grid");
  const pack = document.getElementById("pack");

  // Check localStorage for today's cached pack data
  const cacheKey = `wiki-cards-${seed}`;
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(cacheKey));
  } catch {}

  // Animate pack opening
  pack.classList.add("opening");
  document.getElementById("open-btn").style.display = "none";

  await new Promise((r) => setTimeout(r, 700));

  packScreen.classList.remove("active");
  cardsScreen.classList.add("active");

  if (cached && cached.length === 5) {
    // Use cached data
    packCards = cached;
    grid.innerHTML = "";
    packCards.forEach((cd, i) => grid.appendChild(createCardElement(cd, i)));
    document.getElementById("flip-all-btn").classList.remove("hidden");
    return;
  }

  // Show loading state
  grid.innerHTML = `<div class="loading"><div class="spinner"></div><span>Fetching articles from Wikipedia...</span></div>`;

  try {
    const titles = picks.map(([t]) => t);
    const categories = Object.fromEntries(picks);

    // Fetch article data and links in parallel
    const [articlePages, linkPages] = await Promise.all([
      fetchArticleData(titles),
      fetchPageLinks(titles),
    ]);

    // Merge link data into article data
    const pages = articlePages;
    for (const [id, linkData] of Object.entries(linkPages)) {
      if (pages[id]) {
        pages[id].links = linkData.links;
      }
    }

    // Build card data, matching by title
    packCards = [];
    for (const [title, category] of picks) {
      // Find page by title (Wikipedia API normalizes titles)
      const page = Object.values(pages).find(
        (p) =>
          p.title === title ||
          p.title?.replace(/ /g, "_") === title.replace(/ /g, "_")
      );

      if (page && page.pageid) {
        const stats = deriveStats(page);
        const rarity = deriveRarity(stats);
        packCards.push({
          title: page.title,
          category,
          extract: page.extract || "",
          thumbnail: page.thumbnail?.source || null,
          stats,
          rarity,
        });
      } else {
        // Fallback for missing pages
        const stats = { atk: 40, def: 40, hp: 200 };
        packCards.push({
          title,
          category,
          extract: "Article data unavailable.",
          thumbnail: null,
          stats,
          rarity: "common",
        });
      }
    }

    // Cache for today
    try {
      localStorage.setItem(cacheKey, JSON.stringify(packCards));
    } catch {}

    grid.innerHTML = "";
    packCards.forEach((cd, i) => grid.appendChild(createCardElement(cd, i)));
    document.getElementById("flip-all-btn").classList.remove("hidden");
  } catch (err) {
    grid.innerHTML = `<div class="loading"><span>Failed to fetch articles. Try refreshing.</span></div>`;
    console.error(err);
  }
}

// ── Init ──────────────────────────────────────────────────────
function init() {
  const seed = todaySeed();

  // Check if already opened today
  const cacheKey = `wiki-cards-${seed}`;
  let cached = null;
  try {
    cached = JSON.parse(localStorage.getItem(cacheKey));
  } catch {}

  if (cached && cached.length === 5) {
    // Already opened — show cards directly
    const packScreen = document.getElementById("pack-screen");
    const cardsScreen = document.getElementById("cards-screen");
    const grid = document.getElementById("card-grid");

    packScreen.classList.remove("active");
    cardsScreen.classList.add("active");

    packCards = cached;
    grid.innerHTML = "";
    packCards.forEach((cd, i) => {
      const el = createCardElement(cd, i);
      el.classList.add("revealed"); // Already seen
      grid.appendChild(el);
    });
    document.getElementById("new-pack-btn").classList.remove("hidden");
    return;
  }

  // Fresh pack — show pack screen
  document.getElementById("open-btn").addEventListener("click", openPack);
  document.getElementById("pack").addEventListener("click", openPack);
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

// Escape to close detail
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("card-detail").classList.add("hidden");
  }
});

init();
