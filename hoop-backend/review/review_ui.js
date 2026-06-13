"use strict";

// Review client: a list of pending items on the left, the selected item's card on
// the right. Same-origin FastAPI app. Approve/reject mutate the item out of the list
// and auto-advance to the next pending one.

const $ = (id) => document.getElementById(id);
let items = [];          // all pending items
let currentId = null;    // selected item's id

const escapeHtml = (s) =>
  String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

async function api(path, opts) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function setStatus(msg) {
  $("status").textContent = msg || "";
}

async function loadStats() {
  const { by_type } = await api("/stats");
  $("stats").innerHTML =
    by_type.map((t) => `<span class="chip">${t.type}: ${t.pending}p / ${t.approved}a</span>`).join("") ||
    "<span>empty pool</span>";
}

async function loadQueue() {
  items = await api("/pending?limit=200");
  const stillHere = items.some((i) => i.id === currentId);
  select(stillHere ? currentId : (items[0] && items[0].id) || null);
}

// ── list ─────────────────────────────────────────────────────────────────────

let search = "";   // current search filter (matches name / type / tags, in memory)

// haystack for one item: type + name + tags, lowercased.
function haystack(it) {
  const c = it.content || {};
  return `${it.type} ${c.name || c.response || ""} ${(it.tags || []).join(" ")}`.toLowerCase();
}

function visibleItems() {
  if (!search) return items;
  const q = search.toLowerCase();
  return items.filter((it) => haystack(it).includes(q));
}

function renderList() {
  const shown = visibleItems();
  $("list-count").textContent = search ? `${shown.length}/${items.length}` : items.length;
  const list = $("list");
  if (!shown.length) {
    list.innerHTML = `<div class="row muted">${search ? "no matches" : "no pending items"}</div>`;
    return;
  }
  list.innerHTML = shown
    .map((it) => {
      const c = it.content || {};
      const name = c.name || c.response || "(unnamed)";
      return `<div class="row${it.id === currentId ? " active" : ""}" data-id="${it.id}">
        <span class="rtype">${escapeHtml(it.type)}</span>
        <span class="rname">${escapeHtml(name)}</span>
        <span class="rtier">r${it.revelation_tier}</span>
      </div>`;
    })
    .join("");
  list.querySelectorAll(".row[data-id]").forEach((r) =>
    r.addEventListener("click", () => select(r.dataset.id))
  );
}

function select(id) {
  currentId = id;
  renderList();
  showCard(items.find((i) => i.id === id) || null);
  const active = document.querySelector(".list .row.active");
  if (active) active.scrollIntoView({ block: "nearest" });
}

function showCard(it) {
  if (!it) {
    $("card").classList.add("hidden");
    $("empty").classList.remove("hidden");
    return;
  }
  $("empty").classList.add("hidden");
  $("card").classList.remove("hidden");
  const c = it.content || {};
  $("type").textContent = it.type;
  $("tiers").textContent = `rev ${it.revelation_tier} · nar ${it.narrative_tier} · pow ${it.power_tier}`;
  $("name").textContent = c.name || "(unnamed)";
  $("description").textContent = c.description || c.response || "";
  $("tags").textContent = (it.tags || []).join(", ") || "—";
  $("world-refs").textContent = (it.world_refs || []).join(", ") || "—";
  $("content-json").value = JSON.stringify(c, null, 2);
  $("review-flag").classList.toggle("hidden", !it.needs_review);

  // top-level requires gate (if any)
  const reqStr = gateStr(it.requires);
  $("gate-line").classList.toggle("hidden", !reqStr);
  $("gate").textContent = reqStr || "";
  $("requires-json").value = JSON.stringify(it.requires || {}, null, 2);

  // reset + lazily load static validation (dialogue FSM + gate reachability)
  $("tree").classList.add("hidden");
  $("issues").classList.add("hidden");
  $("produces").classList.add("hidden");
  loadValidation(it).catch((e) => setStatus(e.message));
}

// ── dialogue tree + validation rendering ───────────────────────────────────────

function gateStr(requires) {
  const r = requires || {};
  const parts = [];
  if (r.min_standing != null) parts.push(`standing≥${r.min_standing}`);
  for (const [k, v] of Object.entries(r.npc_flags || {})) parts.push(`npc:${k}=${v}`);
  for (const [k, v] of Object.entries(r.facts || {})) parts.push(`${k}=${v}`);
  for (const it of r.items || []) parts.push(`item:${it}`);
  for (const [f, n] of Object.entries(r.min_rep || {})) parts.push(`rep:${f}≥${n}`);
  return parts.join(" · ");
}

