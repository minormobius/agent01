/**
 * Nexus — Knowledge Graph Battle
 *
 * Place cards on a field. Semantic connections (via embeddings) form synergy
 * bonds that multiply your stats. Attack to destroy the opponent's graph.
 * The AI builds its own graph and fights back.
 */
import { CATEGORIES, POOL } from "./pool.js";

// ── Tuning constants ────────────────────────────────────────
const SYN_THRESHOLD = 0.35;   // min cosine sim for a bond
const SYN_PER_EDGE  = 0.20;   // stat multiplier per bond
const CLUSTER_BONUS = 0.15;   // bonus for 3+ same-category cards
const CLUSTER_MIN   = 3;
const MAX_FIELD     = 6;
const HAND_SIZE     = 5;
const MAX_TURNS     = 20;
const HP_SCALE      = 3;      // pool HP ÷ 3 for game HP

const RARITY_TAG = { common: "C", uncommon: "U", rare: "R", legendary: "L" };

// ══════════════════════════════════════════════════════════════
// GAME ENGINE
// ══════════════════════════════════════════════════════════════

class NexusEngine {
  constructor(emb, idx) {
    this.emb = emb;           // Float32Array (N × dim)
    this.dim = idx.dim;
    this.titleMap = new Map();
    for (let i = 0; i < idx.count; i++) this.titleMap.set(idx.titles[i], i);
  }

  /** Build shuffled deck from POOL entries that have embeddings */
  _deck() {
    const d = [];
    for (const [title, cat, stats] of POOL) {
      if (!this.titleMap.has(title)) continue;
      const hp = Math.round((stats.hp || 500) / HP_SCALE);
      d.push({
        title, category: cat,
        atk: stats.atk, def: stats.def, spc: stats.spc, spd: stats.spd,
        maxHp: hp, hp: hp,
        rarity: stats.rarity || "common",
        _ei: this.titleMap.get(title),
      });
    }
    for (let i = d.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [d[i], d[j]] = [d[j], d[i]];
    }
    return d;
  }

  start() {
    const deck = this._deck();
    const p = { hand: [], field: [] };
    const a = { hand: [], field: [] };
    for (let i = 0; i < HAND_SIZE; i++) {
      if (deck.length) p.hand.push(deck.pop());
      if (deck.length) a.hand.push(deck.pop());
    }
    return {
      deck, p, a,
      turn: 1, phase: "play",
      log: ["Game on. Play a card to start building your nexus."],
      winner: null, selAtk: -1,
    };
  }

  sim(a, b) {
    const d = this.dim, oA = a._ei * d, oB = b._ei * d;
    let dot = 0;
    for (let i = 0; i < d; i++) dot += this.emb[oA + i] * this.emb[oB + i];
    return dot;
  }

  edges(field) {
    const e = [];
    for (let i = 0; i < field.length; i++)
      for (let j = i + 1; j < field.length; j++) {
        const s = this.sim(field[i], field[j]);
        if (s >= SYN_THRESHOLD) e.push({ i, j, s });
      }
    return e;
  }

  syn(field, idx) {
    let edges = 0, cats = 0;
    const c = field[idx];
    for (let i = 0; i < field.length; i++) {
      if (i === idx) continue;
      if (this.sim(c, field[i]) >= SYN_THRESHOLD) edges++;
      if (field[i].category === c.category) cats++;
    }
    let m = 1 + SYN_PER_EDGE * edges;
    if (cats + 1 >= CLUSTER_MIN) m += CLUSTER_BONUS;
    return { m, edges };
  }

  power(field) {
    let t = 0;
    for (let i = 0; i < field.length; i++) {
      t += Math.round(field[i].atk * this.syn(field, i).m);
    }
    return t;
  }

  play(s, hi) {
    if (s.phase !== "play" || s.p.field.length >= MAX_FIELD) return false;
    if (hi < 0 || hi >= s.p.hand.length) return false;
    const c = s.p.hand.splice(hi, 1)[0];
    s.p.field.push(c);
    const sy = this.syn(s.p.field, s.p.field.length - 1);
    s.log.push(`Played ${c.title}${sy.edges ? ` — ${sy.edges} bond${sy.edges > 1 ? "s" : ""} (×${sy.m.toFixed(1)})` : ""}`);
    s.phase = "attack";
    return true;
  }

