// ── Arch — construction card draw page ───────────────────────
import { STRUCTURAL_SYSTEMS, ARCH_POOL } from "./arch-pool.js";
import { fetchArticleData, RARITY_LABELS } from "./shared.js";

let deck = [];
let loading = false;
const history = [];

function shuffleDeck() {
  deck = ARCH_POOL.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

// ── Helpers ─────────────────────────────────────────────────

const ERA_LABELS = {
  ancient: "Ancient", medieval: "Medieval", renaissance: "Renaissance",
  industrial: "Industrial", modern: "Modern",
};

const MAT_LABELS = {
  stone: "Stone", brick: "Brick", timber: "Timber", iron: "Iron",
  steel: "Steel", concrete: "Concrete", composite: "Composite",
};

function strengthBar(val, max = 10) {
  const pct = (val / max) * 100;
  return `<div class="arch-bar"><div class="arch-bar-fill" style="width:${pct}%"></div></div>`;
}

// ── Rendering ───────────────────────────────────────────────

function renderCard(title, system, props, page) {
  const sys = STRUCTURAL_SYSTEMS[system] || {};
  const rarity = props.rarity || "common";

  return `
    <div class="arch-card rarity-${rarity}">
      <div class="arch-card-inner">
        ${page?.thumbnail
          ? `<img class="arch-card-img" src="${page.thumbnail.source}" alt="${title}">`
          : `<div class="arch-card-no-img">${sys.icon || "?"}</div>`}
        <div class="arch-card-sys" style="color:${sys.color || '#888'}">${sys.name || system} — ${RARITY_LABELS[rarity]}</div>
        <div class="arch-card-title">${title.replace(/ \(.*\)$/, "")}</div>
      </div>
    </div>`;
}

function showDetail(d, page) {
  const el = document.getElementById("arch-detail");
  const sys = STRUCTURAL_SYSTEMS[d.system] || {};
  const rarity = d.props.rarity || "common";
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(d.title.replace(/ /g, "_"))}`;
  const displayTitle = d.title.replace(/ \(.*\)$/, "");

  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="arch-detail-card rarity-${rarity}">
      <button class="arch-detail-close">&times;</button>
      ${page?.thumbnail
        ? `<img class="arch-detail-img" src="${page.thumbnail.source}" alt="${displayTitle}">`
        : `<div class="arch-detail-no-img">${sys.icon || "?"}</div>`}
      <div class="arch-detail-sys" style="color:${sys.color || '#888'}">${sys.name || d.system} — ${RARITY_LABELS[rarity]}</div>
      <div class="arch-detail-title">${displayTitle}</div>
      <div class="arch-detail-props">
        <span>${MAT_LABELS[d.props.material] || d.props.material}</span> · <span>${ERA_LABELS[d.props.era] || d.props.era}</span> · <span>${d.props.span}m span</span>
      </div>
      <div class="arch-detail-stats">
        <div class="arch-stat-row"><span class="arch-stat-label">Strength</span>${strengthBar(d.props.strength)}<span class="arch-stat-val">${d.props.strength}</span></div>
        <div class="arch-stat-row"><span class="arch-stat-label">Complexity</span>${strengthBar(d.props.complexity)}<span class="arch-stat-val">${d.props.complexity}</span></div>
      </div>
      <div class="arch-detail-extract">${page?.extract || ""}</div>
      <a class="arch-detail-link" href="${wikiUrl}" target="_blank">Wikipedia &rarr;</a>
    </div>`;

  el.querySelector(".arch-detail-close").addEventListener("click", () => el.classList.add("hidden"));
}

async function doDraw() {
  if (loading) return;
  loading = true;

  const cardsEl = document.getElementById("arch-cards");
  const detailEl = document.getElementById("arch-detail");
  detailEl.classList.add("hidden");

  cardsEl.innerHTML = `<div class="loading"><div class="spinner"></div><span>Drawing 6 structures...</span></div>`;

  const drawn = [];
  const seen = new Set();
  while (drawn.length < 6) {
    if (deck.length === 0) shuffleDeck();
    if (deck.length === 0) break;
    const pick = deck.pop();
    if (!seen.has(pick[0])) {
      seen.add(pick[0]);
      drawn.push({ title: pick[0], system: pick[1], props: pick[2] });
    }
  }

  if (drawn.length === 0) {
    cardsEl.innerHTML = `<div class="loading"><span>No structures available.</span></div>`;
    loading = false;
    return;
  }

  try {
    const titles = drawn.map(d => d.title);
    const pages = await fetchArticleData(titles);
    const pageMap = {};
    for (const p of Object.values(pages)) {
      if (p.pageid) pageMap[p.title] = p;
    }

    cardsEl.innerHTML = drawn.map((d, i) => {
      const page = pageMap[d.title] || Object.values(pages).find(p => p.title === d.title);
      return `<div class="arch-card-wrap" data-idx="${i}">${renderCard(d.title, d.system, d.props, page)}</div>`;
    }).join("");

    cardsEl.querySelectorAll(".arch-card-wrap").forEach(wrap => {
      wrap.style.cursor = "pointer";
      wrap.addEventListener("click", () => {
        const i = parseInt(wrap.dataset.idx);
        const d = drawn[i];
        const page = pageMap[d.title] || Object.values(pages).find(p => p.title === d.title);
        showDetail(d, page);
      });
    });

    for (const d of drawn) {
      history.unshift({ title: d.title, system: d.system, rarity: d.props.rarity });
    }
    renderHistory();
  } catch (err) {
    console.error(err);
    cardsEl.innerHTML = drawn.map((d, i) =>
      `<div class="arch-card-wrap" data-idx="${i}">${renderCard(d.title, d.system, d.props, null)}</div>`
    ).join("");
  }

  loading = false;
}

function renderHistory() {
  const el = document.getElementById("arch-history");
  if (history.length === 0) { el.innerHTML = ""; return; }

  const items = history.slice(0, 15).map(h => {
    const sys = STRUCTURAL_SYSTEMS[h.system] || {};
    return `<div class="arch-hist-item">
      <span class="arch-hist-dot" style="background:${sys.color || '#888'}"></span>
      <span class="arch-hist-title">${h.title.replace(/ \(.*\)$/, "")}</span>
      <span class="arch-hist-rarity rarity-${h.rarity}">${RARITY_LABELS[h.rarity]}</span>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="arch-hist-label">Previous draws</div>${items}`;
}

// ── Init ────────────────────────────────────────────────────
document.getElementById("arch-pack-count").textContent = `${ARCH_POOL.length} structures`;
document.getElementById("arch-draw").addEventListener("click", doDraw);