function effectStr(effects) {
  const e = effects || {};
  const parts = [];
  for (const [k, v] of Object.entries(e.set_facts || {})) parts.push(`set ${k}=${v}`);
  if (e.adjust_standing) parts.push(`standing ${e.adjust_standing > 0 ? "+" : ""}${e.adjust_standing}`);
  for (const [f, n] of Object.entries(e.adjust_rep || {})) parts.push(`rep ${f} ${n > 0 ? "+" : ""}${n}`);
  for (const [k, v] of Object.entries(e.set_npc_flags || {})) parts.push(`npc:${k}=${v}`);
  if ((e.give_items || []).length) parts.push(`gives ${e.give_items.length} item(s)`);
  if (e.end) parts.push("END");
  return parts.join(" · ");
}

async function loadValidation(it) {
  const c = it.content || {};
  const isTree = it.type === "npc" && c.dialogue && c.dialogue.nodes;
  if (!isTree && !gateStr(it.requires)) {
    renderProduces(null);
    return;   // nothing to validate
  }
  const v = await api(`/validate/${it.id}`);
  renderProduces(v.produces);
  renderIssues((v.tree_issues || []).concat(v.gate_issues || []));
  if (isTree) renderTree(c.dialogue, v.tree_issues || []);
}

function renderProduces(p) {
  const box = $("produces");
  const parts = [];
  for (const f of (p && p.facts) || []) parts.push(`sets ${f}`);
  for (const r of (p && p.reps) || []) parts.push(`+rep ${r}`);
  for (const k of (p && p.npc_flags) || []) parts.push(`npc:${k}`);
  for (const i of (p && p.items) || []) parts.push(i === "(gives item)" ? "gives item" : `item:${i}`);
  if (!parts.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = `<span class="plabel">produces</span> ` +
    parts.map((x) => `<span class="ptok">${escapeHtml(x)}</span>`).join(" ");
}

function renderIssues(all) {
  const box = $("issues");
  if (!all.length) {
    box.classList.add("hidden");
    return;
  }
  const errs = all.filter((i) => i.level === "error");
  const warns = all.filter((i) => i.level !== "error");
  box.classList.remove("hidden");
  box.innerHTML =
    `<div class="issues-head">${errs.length} error(s) · ${warns.length} warning(s)</div>`;
  for (const i of errs.concat(warns)) {
    const where = i.choice ? ` (choice ${i.choice})` : i.node ? ` (node ${i.node})` : "";
    const row = document.createElement("div");
    row.className = `issue ${i.level}`;
    row.innerHTML = `<span class="icode">${escapeHtml(i.code)}</span>${escapeHtml(i.message)}${escapeHtml(where)}`;
    // gate issues carry the offending clause+key, so offer a one-click "loosen"
    if (i.clause && i.key) {
      const btn = document.createElement("button");
      btn.className = "loosen";
      btn.textContent = "loosen";
      btn.title = `drop ${i.key} from requires.${i.clause}`;
      btn.addEventListener("click", () => loosenGate(i.clause, i.key).catch((e) => setStatus(e.message)));
      row.appendChild(btn);
    }
    box.appendChild(row);
  }
}

async function loosenGate(clause, key) {
  const it = currentItem();
  if (!it) return;
  const req = JSON.parse(JSON.stringify(it.requires || {}));   // deep copy
  if (clause === "facts" && req.facts) delete req.facts[key];
  else if (clause === "min_rep" && req.min_rep) delete req.min_rep[key];
  else if (clause === "items" && Array.isArray(req.items))
    req.items = req.items.filter((t) => String(t).toLowerCase() !== String(key).toLowerCase());
  // drop now-empty clauses so the gate reads clean
  for (const k of ["facts", "items", "min_rep"]) {
    if (req[k] && (Array.isArray(req[k]) ? req[k].length === 0 : Object.keys(req[k]).length === 0)) delete req[k];
  }
  await api(`/edit/${it.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requires: req }),
  });
  it.requires = req;
  select(it.id);                 // re-render card from the loosened gate
  loadReachability();            // dashboard count drops
  setStatus(`🔓 dropped ${key} from requires.${clause}`);
}

function renderTree(tree, treeIssues) {
  // map issues onto their node / choice so we can badge the right block
  const nodeIssues = {}, choiceIssues = {};
  for (const i of treeIssues) {
    if (i.choice) (choiceIssues[`${i.node}|${i.choice}`] ||= []).push(i);
    else if (i.node) (nodeIssues[i.node] ||= []).push(i);
  }
  const start = tree.start || Object.keys(tree.nodes)[0];
  const badge = (issues) =>
    (issues || []).map((i) => `<span class="ibadge ${i.level}" title="${escapeHtml(i.message)}">${i.code}</span>`).join("");

  const tree_html = Object.entries(tree.nodes)
    .map(([nid, node]) => {
      const choices = (node.choices || [])
        .map((ch) => {
          const g = gateStr(ch.requires);
          const ef = effectStr(ch.effects);
          const goto = ch.goto ? `<span class="goto">→ ${escapeHtml(ch.goto)}</span>` : "";
          return `<div class="tchoice">
            <span class="ctext">${escapeHtml(ch.text || ch.id)}</span>
            ${g ? `<span class="ggate">needs ${escapeHtml(g)}</span>` : ""}
            ${ef ? `<span class="geffect">${escapeHtml(ef)}</span>` : ""}
            ${goto}
            ${badge(choiceIssues[`${nid}|${ch.id}`])}
          </div>`;
        })
        .join("");
      return `<div class="tnode${nid === start ? " start" : ""}">
        <div class="tnode-head"><span class="nid">${escapeHtml(nid)}${nid === start ? " ★" : ""}</span>
          ${badge(nodeIssues[nid])}</div>
        <div class="says">“${escapeHtml(node.says || "")}”</div>
        ${choices || `<div class="tchoice muted">no choices</div>`}
      </div>`;
    })
    .join("");
  const tree_el = $("tree");
  tree_el.classList.remove("hidden");
  tree_el.innerHTML = `<div class="tree-head">dialogue tree</div>${tree_html}`;
}

// ── actions ──────────────────────────────────────────────────────────────────

const currentItem = () => items.find((i) => i.id === currentId) || null;

function neighborId() {
  // The item to land on after the current one leaves: next, else previous.
  const idx = items.findIndex((i) => i.id === currentId);
  const n = items[idx + 1] || items[idx - 1];
  return n ? n.id : null;
}

function removeAndAdvance(id) {
  const nextId = neighborId();
  items = items.filter((i) => i.id !== id);
  select(items.some((i) => i.id === nextId) ? nextId : (items[0] && items[0].id) || null);
}

function parseEdits(it) {
  // Only send edits if the JSON was actually changed and is valid.
  const original = JSON.stringify(it.content || {}, null, 2);
  const edited = $("content-json").value;
  if (edited.trim() === original.trim()) return null;
  try {
    return JSON.parse(edited);
  } catch (e) {
    setStatus("⚠ invalid JSON — fix it or revert to approve with edits");
    throw e;
  }
}

async function approve() {
  const it = currentItem();
  if (!it) return;
  let edits;
  try {
    edits = parseEdits(it);
  } catch {
    return;
  }
  await api(`/approve/${it.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edits }),
  });
  setStatus(`✓ approved ${it.content?.name || it.id}`);
  removeAndAdvance(it.id);
  await loadStats();
  loadReachability();
}