  skipPlay(s) {
    if (s.phase !== "play") return false;
    s.phase = "attack";
    return true;
  }

  attack(s, ai, di) {
    if (s.phase !== "attack") return null;
    const atk = s.p.field[ai], def = s.a.field[di];
    if (!atk || !def) return null;

    const r = this._combat(atk, s.p.field, ai, def, s.a.field, di);
    s.log.push(`${atk.title} ⚔ ${def.title} — ${r.dmg} dmg`);

    if (def.hp <= 0) { s.a.field.splice(di, 1); s.log.push(`${def.title} destroyed`); }
    if (atk.hp <= 0) {
      const ni = s.p.field.indexOf(atk);
      if (ni >= 0) s.p.field.splice(ni, 1);
      s.log.push(`${atk.title} fell`);
    }

    this._aiTurn(s);
    this._checkEnd(s);
    if (s.phase !== "over") this._newTurn(s);
    return r;
  }

  skipAttack(s) {
    if (s.phase !== "attack") return false;
    this._aiTurn(s);
    this._checkEnd(s);
    if (s.phase !== "over") this._newTurn(s);
    return true;
  }

  _combat(atk, af, ai, def, df, di) {
    const as = this.syn(af, ai), ds = this.syn(df, di);
    const dmg = Math.max(5, Math.round(atk.atk * as.m * 1.5) - Math.round(def.def * ds.m * 0.3));
    const ctr = Math.round(def.atk * ds.m * 0.2);
    def.hp = Math.max(0, def.hp - dmg);
    atk.hp = Math.max(0, atk.hp - ctr);
    return { dmg, ctr, am: as.m, dm: ds.m };
  }

  _aiTurn(s) {
    // Draw
    if (s.deck.length) s.a.hand.push(s.deck.pop());

    // Play best-synergy card
    if (s.a.hand.length > 0 && s.a.field.length < MAX_FIELD) {
      let bi = 0, bs = -1;
      for (let i = 0; i < s.a.hand.length; i++) {
        s.a.field.push(s.a.hand[i]);
        const sy = this.syn(s.a.field, s.a.field.length - 1);
        if (sy.m + sy.edges > bs) { bs = sy.m + sy.edges; bi = i; }
        s.a.field.pop();
      }
      const c = s.a.hand.splice(bi, 1)[0];
      s.a.field.push(c);
      const sy = this.syn(s.a.field, s.a.field.length - 1);
      s.log.push(`Opp played ${c.title}${sy.edges ? ` (${sy.edges} bonds)` : ""}`);
    }

    // Attack weakest player card
    if (s.a.field.length > 0 && s.p.field.length > 0) {
      let ba = -1, aI = 0;
      for (let i = 0; i < s.a.field.length; i++) {
        const eff = s.a.field[i].atk * this.syn(s.a.field, i).m;
        if (eff > ba) { ba = eff; aI = i; }
      }
      let mh = Infinity, dI = 0;
      for (let i = 0; i < s.p.field.length; i++) {
        if (s.p.field[i].hp < mh) { mh = s.p.field[i].hp; dI = i; }
      }

      const atk = s.a.field[aI], def = s.p.field[dI];
      const r = this._combat(atk, s.a.field, aI, def, s.p.field, dI);
      s.log.push(`${atk.title} ⚔ your ${def.title} — ${r.dmg} dmg`);
      if (def.hp <= 0) { s.p.field.splice(dI, 1); s.log.push(`Your ${def.title} destroyed`); }
      if (atk.hp <= 0) {
        const ni = s.a.field.indexOf(atk);
        if (ni >= 0) s.a.field.splice(ni, 1);
        s.log.push(`Opp ${atk.title} fell`);
      }
    }
  }

