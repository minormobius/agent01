// ── Tech — technology card draw page ─────────────────────────
import { TECH_ERAS, TECH_DOMAINS, TECH_POOL } from "../pools/tech-pool.js";
import { fetchArticleData, RARITY_LABELS } from "../core/shared.js";

let deck = [];
let loading = false;
const history = [];

function shuffleDeck() {
  deck = TECH_POOL.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

function formatYear(y) {
  if (y <= -1000000) return `~${Math.round(y / -1000)} kya`;
  if (y < 0) return `${-y} BCE`;
  return `${y} CE`;
}

// ── Rendering ───────────────────────────────────────────────

function renderCard(title, era, props, page) {
  const er = TECH_ERAS[era] || {};
  const dom = TECH_DOMAINS[props.domain] || {};
  const rarity = props.rarity || "common";
  const displayTitle = title.replace(/ \(.*\)$/, "");

  return `
    <div class="gem-card rarity-${rarity}">
      <div class="gem-card-inner">
        ${page?.thumbnail
          ? `<img class="gem-card-img" src="${page.thumbnail.source}" alt="${displayTitle}">`
          : `<div class="gem-card-no-img" style="color:${er.color || '#888'}">${dom.icon || "?"}</div>`}
        <div class="gem-card-sys" style="color:${er.color || '#888'}">${er.name || era} — ${RARITY_LABELS[rarity]}</div>
        <div class="gem-card-title">${displayTitle}</div>
      </div>
    </div>`;
}

function showDetail(d, page) {
  const el = document.getElementById("gem-detail");
  const er = TECH_ERAS[d.era] || {};
  const dom = TECH_DOMAINS[d.props.domain] || {};
  const rarity = d.props.rarity || "common";
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(d.title.replace(/ /g, "_"))}`;
  const displayTitle = d.title.replace(/ \(.*\)$/, "");
  const statusCls = d.props.status || "alive";

  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="gem-detail-card rarity-${rarity}">
      <button class="gem-detail-close">&times;</button>
      ${page?.thumbnail
        ? `<img class="gem-detail-img" src="${page.thumbnail.source}" alt="${displayTitle}">`
        : `<div class="gem-detail-no-img" style="color:${er.color || '#888'}">${dom.icon || "?"}</div>`}
      <div class="gem-detail-sys" style="color:${er.color || '#888'}">${er.name || d.era} — ${RARITY_LABELS[rarity]}</div>
      <div class="gem-detail-title">${displayTitle}<span class="tech-status ${statusCls}">${statusCls}</span></div>
      <div class="gem-detail-year">${formatYear(d.props.year)} · ${dom.name || d.props.domain} · Complexity ${d.props.complexity}/10</div>
      <div class="gem-detail-props">
        <span>${er.range || ""}</span> · <span>${dom.icon || ""} ${dom.name || d.props.domain}</span>
      </div>
      ${d.props.prereqs.length > 0
        ? `<div class="gem-detail-prereqs">Requires: <span>${d.props.prereqs.map(p => p.replace(/ \(.*\)$/, "")).join("</span>, <span>")}</span></div>`
        : ""}
      <div class="gem-detail-extract">${page?.extract || ""}</div>
      <a class="gem-detail-link" href="${wikiUrl}" target="_blank">Wikipedia &rarr;</a>
    </div>`;

  el.querySelector(".gem-detail-close").addEventListener("click", () => el.classList.add("hidden"));
}

async function doDraw() {
  if (loading) return;
  loading = true;

  const cardsEl = document.getElementById("gem-cards");
  const detailEl = document.getElementById("gem-detail");
  detailEl.classList.add("hidden");

  cardsEl.innerHTML = `<div class="loading"><div class="spinner"></div><span>Drawing 6 technologies...</span></div>`;

  const drawn = [];
  const seen = new Set();
  while (drawn.length < 6) {
    if (deck.length === 0) shuffleDeck();
    if (deck.length === 0) break;
    const pick = deck.pop();
    if (!seen.has(pick[0])) {
      seen.add(pick[0]);
      drawn.push({ title: pick[0], era: pick[1], props: pick[2] });
    }
  }

  if (drawn.length === 0) {
    cardsEl.innerHTML = `<div class="loading"><span>No technologies available.</span></div>`;
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
      return `<div class="gem-card-wrap" data-idx="${i}">${renderCard(d.title, d.era, d.props, page)}</div>`;
    }).join("");

    cardsEl.querySelectorAll(".gem-card-wrap").forEach(wrap => {
      wrap.style.cursor = "pointer";
      wrap.addEventListener("click", () => {
        const i = parseInt(wrap.dataset.idx);
        const d = drawn[i];
        const page = pageMap[d.title] || Object.values(pages).find(p => p.title === d.title);
        showDetail(d, page);
      });
    });

    for (const d of drawn) {
      history.unshift({ title: d.title, era: d.era, rarity: d.props.rarity });
    }
    renderHistory();
  } catch (err) {
    console.error(err);
    cardsEl.innerHTML = drawn.map((d, i) =>
      `<div class="gem-card-wrap" data-idx="${i}">${renderCard(d.title, d.era, d.props, null)}</div>`
    ).join("");
  }

  loading = false;
}

function renderHistory() {
  const el = document.getElementById("gem-history");
  if (history.length === 0) { el.innerHTML = ""; return; }

  const items = history.slice(0, 15).map(h => {
    const er = TECH_ERAS[h.era] || {};
    return `<div class="gem-hist-item">
      <span class="gem-hist-dot" style="background:${er.color || '#888'}"></span>
      <span class="gem-hist-title">${h.title.replace(/ \(.*\)$/, "")}</span>
      <span class="gem-hist-rarity rarity-${h.rarity}">${RARITY_LABELS[h.rarity]}</span>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="gem-hist-label">Previous draws</div>${items}`;
}

// ── Init ────────────────────────────────────────────────────
document.getElementById("gem-pack-count").textContent = `${TECH_POOL.length} technologies`;
document.getElementById("gem-draw").addEventListener("click", doDraw);
