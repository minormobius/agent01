// ── Wikinatomy page — category reference docs ───────────────
import { CATEGORIES, POOL } from "./pool.js";

const RARITY_LABELS = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};

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

renderDocs();
