// ── Tech Tree — interactive dependency graph ──────────────────
import { TECH_ERAS, TECH_DOMAINS, TECH_POOL } from "./tech-pool.js";
import { fetchArticleData, RARITY_LABELS } from "./shared.js";

// ── Constants ────────────────────────────────────────────────
const ERA_ORDER = ["prehistoric", "ancient", "medieval", "renaissance", "industrial", "modern", "information", "ai"];
const COL_W = 200;   // width per era column
const NODE_H = 26;   // node height
const NODE_PAD = 6;  // vertical gap between nodes
const MARGIN_T = 36;  // top margin (for era labels)
const MARGIN_L = 12;
const MARGIN_B = 24;

// ── Data structures ──────────────────────────────────────────
const nodes = [];           // { id, title, era, props, x, y, w, col, row }
const titleIndex = {};      // title -> node
const childrenOf = {};      // title -> [title, ...]
let selected = null;
let zoom = 1;
let activeDomain = null;

// ── Build graph ──────────────────────────────────────────────
TECH_POOL.forEach((t, i) => {
  const node = { id: i, title: t[0], era: t[1], props: t[2] };
  nodes.push(node);
  titleIndex[t[0]] = node;
});

// Build children index (reverse of prereqs)
nodes.forEach(n => {
  n.props.prereqs.forEach(p => {
    if (!childrenOf[p]) childrenOf[p] = [];
    childrenOf[p].push(n.title);
  });
});

// ── Layout ───────────────────────────────────────────────────
function layout() {
  // Group by era
  const byEra = {};
  ERA_ORDER.forEach(e => byEra[e] = []);
  nodes.forEach(n => byEra[n.era].push(n));

  // Sort within each era: by domain then year
  const domOrder = Object.keys(TECH_DOMAINS);
  ERA_ORDER.forEach(era => {
    byEra[era].sort((a, b) => {
      const da = domOrder.indexOf(a.props.domain);
      const db = domOrder.indexOf(b.props.domain);
      if (da !== db) return da - db;
      return a.props.year - b.props.year;
    });
  });

  // Assign positions
  ERA_ORDER.forEach((era, ci) => {
    const col = byEra[era];
    col.forEach((n, ri) => {
      n.col = ci;
      n.row = ri;
      n.x = MARGIN_L + ci * COL_W + 10;
      n.y = MARGIN_T + ri * (NODE_H + NODE_PAD);
      n.w = COL_W - 24;
    });
  });

  // Compute canvas size
  const maxRows = Math.max(...ERA_ORDER.map(e => byEra[e].length));
  const cw = MARGIN_L + ERA_ORDER.length * COL_W + MARGIN_L;
  const ch = MARGIN_T + maxRows * (NODE_H + NODE_PAD) + MARGIN_B;
  return { cw, ch, byEra };
}

// ── Ancestry / descendant helpers ────────────────────────────
function getAncestors(title) {
  const set = new Set();
  const stack = [title];
  while (stack.length) {
    const t = stack.pop();
    const node = titleIndex[t];
    if (!node) continue;
    node.props.prereqs.forEach(p => {
      if (!set.has(p)) { set.add(p); stack.push(p); }
    });
  }
  return set;
}

function getDescendants(title) {
  const set = new Set();
  const stack = [title];
  while (stack.length) {
    const t = stack.pop();
    (childrenOf[t] || []).forEach(c => {
      if (!set.has(c)) { set.add(c); stack.push(c); }
    });
  }
  return set;
}

