import { CATEGORIES, POOL, BINS } from "./pool.js";

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

// ── Pick 5 articles — category-balanced ───────────────────────
// Pick a random bin first, then a random article from that bin.
// Ensures category diversity even though bins have wildly different sizes.
const BIN_KEYS = Object.keys(BINS);

function pickPack(seed, count = 5) {
  const rng = mulberry32(seed);
  const used = new Set();
  const picks = [];
  for (let i = 0; i < count; i++) {
    // Pick a random bin (avoid repeating bins if possible)
    let binKey;
    let attempts = 0;
    do {
      binKey = BIN_KEYS[Math.floor(rng() * BIN_KEYS.length)];
      attempts++;
    } while (picks.some((p) => p[1] === binKey) && attempts < 30);

    const [start, binCount] = BINS[binKey];
    // Pick a random article from that bin (avoid duplicates)
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

// ── Wikipedia API (light data only — stats are pre-computed) ──
const WIKI_API = "https://en.wikipedia.org/w/api.php";

async function fetchArticleData(titles) {
  const params = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "extracts|pageimages",
    exintro: "1",
    explaintext: "1",
    exsentences: "4",
    piprop: "thumbnail",
    pithumbsize: "400",
    format: "json",
    origin: "*",
  });

  const res = await fetch(`${WIKI_API}?${params}`);
  if (!res.ok) throw new Error("Wikipedia API request failed");
  const data = await res.json();
  return data.query?.pages || {};
}

// ── Rarity ───────────────────────────────────────────────────

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
    // Pool entries: [title, category, {atk, def, spc, spd, hp, rarity}]
    const titles = picks.map(([t]) => t);

    // Only fetch extracts + thumbnails from Wikipedia (stats are pre-computed)
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

// ══════════════════════════════════════════════════════════════
// TAB NAVIGATION
// ══════════════════════════════════════════════════════════════

function initTabs() {
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById(`tab-${target}`).classList.add("active");
    });
  });
}

// ══════════════════════════════════════════════════════════════
// I'M FEELING LUCKY — full catalog, shuffle-through
// ══════════════════════════════════════════════════════════════

let luckyLoading = false;
const luckyHistory = [];
let luckyDeck = [];

function shuffleDeck() {
  luckyDeck = [...POOL];
  for (let i = luckyDeck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [luckyDeck[i], luckyDeck[j]] = [luckyDeck[j], luckyDeck[i]];
  }
}

const DEFAULT_STATS = { atk: 50, def: 50, spc: 50, spd: 50, hp: 500, rarity: "common" };

function drawFromDeck() {
  if (luckyDeck.length === 0) shuffleDeck();
  const pick = luckyDeck.pop();
  return { title: pick[0], category: pick[1], stats: pick[2] || DEFAULT_STATS };
}

shuffleDeck();

