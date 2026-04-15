// ── Gem — crystal card draw page ─────────────────────────────
import { CRYSTAL_SYSTEMS, GEM_POOL } from "../pools/gem-pool.js";
import { fetchArticleData, RARITY_LABELS } from "../core/shared.js";

let deck = [];
let loading = false;
const history = [];

function shuffleDeck() {
  deck = GEM_POOL.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
}

// ── Rendering ───────────────────────────────────────────────

function renderCard(title, system, props, page) {
  const sys = CRYSTAL_SYSTEMS[system] || {};
  const rarity = props.rarity || "common";
  const [r, g, b] = props.color;
  const cssColor = `rgb(${(r*255)|0}, ${(g*255)|0}, ${(b*255)|0})`;

  return `
    <div class="gem-card rarity-${rarity}">
      <div class="gem-card-inner">
        ${page?.thumbnail
          ? `<img class="gem-card-img" src="${page.thumbnail.source}" alt="${title}">`
          : `<div class="gem-card-no-img" style="color:${cssColor}">${sys.icon || "?"}</div>`}
        <div class="gem-card-sys" style="color:${sys.color || '#888'}">${sys.name || system} — ${RARITY_LABELS[rarity]}</div>
        <div class="gem-card-title">${title.replace(/ \(.*\)$/, "")}</div>
      </div>
    </div>`;
}

function showDetail(d, page) {
  const el = document.getElementById("gem-detail");
  const sys = CRYSTAL_SYSTEMS[d.system] || {};
  const rarity = d.props.rarity || "common";
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(d.title.replace(/ /g, "_"))}`;
  const displayTitle = d.title.replace(/ \(.*\)$/, "");
  const [r, g, b] = d.props.color;
  const cssColor = `rgb(${(r*255)|0}, ${(g*255)|0}, ${(b*255)|0})`;

  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="gem-detail-card rarity-${rarity}">
      <button class="gem-detail-close">&times;</button>
      ${page?.thumbnail
        ? `<img class="gem-detail-img" src="${page.thumbnail.source}" alt="${displayTitle}">`
        : `<div class="gem-detail-no-img" style="color:${cssColor}">${sys.icon || "?"}</div>`}
      <div class="gem-detail-sys" style="color:${sys.color || '#888'}">${sys.name || d.system} — ${RARITY_LABELS[rarity]}</div>
      <div class="gem-detail-title">${displayTitle}</div>
      <div class="gem-detail-props">
        <span>Mohs ${d.props.hardness}</span> · <span>${d.props.luster}</span> · <span>${d.props.opacity < 0.3 ? "transparent" : d.props.opacity < 0.6 ? "translucent" : "opaque"}</span>
      </div>
      <div class="gem-detail-extract">${page?.extract || ""}</div>
      <a class="gem-detail-link" href="${wikiUrl}" target="_blank">Wikipedia &rarr;</a>
      <a class="gem-detail-link gem-grow-link" href="grow.html?name=${encodeURIComponent(d.title)}&sys=${d.system}&c=${d.props.color.join(',')}&o=${d.props.opacity}&l=${d.props.luster}&h=${d.props.hardness}">Grow crystal &rarr;</a>
      <a class="gem-detail-link" href="gemwoo.html?name=${encodeURIComponent(d.title)}&sys=${d.system}&c=${d.props.color.join(',')}&o=${d.props.opacity}&l=${d.props.luster}&h=${d.props.hardness}&r=${d.props.rarity}">Gem woo &rarr;</a>
    </div>`;

  el.querySelector(".gem-detail-close").addEventListener("click", () => el.classList.add("hidden"));
}

async function doDraw() {
  if (loading) return;
  loading = true;

  const cardsEl = document.getElementById("gem-cards");
  const detailEl = document.getElementById("gem-detail");
  detailEl.classList.add("hidden");

  cardsEl.innerHTML = `<div class="loading"><div class="spinner"></div><span>Drawing 6 crystals...</span></div>`;

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
    cardsEl.innerHTML = `<div class="loading"><span>No crystals available.</span></div>`;
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
      return `<div class="gem-card-wrap" data-idx="${i}">${renderCard(d.title, d.system, d.props, page)}</div>`;
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
      history.unshift({ title: d.title, system: d.system, rarity: d.props.rarity });
    }
    renderHistory();
  } catch (err) {
    console.error(err);
    cardsEl.innerHTML = drawn.map((d, i) =>
      `<div class="gem-card-wrap" data-idx="${i}">${renderCard(d.title, d.system, d.props, null)}</div>`
    ).join("");
  }

  loading = false;
}

function renderHistory() {
  const el = document.getElementById("gem-history");
  if (history.length === 0) { el.innerHTML = ""; return; }

  const items = history.slice(0, 15).map(h => {
    const sys = CRYSTAL_SYSTEMS[h.system] || {};
    return `<div class="gem-hist-item">
      <span class="gem-hist-dot" style="background:${sys.color || '#888'}"></span>
      <span class="gem-hist-title">${h.title.replace(/ \(.*\)$/, "")}</span>
      <span class="gem-hist-rarity rarity-${h.rarity}">${RARITY_LABELS[h.rarity]}</span>
    </div>`;
  }).join("");

  el.innerHTML = `<div class="gem-hist-label">Previous draws</div>${items}`;
}

// ── Init ────────────────────────────────────────────────────
document.getElementById("gem-pack-count").textContent = `${GEM_POOL.length} crystals`;
document.getElementById("gem-draw").addEventListener("click", doDraw);
