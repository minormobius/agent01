// ── Shared utilities for Wiki Cards ─────────────────────────
// Common code used by the hub page and all subpages.

import { CATEGORIES, POOL } from "./pool.js";
import { loadCatalog, getCachedArticle, isCatalogLoaded } from "./pds-catalog.js";

// Re-export for convenience
export { CATEGORIES, POOL };
export { loadCatalog, getCachedArticle, isCatalogLoaded };

// ── Rarity ───────────────────────────────────────────────────

export const RARITY_LABELS = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  legendary: "Legendary",
};

// ── Wikipedia API ────────────────────────────────────────────

const WIKI_API = "https://en.wikipedia.org/w/api.php";

export async function fetchFromWikipedia(titles) {
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

export async function fetchArticleData(titles) {
  if (isCatalogLoaded()) {
    const pages = {};
    const uncached = [];
    for (const title of titles) {
      const cached = getCachedArticle(title);
      if (cached) {
        pages[title] = {
          pageid: 1,
          title,
          extract: cached.extract,
          thumbnail: cached.thumbnail ? { source: cached.thumbnail } : undefined,
        };
      } else {
        uncached.push(title);
      }
    }
    if (uncached.length > 0) {
      const wikiPages = await fetchFromWikipedia(uncached);
      Object.assign(pages, wikiPages);
    }
    return pages;
  }
  return fetchFromWikipedia(titles);
}

// ── Card Preview Panel ──────────────────────────────────────
// Shows a compact card detail in a target container.

export async function showCardPreview(containerId, title, category, stats) {
  const el = document.getElementById(containerId);
  if (!el) return;

  const cat = CATEGORIES[category] || {};
  const rarity = stats?.rarity || "common";
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

  el.classList.remove("hidden");
  el.innerHTML = `<div class="card-preview-inner">
    <div class="card-preview-no-img">${cat.icon || "?"}</div>
    <div class="card-preview-body">
      <button class="card-preview-close">&times;</button>
      <div class="card-preview-title">${title}</div>
      <div class="card-preview-cat" style="color:${cat.color || "#888"}">${cat.name || category} — ${RARITY_LABELS[rarity]}</div>
      <div class="card-preview-extract" style="opacity:0.5">Loading...</div>
      <div class="card-preview-stats">
        <div class="stat"><span class="stat-label">ATK</span> <span class="stat-value">${stats.atk}</span></div>
        <div class="stat"><span class="stat-label">DEF</span> <span class="stat-value">${stats.def}</span></div>
        <div class="stat"><span class="stat-label">SPC</span> <span class="stat-value">${stats.spc}</span></div>
        <div class="stat"><span class="stat-label">SPD</span> <span class="stat-value">${stats.spd}</span></div>
        <div class="stat"><span class="stat-label">HP</span> <span class="stat-value">${stats.hp}</span></div>
      </div>
      <a class="card-preview-link" href="${wikiUrl}" target="_blank">Wikipedia &rarr;</a>
    </div>
  </div>`;

  el.querySelector(".card-preview-close").onclick = () => el.classList.add("hidden");

  try {
    const pages = await fetchArticleData([title]);
    const page = Object.values(pages).find(p => p.pageid);
    if (page) {
      const imgEl = el.querySelector(".card-preview-no-img, .card-preview-img");
      if (page.thumbnail && imgEl) {
        const img = document.createElement("img");
        img.className = "card-preview-img";
        img.src = page.thumbnail.source;
        img.alt = title;
        imgEl.replaceWith(img);
      }
      const extEl = el.querySelector(".card-preview-extract");
      if (extEl) {
        extEl.style.opacity = "";
        extEl.textContent = page.extract || "";
      }
    }
  } catch (_) { /* non-critical */ }
}

// Make available globally for nexus
window._showCardPreview = showCardPreview;

// ── Seeded PRNG (mulberry32) ────────────────────────────────

export function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}
