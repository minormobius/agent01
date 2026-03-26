/**
 * Library — Browse 6,879 deep-scored Wikipedia Featured Articles.
 * Lazy-loads deep-wikipedia.json on first tab visit.
 */
import { CATEGORIES } from "./pool.js";

const PAGE_SIZE = 40;
const RARITY_LABELS = { common: "Common", uncommon: "Uncommon", rare: "Rare", legendary: "Legendary" };

let articles = null;
let filtered = [];
let page = 0;
let activeBins = new Set();
let sortKey = "deep_score";
let sortAsc = false;
let searchQuery = "";

// ── Load ──────────────────────────────────────────────────────
async function loadArticles() {
  const resp = await fetch("data/deep-wikipedia.json");
  if (!resp.ok) throw new Error("Failed to load deep-wikipedia.json");
  const data = await resp.json();
  articles = data.articles;
  activeBins = new Set(articles.map(a => a.bin));
  applyFilters();
}

// ── Filter / Sort ─────────────────────────────────────────────
function applyFilters() {
  const q = searchQuery.toLowerCase();
  filtered = articles.filter(a => {
    if (!activeBins.has(a.bin)) return false;
    if (q && !a.title.toLowerCase().includes(q) && !(a.extract || "").toLowerCase().includes(q)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    let va = a[sortKey] ?? 0, vb = b[sortKey] ?? 0;
    if (sortKey === "title") { va = a.title; vb = b.title; }
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  page = 0;
}

// ── Render ────────────────────────────────────────────────────
function render() {
  const wrap = document.getElementById("lib-content");
  if (!articles) return;

  const start = page * PAGE_SIZE;
  const slice = filtered.slice(start, start + PAGE_SIZE);
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);

  // Bin counts
  const binCounts = {};
  articles.forEach(a => { binCounts[a.bin] = (binCounts[a.bin] || 0) + 1; });

  wrap.innerHTML = `
    <div class="lib-toolbar">
      <input class="lib-search" type="text" placeholder="Search articles..." value="${searchQuery}" id="lib-search">
      <div class="lib-sort">
        <select class="lib-sort-select" id="lib-sort">
          <option value="deep_score" ${sortKey === "deep_score" ? "selected" : ""}>Deep Score</option>
          <option value="title" ${sortKey === "title" ? "selected" : ""}>Title</option>
          <option value="length" ${sortKey === "length" ? "selected" : ""}>Article Length</option>
          <option value="extlinks_count" ${sortKey === "extlinks_count" ? "selected" : ""}>External Links</option>
        </select>
        <button class="lib-sort-dir" id="lib-sort-dir">${sortAsc ? "↑" : "↓"}</button>
      </div>
    </div>

    <div class="lib-bins" id="lib-bins">
      ${Object.entries(CATEGORIES).map(([key, cat]) => {
        const count = binCounts[key] || 0;
        if (count === 0) return "";
        const active = activeBins.has(key);
        return `<button class="lib-bin-chip${active ? " active" : ""}" data-bin="${key}" style="--bin-color:${cat.color}">
          ${cat.icon} ${cat.name} <span class="lib-bin-count">${count}</span>
        </button>`;
      }).join("")}
    </div>

    <div class="lib-meta">
      ${filtered.length.toLocaleString()} articles${totalPages > 1 ? ` — page ${page + 1} of ${totalPages}` : ""}
    </div>

    <div class="lib-grid" id="lib-grid">
      ${slice.map(a => articleCard(a)).join("")}
    </div>

    ${totalPages > 1 ? `<div class="lib-pager">
      <button class="lib-page-btn" id="lib-prev" ${page === 0 ? "disabled" : ""}>← Prev</button>
      <span class="lib-page-num">${page + 1} / ${totalPages}</span>
      <button class="lib-page-btn" id="lib-next" ${page >= totalPages - 1 ? "disabled" : ""}>Next →</button>
    </div>` : ""}
  `;

  // Bind events
  document.getElementById("lib-search").oninput = (e) => {
    searchQuery = e.target.value;
    applyFilters();
    render();
  };

  document.getElementById("lib-sort").onchange = (e) => {
    sortKey = e.target.value;
    applyFilters();
    render();
  };

  document.getElementById("lib-sort-dir").onclick = () => {
    sortAsc = !sortAsc;
    applyFilters();
    render();
  };

  document.querySelectorAll(".lib-bin-chip").forEach(el => {
    el.onclick = () => {
      const bin = el.dataset.bin;
      if (activeBins.has(bin)) activeBins.delete(bin); else activeBins.add(bin);
      applyFilters();
      render();
    };
  });

  document.getElementById("lib-prev")?.addEventListener("click", () => { page--; render(); });
  document.getElementById("lib-next")?.addEventListener("click", () => { page++; render(); });

  // Article card expand
  document.querySelectorAll(".lib-card").forEach(el => {
    el.onclick = () => el.classList.toggle("lib-card-expanded");
  });
}

function articleCard(a) {
  const cat = CATEGORIES[a.bin] || {};
  const rarity = a.stats?.rarity || "common";
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(a.title.replace(/ /g, "_"))}`;

  return `<div class="lib-card rarity-${rarity}">
    <div class="lib-card-header">
      ${a.thumbnail ? `<img class="lib-card-img" src="${a.thumbnail}" alt="" loading="lazy">` : `<div class="lib-card-no-img">${cat.icon || "?"}</div>`}
      <div class="lib-card-info">
        <div class="lib-card-title">${a.title}</div>
        <div class="lib-card-cat" style="color:${cat.color || '#888'}">${cat.icon || ""} ${cat.name || a.bin}</div>
        <div class="lib-card-score">Deep: ${Math.round(a.deep_score).toLocaleString()} — ${RARITY_LABELS[rarity]}</div>
      </div>
    </div>
    <div class="lib-card-detail">
      <div class="lib-card-extract">${a.extract || ""}</div>
      <div class="lib-card-meta">
        ${a.length ? `<span>${(a.length / 1000).toFixed(0)}K chars</span>` : ""}
        ${a.extlinks_count ? `<span>${a.extlinks_count} ext links</span>` : ""}
      </div>
      <a class="lib-card-link" href="${wikiUrl}" target="_blank" onclick="event.stopPropagation()">Read on Wikipedia →</a>
    </div>
  </div>`;
}

// ── Init (called from app.js) ─────────────────────────────────
export async function initLibrary() {
  const wrap = document.getElementById("lib-content");
  if (!wrap) return;

  // Lazy-load on first visit
  const observer = new MutationObserver(() => {
    const panel = document.getElementById("tab-library");
    if (panel?.classList.contains("active") && !articles) {
      wrap.innerHTML = `<div class="loading"><div class="spinner"></div><span>Loading 6,879 articles...</span></div>`;
      loadArticles().then(render).catch(err => {
        wrap.innerHTML = `<div class="lib-error">Failed to load: ${err.message}</div>`;
      });
    }
  });
  observer.observe(document.getElementById("tab-library"), { attributes: true, attributeFilter: ["class"] });
}
