/* phylofiction — the reader's renderer (SPEC §7 layer 1 + 3 + 4).
 *
 * Draws a generated world as a rectangular cladogram with deep time on the
 * X-axis: each lineage is a horizontal track over its lifespan, budding
 * daughters branch off with vertical connectors, lines are coloured by the
 * lineage's defining metabolism, extinct tips are marked (and reddened when
 * the cause was the oxidant), the oxidant trajectory rides along the top, and
 * mass-extinction pulses + the Great Oxygenation are drawn as event bands.
 *
 * Visual conventions (typed edges, hover-highlight, capability colour) are
 * borrowed from read/pendragon/app.js's renderTree(). Pure DOM/SVG, no deps.
 */

import { CAPS } from "./genome.js";

const SVGNS = "http://www.w3.org/2000/svg";
function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVGNS, tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}

// ── layout: assign each lineage a row via DFS pre-order over budding children ──
function layout(world) {
  const nodes = world.tree.nodes;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const kids = new Map();
  for (const n of nodes) {
    if (n.parentId === null) continue;
    if (!kids.has(n.parentId)) kids.set(n.parentId, []);
    kids.get(n.parentId).push(n);
  }
  for (const arr of kids.values()) arr.sort((a, b) => a.birth - b.birth || a.id - b.id);

  const row = new Map();
  let r = 0;
  const root = nodes.find((n) => n.parentId === null);
  const stack = [root];
  // explicit DFS so the parent sits just above its first daughter
  (function dfs(n) {
    row.set(n.id, r++);
    for (const c of kids.get(n.id) || []) dfs(c);
  })(root);

  return { byId, kids, row, maxRow: r - 1 };
}

export function renderPhylogeny(world, host, { onSelect } = {}) {
  host.innerHTML = "";
  const { byId, row, maxRow } = layout(world);
  const nodes = world.tree.nodes;

  const ROW = 13, padL = 70, padR = 24, padT = 64, padB = 28;
  const plotW = Math.max(720, world.epochs * 12);
  const W = padL + plotW + padR;
  const H = padT + (maxRow + 1) * ROW + padB;
  const x = (epoch) => padL + (epoch / world.epochs) * plotW;
  const y = (rowIdx) => padT + rowIdx * ROW;

  const root = svg("svg", { class: "phylo", viewBox: `0 0 ${W} ${H}`, width: W, height: H });
  const layer = svg("g", { class: "zl" });
  root.appendChild(layer);

  // ── oxidant trajectory across the top (the forcing function, SPEC §3) ──
  const oxTop = 14, oxH = 34;
  const oxPath = [`M ${x(0)} ${oxTop + oxH}`];
  for (const s of world.env) oxPath.push(`L ${x(s.epoch)} ${oxTop + oxH - s.oxidant * oxH}`);
  oxPath.push(`L ${x(world.epochs)} ${oxTop + oxH} Z`);
  layer.appendChild(svg("path", { d: oxPath.join(" "), class: "ox-area" }));
  const oxLbl = svg("text", { x: padL, y: oxTop - 2, class: "axis-lbl" });
  oxLbl.textContent = "oxidant →";
  layer.appendChild(oxLbl);

  // ── event bands ──
  for (const ev of world.events) {
    if (ev.kind === "extinction") {
      layer.appendChild(svg("rect", {
        x: x(ev.epoch) - 4, y: padT - 6, width: 8, height: H - padT - padB + 6,
        class: "band-extinction",
      }));
    } else if (ev.kind === "great-oxygenation") {
      const gx = x(ev.epoch);
      layer.appendChild(svg("line", { x1: gx, y1: padT - 10, x2: gx, y2: H - padB, class: "band-goe" }));
      const t = svg("text", { x: gx + 4, y: padT - 12, class: "goe-lbl" });
      t.textContent = "Great Oxygenation";
      layer.appendChild(t);
    }
  }

  // ── lineages: vertical connector to parent, then the horizontal track ──
  const lineEls = new Map();
  for (const n of nodes) {
    const ry = y(row.get(n.id)) + ROW / 2;
    const x0 = x(n.birth), x1 = x(n.last);
    const col = CAPS[n.dominant].color;

    if (n.parentId !== null && byId.has(n.parentId)) {
      const py = y(row.get(n.parentId)) + ROW / 2;
      layer.appendChild(svg("path", {
        d: `M ${x0} ${py} C ${x0} ${(py + ry) / 2}, ${x0} ${(py + ry) / 2}, ${x0} ${ry}`,
        class: "branch-link", stroke: col,
      }));
    }

    const seg = svg("line", {
      x1: x0, y1: ry, x2: Math.max(x1, x0 + 1.5), y2: ry,
      class: "lineage" + (n.extinct ? " extinct" : " survivor"),
      stroke: col, "data-id": n.id,
    });
    layer.appendChild(seg);
    lineEls.set(n.id, seg);

    // tip marker
    if (n.extinct) {
      const poisoned = n.deathCause === "oxidant";
      const m = svg("path", {
        d: `M ${x1 - 2.4} ${ry - 2.4} L ${x1 + 2.4} ${ry + 2.4} M ${x1 + 2.4} ${ry - 2.4} L ${x1 - 2.4} ${ry + 2.4}`,
        class: "tip-extinct" + (poisoned ? " poisoned" : ""),
      });
      layer.appendChild(m);
    } else {
      layer.appendChild(svg("circle", { cx: x1, cy: ry, r: 2.6, class: "tip-survivor", fill: col }));
    }

    const title = svg("title");
    title.textContent =
      `lineage ${n.id} · ${n.caps.map((c) => CAPS[c].label).join(", ")}\n` +
      `epochs ${n.birth}–${n.last}${n.extinct ? ` · died (${n.deathCause})` : " · survives"}` +
      ` · O₂-tol ${n.genome.oxidantTolerance.toFixed(2)}`;
    seg.appendChild(title);

    seg.addEventListener("mouseenter", () => { seg.classList.add("hot"); onSelect && onSelect(n); });
    seg.addEventListener("mouseleave", () => seg.classList.remove("hot"));
  }

  // ── time axis ──
  for (let e = 0; e <= world.epochs; e += 12) {
    layer.appendChild(svg("line", { x1: x(e), y1: padT - 4, x2: x(e), y2: padT - 1, class: "tick" }));
    const t = svg("text", { x: x(e), y: H - 8, class: "axis-lbl", "text-anchor": "middle" });
    t.textContent = e === 0 ? "epoch 0" : e;
    layer.appendChild(t);
  }

  host.appendChild(root);
  attachZoom(root, layer);
  return root;
}

