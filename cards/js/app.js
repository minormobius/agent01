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

  const linkDensity = links / Math.max(1, len / 1000);
  const atk = Math.min(99, Math.max(20, Math.round(linkDensity * 8 + 30)));
  const def = Math.min(99, Math.max(20, Math.round(langlinks * 0.5 + 25)));
  // log2 scaling: 10K→505, 30K→566, 80K→619, 200K→669, 500K→719
  const hp = Math.min(999, Math.max(100, Math.round(Math.log2(Math.max(1, len)) * 38)));

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

    const [articlePages, linkPages] = await Promise.all([
      fetchArticleData(titles),
      fetchPageLinks(titles),
    ]);

    const pages = articlePages;
    for (const [id, linkData] of Object.entries(linkPages)) {
      if (pages[id]) {
        pages[id].links = linkData.links;
      }
    }

    packCards = [];
    for (const [title, category] of picks) {
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
// I'M FEELING LUCKY
// ══════════════════════════════════════════════════════════════

let luckyLoading = false;
const luckyHistory = [];

function pickRandomFromPool() {
  const pick = POOL[Math.floor(Math.random() * POOL.length)];
  return { title: pick[0], category: pick[1] };
}

async function doLucky() {
  if (luckyLoading) return;
  luckyLoading = true;

  const btn = document.getElementById("lucky-btn");
  const result = document.getElementById("lucky-result");

  btn.classList.add("spinning");
  result.innerHTML = `<div class="loading"><div class="spinner"></div><span>Drawing from the pool...</span></div>`;

  try {
    const { title, category } = pickRandomFromPool();

    const [articlePages, linkPages] = await Promise.all([
      fetchArticleData([title]),
      fetchPageLinks([title]),
    ]);

    const pages = articlePages;
    for (const [id, linkData] of Object.entries(linkPages)) {
      if (pages[id]) pages[id].links = linkData.links;
    }

    const page = Object.values(pages).find((p) => p.pageid);

    if (page) {
      const stats = deriveStats(page);
      const rarity = deriveRarity(stats);
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
          <p>The distribution is inherently lumpy. Society &amp; Politics, Geography, and Life Sciences have 3–6× more articles than Space or Visual Arts. This is real — it reflects what humans collectively consider important enough to document extensively. For the card game, we use the curated pool (20 articles per bin) so every category shows up equally in daily packs.</p>
        </div>
      </div>
    </div>

    <div class="doc-section">
      <h3 class="doc-section-title">Card Stats</h3>
      <div class="doc-explainer">
        <div class="doc-explain-block">
          <div class="doc-explain-heading">ATK — Link Density</div>
          <p>Internal links per 1,000 bytes of article length. Measures how connected an article is to the rest of Wikipedia. High ATK = the article is a nexus point in the knowledge graph.</p>
          <p class="doc-formula"><code>min(99, max(20, round(links / max(1, length/1000) * 8 + 30)))</code></p>
          <p class="doc-source">Source: <code>prop=links</code> (pllimit=500) + <code>prop=info</code> (inprop=length)</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">DEF — Global Reach</div>
          <p>Number of language versions of the article. Measures how universally recognized the topic is. High DEF = the topic transcends language and culture.</p>
          <p class="doc-formula"><code>min(99, max(20, round(langlinks * 0.5 + 25)))</code></p>
          <p class="doc-source">Source: <code>prop=langlinks</code> (lllimit=500)</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">HP — Depth</div>
          <p>Article length in bytes (scaled). Measures how much there is to say. High HP = the topic has been extensively documented by Wikipedia's editors.</p>
          <p class="doc-formula"><code>min(999, max(100, round(log2(length) × 38)))</code></p>
          <p class="doc-source">Source: <code>prop=info</code> (inprop=length)</p>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">Rarity</div>
          <p>Derived from ATK + DEF + HP/10. Common (&lt;100), Uncommon (100–129), Rare (130–159), Legendary (160+). All stats are fetched live from Wikipedia — rarity is earned, not assigned.</p>
        </div>
      </div>
    </div>

    <div class="doc-section">
      <h3 class="doc-section-title">Wikipedia API Metadata</h3>
      <p class="doc-intro">Every card is built from live Wikipedia API data. Here's what we fetch now and what's available for future stats.</p>
      <div class="doc-explainer">
        <div class="doc-explain-block">
          <div class="doc-explain-heading">Currently Fetched</div>
          <table class="doc-table">
            <tr><th>Prop</th><th>Fields</th><th>Used for</th></tr>
            <tr><td><code>extracts</code></td><td>Intro text (4 sentences, plaintext)</td><td>Card body text</td></tr>
            <tr><td><code>pageimages</code></td><td>Thumbnail URL (400px)</td><td>Card image</td></tr>
            <tr><td><code>info</code></td><td>Article byte length</td><td>HP stat</td></tr>
            <tr><td><code>langlinks</code></td><td>Count of language editions</td><td>DEF stat</td></tr>
            <tr><td><code>links</code></td><td>Internal wiki links (up to 500)</td><td>ATK stat</td></tr>
          </table>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">Available — Not Yet Used</div>
          <table class="doc-table">
            <tr><th>Prop</th><th>What it returns</th><th>Stat potential</th></tr>
            <tr><td><code>pageviews</code></td><td>Daily views (last 1–60 days)</td><td>Fame / popularity</td></tr>
            <tr><td><code>linkshere</code></td><td>Pages linking TO this article</td><td>Influence (backlink count)</td></tr>
            <tr><td><code>contributors</code></td><td>Registered editors + anon count</td><td>Community effort</td></tr>
            <tr><td><code>revisions</code></td><td>Edit timestamps, sizes, users</td><td>Edit velocity, article age</td></tr>
            <tr><td><code>extlinks</code></td><td>External URLs referenced</td><td>Real-world source density</td></tr>
            <tr><td><code>categories</code></td><td>Category memberships</td><td>Taxonomic breadth</td></tr>
            <tr><td><code>images</code></td><td>Images used on page</td><td>Visual richness</td></tr>
            <tr><td><code>templates</code></td><td>Templates used</td><td>Structural complexity</td></tr>
            <tr><td><code>pageprops</code></td><td>Wikidata ID, disambig flag</td><td>Classification</td></tr>
            <tr><td><code>pageterms</code></td><td>Wikidata short description</td><td>Subtitle text</td></tr>
          </table>
        </div>
        <div class="doc-explain-block">
          <div class="doc-explain-heading">Wikimedia REST API (separate endpoint)</div>
          <p>Per-article pageview time series with daily/monthly granularity, available since July 2015. Endpoint: <code>wikimedia.org/api/rest_v1/metrics/pageviews/per-article/{project}/{access}/{agent}/{article}/{granularity}/{start}/{end}</code></p>
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

// ── Init ──────────────────────────────────────────────────────
function init() {
  initTabs();
  renderDocs();
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