async function doLucky() {
  if (luckyLoading) return;
  luckyLoading = true;

  const btn = document.getElementById("lucky-btn");
  const result = document.getElementById("lucky-result");

  btn.classList.add("spinning");

  try {
    result.innerHTML = `<div class="loading"><div class="spinner"></div><span>Drawing from ${POOL.length.toLocaleString()} articles... (${luckyDeck.length} remaining in deck)</span></div>`;

    const { title, category, stats } = drawFromDeck();
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

// ══════════════════════════════════════════════════════════════
// WIKINATOMY DOCS
// ══════════════════════════════════════════════════════════════

function renderDocs() {
  const container = document.getElementById("docs-content");

  const categoryData = [
    { key: "LIFE_SCI", l4: 1180, l5: 5900, desc: "Biology, zoology, botany, ecology, genetics, organisms. The living world from cells to ecosystems." },
    { key: "MEDICINE", l4: 290, l5: 1450, desc: "Diseases, treatments, pharmacology, anatomy, public health. The science of keeping organisms alive." },
    { key: "PHYS_SCI", l4: 626, l5: 3100, desc: "Physics, chemistry, materials science. The fundamental forces and substances of the universe." },
    { key: "EARTH", l4: 273, l5: 1200, desc: "Geology, meteorology, oceanography, climate. The planet as a system." },
    { key: "COSMOS", l4: 205, l5: 900, desc: "Astronomy, astrophysics, space exploration. Everything beyond the atmosphere." },
    { key: "MATH", l4: 298, l5: 1500, desc: "Pure and applied mathematics, statistics, logic. The language underneath all other sciences." },
    { key: "TECH", l4: 726, l5: 3200, desc: "Engineering, computing, inventions, infrastructure. How we build and connect things." },
    { key: "GEO", l4: 1204, l5: 6000, desc: "Countries, cities, landforms, bodies of water. The physical and political map of the world." },
    { key: "HISTORY", l4: 486, l5: 2300, desc: "Events, eras, civilizations, archaeological sites. The timeline of human activity." },
    { key: "MILITARY", l4: 344, l5: 1800, desc: "Battles, wars, treaties, military figures. The history of organized conflict." },
    { key: "SOCIETY", l4: 1286, l5: 6400, desc: "Politics, economics, law, social movements, institutions. How humans organize themselves." },
    { key: "PHILOSOPHY", l4: 513, l5: 2600, desc: "Philosophy, world religions, theology, ethics. The questions that precede all answers." },
    { key: "LITERATURE", l4: 636, l5: 3200, desc: "Novels, poetry, epics, languages, literary movements. The written canon." },
    { key: "VISUAL_ARTS", l4: 178, l5: 900, desc: "Painting, sculpture, architecture, design. What humans make to be looked at." },
    { key: "MUSIC", l4: 525, l5: 2600, desc: "Genres, composers, instruments, performance traditions. What humans make to be heard." },
    { key: "FILM", l4: 218, l5: 1800, desc: "Cinema, photography, broadcasting, media. The technologies of story and image." },
    { key: "SPORTS", l4: 404, l5: 2300, desc: "Athletic competitions, board games, recreation. Structured play and physical contest." },
    { key: "EVERYDAY", l4: 365, l5: 1800, desc: "Food, drink, clothing, tools, customs. The material culture of daily existence." },
  ];

  const totalL4 = categoryData.reduce((s, c) => s + c.l4, 0);
  const totalL5 = categoryData.reduce((s, c) => s + c.l5, 0);
  const maxL5 = Math.max(...categoryData.map((c) => c.l5));

  const categoryRows = categoryData.map((c) => {
    const cat = CATEGORIES[c.key];
    const pct = ((c.l5 / totalL5) * 100).toFixed(1);
    const barW = ((c.l5 / maxL5) * 100).toFixed(0);
    return `
      <div class="doc-cat-row">
        <div class="doc-cat-header">
          <span class="doc-cat-icon">${cat.icon}</span>
          <span class="doc-cat-name" style="color:${cat.color}">${cat.name}</span>
          <span class="doc-cat-counts">${c.l4.toLocaleString()} L4 · ${c.l5.toLocaleString()} L5</span>
        </div>
        <div class="doc-cat-bar-track">
          <div class="doc-cat-bar" style="width:${barW}%;background:${cat.color}"></div>
        </div>
        <div class="doc-cat-desc">${c.desc}</div>
      </div>
    `;
  }).join("");

  // Count pool rarity distribution
  const poolRarity = {};
  for (const [, , stats] of POOL) {
    const r = stats?.rarity || "common";
    poolRarity[r] = (poolRarity[r] || 0) + 1;
  }
  const poolTotal = POOL.length;

  container.innerHTML = `
    <div class="doc-section">
      <h2 class="doc-title">The Wikinatomy</h2>
      <p class="doc-intro">
        Wikipedia's editors maintain a curated hierarchy of the encyclopedia's most important articles:
        <strong>Level 4</strong> (10,000 articles) and <strong>Level 5</strong> (50,000 articles).
        These aren't random — they're the consensus of tens of thousands of editors on what constitutes
        the essential map of human knowledge.
      </p>
      <p class="doc-intro">
        We've mapped that structure onto <strong>18 categories</strong> — the Wikinatomy.
        It's the skeleton of what humans think is worth knowing, derived from the actual
        distribution of vital articles across Wikipedia's sub-lists.
      </p>
    </div>

    <div class="doc-section">
      <h3 class="doc-section-title">The 18 Bins</h3>
      <div class="doc-totals">
        <div class="doc-total">
          <div class="doc-total-value">${totalL4.toLocaleString()}</div>
          <div class="doc-total-label">Level 4 articles</div>
        </div>
        <div class="doc-total">
          <div class="doc-total-value">${totalL5.toLocaleString()}</div>
          <div class="doc-total-label">Level 5 articles</div>
        </div>
        <div class="doc-total">
          <div class="doc-total-value">18</div>
          <div class="doc-total-label">categories</div>
        </div>
      </div>
      <div class="doc-categories">${categoryRows}</div>
    </div>

    <div class="doc-section">
      <h3 class="doc-section-title">How It Works</h3>
      <div class="doc-explainer">
        <div class="doc-explain-block">
          <div class="doc-explain-heading">Wikipedia's Vital Articles</div>
          <p>The Vital Articles project is a nested hierarchy: Level 1 (10 articles) → Level 2 (100) → Level 3 (1,000) → Level 4 (10,000) → Level 5 (50,000). Each level is a strict superset of the one above. Articles are nominated, debated, and voted on by editors.</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">The Original 11 Bins</div>
          <p>Wikipedia organizes its vital articles into 11 top-level topics: People, History, Geography, Arts, Philosophy &amp; Religion, Everyday Life, Society &amp; Social Sciences, Biology &amp; Health Sciences, Physical Sciences, Technology, and Mathematics. Each has sub-topics with explicit quotas.</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">Our 18-Bin Redistribution</div>
          <p>We split the 11 Wikipedia bins into 18 to capture more meaningful gameplay distinctions. "Science & Nature" becomes Life Sciences + Physical Sciences + Earth &amp; Environment + Medicine. "Arts" becomes Literature + Visual Arts + Music + Film. People are distributed into the categories they're known for — Einstein goes to Physical Sciences, Shakespeare to Literature.</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">The Distribution Problem</div>
          <p>The distribution is inherently lumpy. Society &amp; Politics, Geography, and Life Sciences have 3–6× more articles than Space or Visual Arts. This is real — it reflects what humans collectively consider important enough to document extensively. Daily packs draw from a curated pool (${poolTotal} articles, 30 per bin) for category balance. Lucky mode loads the full catalog — every scored article in the database.</p>
        </div>
      </div>
    </div>

    <div class="doc-section">
      <h3 class="doc-section-title">Card Stats</h3>
      <div class="doc-explainer">
        <div class="doc-explain-block">
          <div class="doc-explain-heading">Percentile Normalization</div>
          <p>Stats are computed by ranking each article against the full pool of ~6,800 Featured Articles. An ATK of 75 means this article has more outgoing links than 75% of all Featured Articles. This guarantees the full 1–99 range and natural spread — no more clustering.</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">ATK — Links Out</div>
          <p>Outgoing wikilinks from the article, percentile-ranked. How much this article reaches into the rest of Wikipedia.</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">DEF — Links Here</div>
          <p>Incoming wikilinks from other articles, percentile-ranked. How central and well-cited this topic is.</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">SPC — External References</div>
          <p>External citations and references, percentile-ranked. How well-sourced from outside Wikipedia.</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">SPD — Recent Edits</div>
          <p>Edits in the last 12 months, percentile-ranked. How actively maintained and alive the topic is.</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">HP — Depth</div>
          <p>Article length, percentile-ranked (100–999 scale). How extensively documented the topic is.</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">Rarity</div>
          <p>Assigned by total power percentile across the pool. Common (bottom 45%), Uncommon (next 30%), Rare (next 15%), Legendary (top 10%). Current pool: ${poolRarity.common || 0} Common, ${poolRarity.uncommon || 0} Uncommon, ${poolRarity.rare || 0} Rare, ${poolRarity.legendary || 0} Legendary.</p>
        </div>
      </div>
    </div>

    <div class="doc-section doc-sources">
      <h3 class="doc-section-title">Sources</h3>
      <ul>
        <li><a href="https://en.wikipedia.org/wiki/Wikipedia:Vital_articles/Level/4" target="_blank">Vital Articles Level 4</a> — the 10,000-article list</li>
        <li><a href="https://en.wikipedia.org/wiki/Wikipedia:Vital_articles/Level/5" target="_blank">Vital Articles Level 5</a> — the 50,000-article list</li>
        <li><a href="https://en.wikipedia.org/wiki/Wikipedia:Vital_articles" target="_blank">Vital Articles project</a> — overview of the hierarchy</li>
        <li><a href="https://www.mediawiki.org/wiki/API:Properties" target="_blank">MediaWiki API: Properties</a> — all available prop modules</li>
        <li><a href="https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html" target="_blank">Wikimedia Analytics API</a> — pageview statistics</li>
      </ul>
    </div>
  `;
}

// ══════════════════════════════════════════════════════════════
// ALCHEMY TAB — embedding-space combination
// ══════════════════════════════════════════════════════════════

let alchemyEmbeddings = null; // Float32Array, shape (N, dim)
let alchemyIndex = null; // {titles, bins, dim, count}
let alchemyLoaded = false;
let alchemyLoading = false;
let slotA = null; // {idx, title, category, stats}
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
  // Find stats from POOL if available
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
    <div class="alchemy-filled rarity-${rarity}">
      <div class="alchemy-card-cat" style="color:${cat?.color || '#888'}">${cat?.icon || ''} ${cat?.name || data.category}</div>
      <div class="alchemy-card-title">${data.title}</div>
      <div class="alchemy-card-rarity">${RARITY_LABELS[rarity]}</div>
    </div>
  `;
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

  // Centroid = normalize(A + B)
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

  // Find nearest neighbor via dot product (embeddings are L2-normalized)
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
  const cat = CATEGORIES[resultBin];

  // Fetch extract + thumbnail for the result
  showAlchemyResult(resultTitle, resultBin, resultStats, resultRarity, bestSim);

  // Add to history
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

  const items = alchemyHistoryList.slice(0, 10).map((h) => {
    const cat = CATEGORIES[h.category];
    return `<div class="alchemy-history-item">
      <span class="alchemy-hist-formula">${h.a} + ${h.b}</span>
      <span class="alchemy-hist-arrow">=</span>
      <span class="alchemy-hist-result">${h.result}</span>
      <span class="alchemy-hist-dot" style="background:${cat?.color || '#888'}"></span>
    </div>`;
  }).join("");

  container.innerHTML = `<div class="alchemy-history-label">Previous combinations</div>${items}`;
}

function initAlchemy() {
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
}

// ── Init ──────────────────────────────────────────────────────
function init() {
  initTabs();
  renderDocs();
  initAlchemy();
  todaySeed(); // set date display

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

// Lucky button
document.getElementById("lucky-btn").addEventListener("click", doLucky);

// Escape to close detail
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    document.getElementById("card-detail").classList.add("hidden");
  }
});

init();