  _newTurn(s) {
    s.turn++;
    if (s.deck.length) s.p.hand.push(s.deck.pop());
    s.phase = "play";
    s.selAtk = -1;
    s.log.push(`─ Turn ${s.turn} ─`);
  }

  _checkEnd(s) {
    const pd = s.p.field.length === 0 && s.p.hand.length === 0;
    const ad = s.a.field.length === 0 && s.a.hand.length === 0;
    if (pd && ad)      { s.winner = "draw";   s.phase = "over"; s.log.push("Draw — both exhausted"); }
    else if (pd)       { s.winner = "ai";     s.phase = "over"; s.log.push("Defeat — your nexus collapsed"); }
    else if (ad)       { s.winner = "player"; s.phase = "over"; s.log.push("Victory — opponent's nexus destroyed"); }
    else if (s.turn >= MAX_TURNS) {
      const ph = s.p.field.reduce((a, c) => a + c.hp, 0);
      const ah = s.a.field.reduce((a, c) => a + c.hp, 0);
      s.winner = ph > ah ? "player" : ph < ah ? "ai" : "draw";
      s.phase = "over";
      s.log.push(`Time! ${s.winner === "player" ? "Victory" : s.winner === "ai" ? "Defeat" : "Draw"} (${ph} vs ${ah} HP)`);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// UI RENDERER
// ══════════════════════════════════════════════════════════════

let engine = null;
let st = null;    // game state
let emb = null, embIdx = null;

async function loadEmb() {
  const [jr, br] = await Promise.all([
    fetch("data/embeddings.json"),
    fetch("data/embeddings.bin"),
  ]);
  if (!jr.ok || !br.ok) throw new Error("Embeddings unavailable");
  embIdx = await jr.json();
  emb = new Float32Array(await br.arrayBuffer());
}

function miniCard(card, opts = {}) {
  const cat = CATEGORIES[card.category] || {};
  const hpPct = Math.round((card.hp / card.maxHp) * 100);
  const hpClr = hpPct > 60 ? "#4caf50" : hpPct > 30 ? "#ff9800" : "#f44336";
  const syn = opts.syn;
  const cls = [
    "nx-card",
    `rarity-${card.rarity}`,
    opts.selected ? "nx-sel" : "",
    opts.click ? "nx-click" : "",
  ].filter(Boolean).join(" ");

  return `<div class="${cls}" data-i="${opts.i ?? ""}">
    <div class="nx-cat" style="background:${cat.color || "#555"}">${cat.name || ""}</div>
    <div class="nx-title">${card.title}</div>
    <div class="nx-row">
      <span class="nx-a">ATK ${Math.round(card.atk * (syn?.m || 1))}</span>
      <span class="nx-d">DEF ${Math.round(card.def * (syn?.m || 1))}</span>
      ${syn && syn.edges > 0 ? `<span class="nx-syn-badge">${syn.edges}B ×${syn.m.toFixed(1)}</span>` : ""}
    </div>
    <div class="nx-hp-track"><div class="nx-hp-bar" style="width:${hpPct}%;background:${hpClr}"></div></div>
    <div class="nx-hp">${card.hp}/${card.maxHp}</div>
  </div>`;
}

function handCard(card, i) {
  const cat = CATEGORIES[card.category] || {};
  return `<div class="nx-hcard nx-click rarity-${card.rarity}" data-hi="${i}">
    <div class="nx-cat" style="background:${cat.color || "#555"}">${cat.name || ""}</div>
    <div class="nx-title">${card.title}</div>
    <div class="nx-row">
      <span class="nx-a">ATK ${card.atk}</span>
      <span class="nx-d">DEF ${card.def}</span>
    </div>
    <div class="nx-hp">HP ${card.maxHp}</div>
    <div class="nx-rbadge">${RARITY_TAG[card.rarity] || "C"}</div>
  </div>`;
}

function drawEdges(el, field) {
  el.querySelector(".nx-edges")?.remove();
  const edges = engine.edges(field);
  if (edges.length === 0) return;

  const cards = el.querySelectorAll(".nx-card");
  if (cards.length < 2) return;

  const cr = el.getBoundingClientRect();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("nx-edges");
  svg.setAttribute("width", cr.width);
  svg.setAttribute("height", cr.height);

  for (const e of edges) {
    const a = cards[e.i]?.getBoundingClientRect();
    const b = cards[e.j]?.getBoundingClientRect();
    if (!a || !b) continue;

    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", a.left + a.width / 2 - cr.left);
    line.setAttribute("y1", a.top + a.height / 2 - cr.top);
    line.setAttribute("x2", b.left + b.width / 2 - cr.left);
    line.setAttribute("y2", b.top + b.height / 2 - cr.top);
    const alpha = Math.min(0.8, 0.3 + (e.s - SYN_THRESHOLD) * 2);
    line.setAttribute("stroke", `rgba(201,168,76,${alpha})`);
    line.setAttribute("stroke-width", Math.max(1.5, e.s * 4));
    if (e.s < 0.5) line.setAttribute("stroke-dasharray", "4,3");
    svg.appendChild(line);
  }
  el.appendChild(svg);
}

function render() {
  if (!st) return;

  // ── Status ──
  const statusEl = document.getElementById("nx-status");
  const phaseTxt = {
    play: "Play a card from your hand or skip",
    attack: st.p.field.length && st.a.field.length
      ? (st.selAtk >= 0 ? "Select an opponent's card to attack" : "Select your card to attack with, or skip")
      : "No targets — skip",
    over: st.winner === "player" ? "Victory!" : st.winner === "ai" ? "Defeat" : "Draw",
  };

  statusEl.innerHTML = `
    <div class="nx-turn-row">
      <span class="nx-turn">Turn ${st.turn}/${MAX_TURNS}</span>
      <span class="nx-deck-count">${st.deck.length} in deck</span>
    </div>
    <div class="nx-phase-text ${st.phase === "over" ? "nx-phase-" + st.winner : ""}">${phaseTxt[st.phase]}</div>
    <div class="nx-power-row">
      <span class="nx-pow nx-pow-you">You ${engine.power(st.p.field)}</span>
      <span class="nx-pow-vs">vs</span>
      <span class="nx-pow nx-pow-opp">Opp ${engine.power(st.a.field)}</span>
    </div>
  `;

  // ── Opponent field ──
  const oppEl = document.getElementById("nx-opp-field");
  if (st.a.field.length === 0) {
    oppEl.innerHTML = `<div class="nx-empty">No cards</div>`;
  } else {
    oppEl.innerHTML = st.a.field.map((c, i) =>
      miniCard(c, { i, syn: engine.syn(st.a.field, i), click: st.phase === "attack" && st.selAtk >= 0 })
    ).join("");
  }

  // ── Player field ──
  const pEl = document.getElementById("nx-player-field");
  if (st.p.field.length === 0) {
    pEl.innerHTML = `<div class="nx-empty">No cards</div>`;
  } else {
    pEl.innerHTML = st.p.field.map((c, i) =>
      miniCard(c, { i, syn: engine.syn(st.p.field, i), selected: st.selAtk === i, click: st.phase === "attack" && st.selAtk < 0 })
    ).join("");
  }

  // ── Edges (after layout) ──
  requestAnimationFrame(() => {
    drawEdges(oppEl, st.a.field);
    drawEdges(pEl, st.p.field);
  });

  // ── Hand ──
  const hEl = document.getElementById("nx-hand");
  hEl.innerHTML = st.p.hand.length
    ? st.p.hand.map((c, i) => handCard(c, i)).join("")
    : `<div class="nx-empty">No cards in hand</div>`;

  // ── Actions ──
  const actEl = document.getElementById("nx-actions");
  if (st.phase === "play") {
    actEl.innerHTML = `<button class="nx-btn" id="nx-skip-play">Skip Play</button>`;
    document.getElementById("nx-skip-play").onclick = () => { engine.skipPlay(st); render(); };
  } else if (st.phase === "attack") {
    actEl.innerHTML = `
      <button class="nx-btn" id="nx-skip-atk">Skip Attack</button>
      ${st.selAtk >= 0 ? `<button class="nx-btn nx-btn-cancel" id="nx-cancel">Cancel</button>` : ""}
    `;
    document.getElementById("nx-skip-atk").onclick = () => { engine.skipAttack(st); render(); };
    document.getElementById("nx-cancel")?.addEventListener("click", () => { st.selAtk = -1; render(); });
  } else if (st.phase === "over") {
    actEl.innerHTML = `
      <div class="nx-result nx-result-${st.winner}">${st.winner === "player" ? "You win!" : st.winner === "ai" ? "You lose." : "Draw!"}</div>
      <button class="nx-btn nx-btn-start" id="nx-again">Play Again</button>
    `;
    document.getElementById("nx-again").onclick = startGame;
  }

  // ── Log ──
  const logEl = document.getElementById("nx-log");
  logEl.innerHTML = st.log.slice(-6).map(l => `<div class="nx-log-l">${l}</div>`).join("");
  logEl.scrollTop = logEl.scrollHeight;

  // ── Bind card clicks ──
  if (st.phase === "play") {
    hEl.querySelectorAll(".nx-hcard").forEach(el => {
      el.onclick = () => { engine.play(st, parseInt(el.dataset.hi)); render(); };
    });
  }
  if (st.phase === "attack" && st.selAtk < 0) {
    pEl.querySelectorAll(".nx-card.nx-click").forEach(el => {
      el.onclick = () => { st.selAtk = parseInt(el.dataset.i); render(); };
    });
  }
  if (st.phase === "attack" && st.selAtk >= 0) {
    oppEl.querySelectorAll(".nx-card.nx-click").forEach(el => {
      el.onclick = () => { engine.attack(st, st.selAtk, parseInt(el.dataset.i)); render(); };
    });
  }

  // ── Bind card preview (non-actionable cards show preview on click) ──
  const previewCard = (card) => {
    const poolEntry = POOL.find(p => p[0] === card.title);
    const stats = poolEntry ? poolEntry[2] : { atk: card.atk, def: card.def, spc: card.spc || 50, spd: card.spd || 50, hp: card.maxHp * HP_SCALE, rarity: card.rarity };
    if (window._showCardPreview) window._showCardPreview("nx-preview", card.title, card.category, stats);
  };

  // Field cards that aren't clickable for actions → preview on click
  pEl.querySelectorAll(".nx-card:not(.nx-click)").forEach(el => {
    el.style.cursor = "pointer";
    el.onclick = () => previewCard(st.p.field[parseInt(el.dataset.i)]);
  });
  oppEl.querySelectorAll(".nx-card:not(.nx-click)").forEach(el => {
    el.style.cursor = "pointer";
    el.onclick = () => previewCard(st.a.field[parseInt(el.dataset.i)]);
  });

  // All field cards (even clickable ones) also preview on right-click
  [pEl, oppEl].forEach((fEl, fi) => {
    const field = fi === 0 ? st.p.field : st.a.field;
    fEl.querySelectorAll(".nx-card").forEach(el => {
      el.oncontextmenu = (e) => { e.preventDefault(); previewCard(field[parseInt(el.dataset.i)]); };
    });
  });

  // Hand cards → right-click to preview (left-click plays them)
  hEl.querySelectorAll(".nx-hcard").forEach(el => {
    el.oncontextmenu = (e) => { e.preventDefault(); previewCard(st.p.hand[parseInt(el.dataset.hi)]); };
  });
}

async function startGame() {
  const lobby = document.getElementById("nx-lobby");
  const gameEl = document.getElementById("nx-game");
  const loadEl = document.getElementById("nx-load-status");

  try {
    if (!emb) {
      loadEl.textContent = "Loading embeddings...";
      await loadEmb();
    }
    engine = new NexusEngine(emb, embIdx);
    st = engine.start();
    lobby.classList.add("hidden");
    gameEl.classList.remove("hidden");
    render();
  } catch (err) {
    loadEl.textContent = "Failed: " + err.message;
    console.error(err);
  }
}

export function initNexus() {
  document.getElementById("nx-start").addEventListener("click", startGame);
}