// minimal wheel-zoom + drag-pan on the layer group (polish; pendragon has a richer one)
function attachZoom(svgEl, layer) {
  let k = 1, tx = 0, ty = 0, dragging = false, sx = 0, sy = 0;
  const apply = () => layer.setAttribute("transform", `translate(${tx},${ty}) scale(${k})`);
  svgEl.addEventListener("wheel", (e) => {
    e.preventDefault();
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const r = svgEl.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    tx = mx - (mx - tx) * f; ty = my - (my - ty) * f; k *= f; apply();
  }, { passive: false });
  svgEl.addEventListener("mousedown", (e) => { dragging = true; sx = e.clientX - tx; sy = e.clientY - ty; });
  window.addEventListener("mousemove", (e) => { if (dragging) { tx = e.clientX - sx; ty = e.clientY - sy; apply(); } });
  window.addEventListener("mouseup", () => { dragging = false; });
}

// the capability legend
export function renderLegend(host) {
  host.innerHTML = "";
  for (const id in CAPS) {
    const span = document.createElement("span");
    span.className = "leg";
    span.innerHTML = `<span class="dot" style="background:${CAPS[id].color}"></span>${CAPS[id].label}`;
    host.appendChild(span);
  }
}

// the events ledger (SPEC §7 layer 4)
export function renderEvents(world, host) {
  host.innerHTML = "";
  if (!world.events.length) {
    host.innerHTML = '<p class="muted">A quiet world — no innovations crossed the threshold of note.</p>';
    return;
  }
  for (const ev of world.events) {
    const row = document.createElement("div");
    row.className = "ev ev-" + ev.kind;
    row.innerHTML = `<span class="ev-epoch">e${ev.epoch}</span>` +
      `<span class="ev-kind">${ev.kind.replace(/-/g, " ")}</span>` +
      `<span class="ev-gloss">${ev.gloss}</span>`;
    host.appendChild(row);
  }
}