async function saveEdits() {
  const it = currentItem();
  if (!it) return;
  let content, requires;
  try {
    content = JSON.parse($("content-json").value);
    requires = JSON.parse($("requires-json").value || "{}");
  } catch {
    setStatus("⚠ invalid JSON — fix it to save");
    return;
  }
  await api(`/edit/${it.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, requires }),
  });
  it.content = content;          // reflect the save in our local copy…
  it.requires = requires;
  select(it.id);                 // …then re-render list + card (name/desc/tree/gate) from it
  loadReachability();            // edits can fix or create orphans
  setStatus(`💾 saved ${content.name || it.id}`);
}

// ── reachability dashboard (pool-wide orphan triage) ───────────────────────────

async function loadReachability() {
  let r;
  try { r = await api("/reachability"); } catch { return; }
  $("reach-count").textContent = r.total_errors + r.total_warnings;
  $("reach").classList.toggle("clean", (r.total_errors + r.total_warnings) === 0);
  const box = $("reach-list");
  if (!r.items.length) {
    box.innerHTML = `<div class="reach-row muted">no orphaned gates — every gate is reachable ✓</div>`;
    return;
  }
  box.innerHTML = "";
  for (const it of r.items) {
    const codes = [...new Set(it.issues.map((i) => i.key || i.code))].join(", ");
    const row = document.createElement("div");
    row.className = "reach-row";
    row.innerHTML = `<span class="rsource">${escapeHtml(it.source)}</span>` +
      `<span class="rkeys">${escapeHtml(codes)}</span>`;
    row.addEventListener("click", () => {
      if (items.some((p) => p.id === it.id)) select(it.id);
      else setStatus("that item isn't in the pending queue (already approved) — show all to edit it");
    });
    box.appendChild(row);
  }
}

async function reject() {
  const it = currentItem();
  if (!it) return;
  await api(`/reject/${it.id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "" }),
  });
  setStatus(`✗ rejected ${it.content?.name || it.id}`);
  removeAndAdvance(it.id);
  await loadStats();
  loadReachability();
}

function skip() {
  const id = neighborId();
  if (id) select(id);
}

$("search").addEventListener("input", (e) => { search = e.target.value.trim(); renderList(); });
$("save").addEventListener("click", () => saveEdits().catch((e) => setStatus(e.message)));
$("approve").addEventListener("click", () => approve().catch((e) => setStatus(e.message)));
$("reject").addEventListener("click", () => reject().catch((e) => setStatus(e.message)));
$("skip").addEventListener("click", skip);

loadStats();
loadQueue();
loadReachability();