// ── Render ───────────────────────────────────────────────────
function render() {
  const { cw, ch, byEra } = layout();
  const canvas = document.getElementById("tt-canvas");
  const svg = document.getElementById("tt-svg");
  const nodesEl = document.getElementById("tt-nodes");

  canvas.style.width = cw + "px";
  canvas.style.height = ch + "px";
  svg.setAttribute("viewBox", `0 0 ${cw} ${ch}`);
  svg.style.width = cw + "px";
  svg.style.height = ch + "px";

  // Era background bands + labels
  let bandHtml = "";
  ERA_ORDER.forEach((era, ci) => {
    const er = TECH_ERAS[era];
    const x = MARGIN_L + ci * COL_W;
    bandHtml += `<div class="tt-era-band" style="left:${x}px;width:${COL_W}px;height:${ch}px;background:${er.color}"></div>`;
    bandHtml += `<div class="tt-era-label" style="left:${x + 4}px">${er.icon} ${er.name}</div>`;
  });

  // Nodes
  let nodeHtml = "";
  nodes.forEach(n => {
    const dom = TECH_DOMAINS[n.props.domain] || {};
    const er = TECH_ERAS[n.era] || {};
    const displayTitle = n.title.replace(/ \(.*\)$/, "");
    const rClass = `rarity-${n.props.rarity || "common"}`;
    const sClass = n.props.status === "dead" ? "dead" : "";
    const vis = activeDomain && n.props.domain !== activeDomain ? "dimmed" : "";
    nodeHtml += `<div class="tt-node ${rClass} ${sClass} ${vis}" data-title="${n.title.replace(/"/g, '&quot;')}" `
      + `style="left:${n.x}px;top:${n.y}px;width:${n.w}px;height:${NODE_H}px;border-left:3px solid ${er.color}">`
      + `<span class="tt-node-icon">${dom.icon || "?"}</span>`
      + `<span class="tt-node-name">${displayTitle}</span></div>`;
  });

  nodesEl.innerHTML = bandHtml + nodeHtml;

  // SVG edges
  let paths = "";
  nodes.forEach(n => {
    n.props.prereqs.forEach(pTitle => {
      const pn = titleIndex[pTitle];
      if (!pn) return;
      const x1 = pn.x + pn.w;
      const y1 = pn.y + NODE_H / 2;
      const x2 = n.x;
      const y2 = n.y + NODE_H / 2;
      const dx = Math.abs(x2 - x1) * 0.4;
      const dimClass = activeDomain && (n.props.domain !== activeDomain && pn.props.domain !== activeDomain) ? "dimmed" : "";
      paths += `<path class="tt-edge ${dimClass}" data-from="${pTitle.replace(/"/g, '&quot;')}" data-to="${n.title.replace(/"/g, '&quot;')}" d="M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}"/>`;
    });
  });
  svg.innerHTML = paths;

  // Event listeners
  nodesEl.querySelectorAll(".tt-node").forEach(el => {
    el.addEventListener("click", () => onNodeClick(el.dataset.title));
  });

  applyZoom();
}

// ── Selection ────────────────────────────────────────────────
function onNodeClick(title) {
  if (selected === title) {
    clearSelection();
    return;
  }
  selected = title;

  const ancestors = getAncestors(title);
  const descendants = getDescendants(title);
  const related = new Set([title, ...ancestors, ...descendants]);

  // Highlight nodes
  document.querySelectorAll(".tt-node").forEach(el => {
    const t = el.dataset.title;
    el.classList.remove("selected", "ancestor", "descendant", "dimmed");
    if (t === title) el.classList.add("selected");
    else if (ancestors.has(t)) el.classList.add("ancestor");
    else if (descendants.has(t)) el.classList.add("descendant");
    else el.classList.add("dimmed");
  });

  // Highlight edges
  document.querySelectorAll(".tt-edge").forEach(el => {
    const from = el.dataset.from;
    const to = el.dataset.to;
    el.classList.remove("highlighted", "highlighted-desc", "dimmed");
    if (ancestors.has(from) && (ancestors.has(to) || to === title)) {
      el.classList.add("highlighted");
    } else if (descendants.has(to) && (descendants.has(from) || from === title)) {
      el.classList.add("highlighted-desc");
    } else {
      el.classList.add("dimmed");
    }
  });

  showDetail(title, ancestors, descendants);
}

function clearSelection() {
  selected = null;
  document.querySelectorAll(".tt-node").forEach(el => {
    el.classList.remove("selected", "ancestor", "descendant", "dimmed");
    if (activeDomain && el.dataset.title) {
      const n = titleIndex[el.dataset.title];
      if (n && n.props.domain !== activeDomain) el.classList.add("dimmed");
    }
  });
  document.querySelectorAll(".tt-edge").forEach(el => {
    el.classList.remove("highlighted", "highlighted-desc", "dimmed");
    if (activeDomain) {
      const from = titleIndex[el.dataset.from];
      const to = titleIndex[el.dataset.to];
      if (from && to && from.props.domain !== activeDomain && to.props.domain !== activeDomain) {
        el.classList.add("dimmed");
      }
    }
  });
  document.getElementById("tt-detail").classList.add("hidden");
}

// ── Detail panel ─────────────────────────────────────────────
function formatYear(y) {
  if (y <= -1000000) return `~${Math.round(y / -1000)} kya`;
  if (y < 0) return `${-y} BCE`;
  return `${y} CE`;
}

async function showDetail(title, ancestors, descendants) {
  const n = titleIndex[title];
  if (!n) return;
  const el = document.getElementById("tt-detail");
  const er = TECH_ERAS[n.era] || {};
  const dom = TECH_DOMAINS[n.props.domain] || {};
  const displayTitle = title.replace(/ \(.*\)$/, "");
  const wikiUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`;

  const prereqTags = n.props.prereqs.map(p =>
    `<span class="tt-dep-tag req" data-title="${p.replace(/"/g, '&quot;')}">${p.replace(/ \(.*\)$/, "")}</span>`
  ).join("");

  const enablesTags = (childrenOf[title] || []).map(c =>
    `<span class="tt-dep-tag enables" data-title="${c.replace(/"/g, '&quot;')}">${c.replace(/ \(.*\)$/, "")}</span>`
  ).join("");

  el.classList.remove("hidden");
  el.innerHTML = `
    <div class="tt-detail-header">
      <div class="tt-detail-title">${displayTitle}
        <span class="tt-detail-status ${n.props.status}">${n.props.status}</span>
      </div>
      <button class="tt-detail-close">&times;</button>
    </div>
    <div class="tt-detail-meta" style="color:${er.color}">
      ${er.icon} ${er.name} · ${dom.icon} ${dom.name} · ${formatYear(n.props.year)} · Complexity ${n.props.complexity}/10 · ${RARITY_LABELS[n.props.rarity || "common"]}
    </div>
    <div class="tt-detail-deps">
      ${prereqTags ? `<div class="tt-detail-dep-section"><h4>Requires (${ancestors.size} total ancestors)</h4>${prereqTags}</div>` : ""}
      ${enablesTags ? `<div class="tt-detail-dep-section"><h4>Enables (${descendants.size} total descendants)</h4>${enablesTags}</div>` : ""}
    </div>
    <div class="tt-detail-extract" id="tt-extract">Loading...</div>
    <a class="tt-detail-link" href="${wikiUrl}" target="_blank">Wikipedia &rarr;</a>
  `;

  el.querySelector(".tt-detail-close").addEventListener("click", clearSelection);
  el.querySelectorAll(".tt-dep-tag").forEach(tag => {
    tag.addEventListener("click", () => {
      const t = tag.dataset.title;
      if (t) onNodeClick(t);
      // Scroll to node
      const nodeEl = document.querySelector(`.tt-node[data-title="${CSS.escape(t)}"]`);
      if (nodeEl) nodeEl.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    });
  });

  // Fetch Wikipedia extract
  try {
    const pages = await fetchArticleData([title]);
    const page = Object.values(pages).find(p => p.pageid);
    const ext = document.getElementById("tt-extract");
    if (ext && page?.extract) ext.textContent = page.extract;
    else if (ext) ext.textContent = "";
  } catch (_) {
    const ext = document.getElementById("tt-extract");
    if (ext) ext.textContent = "";
  }
}

// ── Zoom ─────────────────────────────────────────────────────
function applyZoom() {
  const canvas = document.getElementById("tt-canvas");
  canvas.style.transform = `scale(${zoom})`;
  document.getElementById("tt-zoom-label").textContent = Math.round(zoom * 100) + "%";
}

function zoomIn() { zoom = Math.min(zoom + 0.15, 2.5); applyZoom(); }
function zoomOut() { zoom = Math.max(zoom - 0.15, 0.3); applyZoom(); }

function zoomFit() {
  const vp = document.getElementById("tt-viewport");
  const canvas = document.getElementById("tt-canvas");
  const cw = parseFloat(canvas.style.width);
  const ch = parseFloat(canvas.style.height);
  const vw = vp.clientWidth;
  const vh = vp.clientHeight;
  zoom = Math.min(vw / cw, vh / ch, 1);
  zoom = Math.max(zoom, 0.3);
  applyZoom();
}

// ── Domain filter ────────────────────────────────────────────
function buildFilters() {
  const el = document.getElementById("tt-filters");
  let html = `<button class="tt-filter-btn active" data-domain="all">All</button>`;
  for (const [key, dom] of Object.entries(TECH_DOMAINS)) {
    const count = nodes.filter(n => n.props.domain === key).length;
    html += `<button class="tt-filter-btn" data-domain="${key}">${dom.icon} ${dom.name} (${count})</button>`;
  }
  el.innerHTML = html;

  el.querySelectorAll(".tt-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      el.querySelectorAll(".tt-filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      const d = btn.dataset.domain;
      activeDomain = d === "all" ? null : d;
      selected = null;
      render();
    });
  });
}

// ── Mouse wheel zoom ─────────────────────────────────────────
function setupWheelZoom() {
  const vp = document.getElementById("tt-viewport");
  vp.addEventListener("wheel", (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      if (e.deltaY < 0) zoomIn();
      else zoomOut();
    }
  }, { passive: false });
}

// ── Init ─────────────────────────────────────────────────────
document.getElementById("tt-count").textContent = `${TECH_POOL.length} technologies · ${nodes.filter(n => n.props.prereqs.length === 0).length} root nodes`;

buildFilters();
render();
zoomFit();
setupWheelZoom();

document.getElementById("tt-zoom-in").addEventListener("click", zoomIn);
document.getElementById("tt-zoom-out").addEventListener("click", zoomOut);
document.getElementById("tt-zoom-fit").addEventListener("click", zoomFit);

// Click background to deselect
document.getElementById("tt-viewport").addEventListener("click", (e) => {
  if (e.target.id === "tt-viewport" || e.target.id === "tt-canvas" || e.target.classList.contains("tt-era-band")) {
    clearSelection();
  }
});
