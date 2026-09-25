// Roll — front end.
//
// The engine (Rust → WASM) runs in a small pool of module workers, so the page
// never blocks while a font is drawn. State is a (seed, spec) pair: the seed
// names a roll, the spec is the genome written out as `key=value;…` (empty =
// the seed's own genome). Both live in the URL, so a link *is* the font.
//
// Live edits build only the glyphs on screen (`roll_subset`); the full face
// (every glyph, kerning, GPOS) is built when an edit settles, and is what the
// download button hands over.

const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- workers

const POOL = Math.max(2, Math.min(4, (navigator.hardwareConcurrency || 4) - 1));
const workers = [];
let nextId = 1;
const pending = new Map();

for (let i = 0; i < POOL; i++) {
  const w = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  w.busy = 0;
  w.onmessage = (e) => {
    const { id, ok, result, error, ms } = e.data;
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    p.w.busy--;
    ok ? p.resolve({ result, ms }) : p.reject(new Error(error));
  };
  workers.push(w);
}

/** Run an engine op. `lane` pins it to one worker (keeps the main face ordered). */
function call(op, args = [], lane = -1) {
  const w = lane >= 0 ? workers[lane % POOL] : workers.reduce((a, b) => (b.busy < a.busy ? b : a));
  const id = nextId++;
  w.busy++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, w });
    w.postMessage({ id, op, args });
  });
}

// ---------------------------------------------------------------- fonts

let faceSerial = 0;
/** Load bytes as a FontFace; returns the family name. */
async function loadFace(bytes) {
  const family = `roll-${++faceSerial}`;
  const face = new FontFace(family, bytes);
  await face.load();
  document.fonts.add(face);
  return { family, face };
}
function dropFace(f) {
  if (f && f.face) {
    try {
      document.fonts.delete(f.face);
    } catch {}
  }
}

// ---------------------------------------------------------------- state

const state = {
  seed: "",
  spec: "",
  genome: null, // describe() JSON
  arch: -1, // archetype chip (-1 = any)
  wander: 1,
  rate: 1,
  litter: 0,
};
let GENES = []; // [key, min, max]
let ARCHES = [];
let CHARSET = "";
let mainFace = null;
let downloadUrl = null;

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
};

function randomSeed() {
  // the one non-deterministic step: it only chooses which deterministic font to open
  const a = "bcdfghjklmnpqrstvwxz";
  const v = "aeiouy";
  let s = "";
  for (let i = 0; i < 3; i++) s += a[(Math.random() * a.length) | 0] + v[(Math.random() * v.length) | 0];
  return s + ((Math.random() * 90 + 10) | 0);
}

function specOf(obj) {
  return Object.entries(obj)
    .map(([k, v]) => `${k}=${typeof v === "boolean" ? (v ? 1 : 0) : v}`)
    .join(";");
}
/** Genome JSON → a full spec (every gene explicit). */
function fullSpec(g) {
  const o = {};
  for (const [k] of GENES) o[k] = +(+g[k]).toFixed(4);
  o.term = g.term;
  o.serif = g.serif;
  for (const b of ["ball", "a2", "g2", "tail_y", "spur", "mono", "italic"]) o[b] = !!g[b];
  return specOf(o);
}

// ---------------------------------------------------------------- URL

function readUrl() {
  const q = new URLSearchParams(location.search);
  return { seed: q.get("s"), spec: q.get("g") || "" };
}
function writeUrl(push) {
  const url = new URL(location);
  url.searchParams.set("s", state.seed);
  if (state.spec) url.searchParams.set("g", state.spec);
  else url.searchParams.delete("g");
  push ? history.pushState({}, "", url) : history.replaceState({}, "", url);
}

// ---------------------------------------------------------------- the main face

let renderToken = 0;
let fullTimer = 0;

function visibleText() {
  // what a live preview has to be able to set
  const bits = [$("hero-text").textContent, $("family").textContent, "Roll.", "Rag"];
  const pane = document.querySelector(".pane:not([hidden])");
  if (pane) bits.push(pane.textContent);
  return bits.join("");
}

/** Redraw the current font. `full` builds every glyph (for the download). */
async function render({ full = true, push = false } = {}) {
  const token = ++renderToken;
  document.body.classList.add("loading");
  try {
    const [{ result: json }, built] = await Promise.all([
      call("describe", [state.seed, state.spec], 0),
      full
        ? call("roll_params", [state.seed, state.spec], 0)
        : call("roll_subset", [state.seed, state.spec, visibleText()], 0),
    ]);
    if (token !== renderToken) return;
    state.genome = JSON.parse(json);
    const loaded = await loadFace(built.result);
    if (token !== renderToken) {
      dropFace(loaded);
      return;
    }
    const old = mainFace;
    mainFace = loaded;
    document.documentElement.style.setProperty("--roll", `"${loaded.family}"`);
    requestAnimationFrame(() => dropFace(old));
    showIdentity();
    syncControls();
    if (full) {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
      downloadUrl = URL.createObjectURL(new Blob([built.result], { type: "font/ttf" }));
      const a = $("download");
      a.href = downloadUrl;
      const g = state.genome;
      a.download = `${g.family.replace(/\s+/g, "")}-${g.style.replace(/\s+/g, "")}.ttf`;
      $("status").textContent = `${(built.result.byteLength / 1024).toFixed(0)} KB · drawn in ${built.ms.toFixed(0)} ms · CC0`;
      writeUrl(push);
      remember();
    } else {
      $("status").textContent = "drawing…";
      clearTimeout(fullTimer);
      fullTimer = setTimeout(() => render({ full: true }), 450);
    }
  } catch (e) {
    $("status").textContent = "Engine error: " + e.message;
  } finally {
    if (token === renderToken) document.body.classList.remove("loading");
  }
}

/** Flip between this roll and its italic (or roman) companion. */
function companion() {
  const g = { ...state.genome };
  if (g.italic) {
    g.italic = false;
    g.slant = 0;
  } else {
    g.italic = true;
    g.slant = Math.max(g.slant, 10);
  }
  state.genome = g;
  state.spec = fullSpec(g);
  render({ full: true, push: true }).then(() => litter());
}

function showIdentity() {
  const g = state.genome;
  $("companion").textContent = g.italic ? "Roman companion" : "Italic companion";
  $("family").textContent = `${g.family} ${g.style}`;
  const contrast = Math.round((1 - g.ratio) * 100);
  const tags = [
    [g.archetype, true],
    [`wght ${g.weightClass}`],
    [`wdth ${Math.round(g.width * 100)}`],
    [`contrast ${contrast}%`],
    [g.serif === "none" ? "sans" : `${g.serif} serif`],
    [g.italic ? "italic" : g.slant > 2 ? `oblique ${g.slant.toFixed(0)}°` : null],
    [`seed ${state.seed}`],
  ].filter((t) => t[0]);
  $("tags").innerHTML = tags.map(([t, a]) => `<span class="tag${a ? " accent" : ""}">${esc(t)}</span>`).join("");
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

// ---------------------------------------------------------------- rolling

async function roll() {
  const seed = randomSeed();
  let spec = "";
  if (state.arch >= 0 || state.wander !== 1) {
    spec = (await call("archetype_spec", [state.arch, state.wander, seed])).result;
  }
  goTo(seed, spec, true);
}

function goTo(seed, spec, push) {
  state.seed = seed;
  state.spec = spec;
  render({ full: true, push }).then(() => litter());
}

// ---------------------------------------------------------------- breeding

function gauss() {
  let u = 0;
  for (let i = 0; i < 6; i++) u += Math.random();
  return (u - 3) / 1.0;
}
const TERMS = ["h", "v", "p", "pen", "round"];
const SERIFS = ["none", "bracketed", "slab", "hairline"];
// genes that shouldn't drift on their own (posture, spacing, overshoot)
const STILL = new Set(["slant", "over"]);

function mutate(g, rate) {
  const o = {};
  for (const [k, lo, hi] of GENES) {
    let v = +g[k];
    if (!STILL.has(k)) v += gauss() * (hi - lo) * 0.045 * rate;
    o[k] = +Math.min(hi, Math.max(lo, v)).toFixed(4);
  }
  o.term = Math.random() < 0.07 * rate ? TERMS[(Math.random() * TERMS.length) | 0] : g.term;
  o.serif = Math.random() < 0.05 * rate ? SERIFS[(Math.random() * SERIFS.length) | 0] : g.serif;
  for (const b of ["ball", "a2", "g2", "tail_y", "spur"]) o[b] = Math.random() < 0.09 * rate ? !g[b] : !!g[b];
  o.mono = !!g.mono;
  o.italic = !!g.italic;
  return specOf(o);
}

const KID_TEXT = "RagHamburgefonts";
let kidFaces = [];

async function litter() {
  if (!state.genome) return;
  const n = ++state.litter;
  kidFaces.forEach(dropFace);
  kidFaces = [];
  const box = $("kids");
  const kids = [];
  for (let i = 0; i < 8; i++) {
    kids.push({ seed: `${state.seed}.${n}${String.fromCharCode(97 + i)}`, spec: mutate(state.genome, state.rate) });
  }
  box.innerHTML = kids
    .map(
      (k, i) => `<button class="kid pending" type="button" data-i="${i}" aria-label="Adopt offspring ${i + 1}">
        <span class="adopt">adopt →</span>
        <span class="big">Rag</span><span class="small">Hamburgefonts</span><span class="meta">…</span></button>`
    )
    .join("");
  box.querySelectorAll(".kid").forEach((el) => {
    el.onclick = () => {
      const k = kids[+el.dataset.i];
      goTo(k.seed, k.spec, true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
  });
  await Promise.all(
    kids.map(async (k, i) => {
      try {
        const [{ result: bytes }, { result: json }] = await Promise.all([
          call("roll_subset", [k.seed, k.spec, KID_TEXT]),
          call("describe", [k.seed, k.spec]),
        ]);
        if (n !== state.litter) return;
        const f = await loadFace(bytes);
        if (n !== state.litter) return dropFace(f);
        kidFaces.push(f);
        const el = box.children[i];
        const g = JSON.parse(json);
        for (const s of el.querySelectorAll(".big,.small")) s.style.fontFamily = `"${f.family}"`;
        el.querySelector(".meta").textContent = `${g.archetype.toLowerCase()} · ${g.style.toLowerCase()}`;
        el.classList.remove("pending");
      } catch (e) {
        console.warn(e);
      }
    })
  );
}

// ---------------------------------------------------------------- lineage

let lineage = store.get("roll.lineage", []);
let lineFaces = [];

function remember() {
  const g = state.genome;
  const key = state.seed + "|" + state.spec;
  lineage = lineage.filter((e) => e.key !== key);
  lineage.unshift({ key, seed: state.seed, spec: state.spec, name: g.family.replace("Mino Roll ", ""), style: g.style });
  lineage = lineage.slice(0, 14);
  store.set("roll.lineage", lineage);
  drawLineage();
}

async function drawLineage() {
  const nav = $("lineage");
  lineFaces.forEach(dropFace);
  lineFaces = [];
  const cur = state.seed + "|" + state.spec;
  nav.innerHTML = lineage
    .map(
      (e, i) =>
        `<button class="anc${e.key === cur ? " on" : ""}" type="button" data-i="${i}" title="${esc(e.name + " " + e.style)}"><span class="g">Ag</span><span class="n">${esc(e.name)}</span></button>`
    )
    .join("");
  nav.querySelectorAll(".anc").forEach((el) => {
    el.onclick = () => {
      const e = lineage[+el.dataset.i];
      goTo(e.seed, e.spec, true);
    };
  });
  lineage.forEach(async (e, i) => {
    try {
      const { result } = await call("roll_subset", [e.seed, e.spec, "Ag"]);
      const f = await loadFace(result);
      lineFaces.push(f);
      const el = nav.children[i];
      if (el) el.querySelector(".g").style.fontFamily = `"${f.family}"`;
    } catch {}
  });
}

// ---------------------------------------------------------------- tune

const GROUPS = [
  {
    name: "Stroke",
    note: "the pen",
    open: true,
    keys: [
      ["stem", "Weight"],
      ["ratio", "Thin ÷ thick"],
      ["stress", "Stress angle°"],
      ["nib", "Nib squareness"],
      ["trap", "Ink traps"],
    ],
  },
  {
    name: "Skeleton",
    note: "proportion and construction",
    open: true,
    keys: [
      ["width", "Width"],
      ["prop", "Uniform ↔ classical"],
      ["xh", "x-height"],
      ["asc", "Ascender"],
      ["desc", "Descender"],
      ["round", "Roundness of O"],
      ["sup", "Squareness"],
      ["aperture", "Aperture"],
      ["bar", "Crossbar height"],
      ["join", "Arch join"],
      ["over", "Overshoot"],
    ],
  },
  {
    name: "Serifs",
    note: "and how they meet the stem",
    keys: [
      ["serif", "Serifs", ["none", "bracketed", "slab", "hairline"]],
      ["serif_len", "Serif length"],
      ["serif_th", "Serif thickness"],
      ["bracket", "Bracketing"],
      ["head", "Head slope°"],
    ],
  },
  {
    name: "Details",
    note: "terminals and alternates",
    keys: [
      ["term", "Terminals", [["h", "cut level"], ["v", "cut plumb"], ["p", "cut square"], ["pen", "pen"], ["round", "round"]]],
      ["ball", "Ball terminals", "bool"],
      ["a2", "Double-story a", "bool"],
      ["g2", "Double-story g", "bool"],
      ["tail_y", "Curled y tail", "bool"],
      ["spur", "Spur on G", "bool"],
      ["leg_r", "R leg: straight ↔ curled"],
    ],
  },
  {
    name: "Setting",
    note: "spacing and posture",
    keys: [
      ["spacing", "Spacing"],
      ["italic", "True italic (cursive forms)", "bool"],
      ["slant", "Slant°"],
      ["mono", "Monospaced", "bool"],
    ],
  },
];

function geneRange(k) {
  return GENES.find((g) => g[0] === k);
}

function buildControls() {
  const root = $("groups");
  root.innerHTML = GROUPS.map(
    (grp) => `<details ${grp.open ? "open" : ""}><summary>${grp.name} <small>${grp.note}</small></summary><div class="ctls">${grp.keys
      .map(([k, label, kind]) => {
        if (kind === "bool") return `<label class="ctl tog"><input type="checkbox" id="c-${k}" data-k="${k}" /> <span>${label}</span></label>`;
        if (Array.isArray(kind)) {
          const opts = kind.map((o) => (Array.isArray(o) ? o : [o, o])).map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
          return `<div class="ctl"><label for="c-${k}">${label}</label><span></span><select id="c-${k}" data-k="${k}">${opts}</select></div>`;
        }
        const r = geneRange(k);
        if (!r) return "";
        const step = (r[2] - r[1]) / 200;
        return `<div class="ctl"><label for="c-${k}">${label}</label><output id="o-${k}"></output><input type="range" id="c-${k}" data-k="${k}" min="${r[1]}" max="${r[2]}" step="${step}" /></div>`;
      })
      .join("")}</div></details>`
  ).join("");

  const edit = (k, v, settle) => {
    const g = { ...state.genome, [k]: v };
    state.genome = g;
    state.spec = fullSpec(g);
    if (settle) render({ full: true, push: false });
    else render({ full: false });
  };
  root.querySelectorAll("input[type=range]").forEach((el) => {
    let raf = 0;
    el.addEventListener("input", () => {
      $(`o-${el.dataset.k}`).textContent = fmt(el.dataset.k, +el.value);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => edit(el.dataset.k, +el.value, false));
    });
    el.addEventListener("change", () => edit(el.dataset.k, +el.value, true));
  });
  root.querySelectorAll("input[type=checkbox]").forEach((el) => el.addEventListener("change", () => edit(el.dataset.k, el.checked, true)));
  root.querySelectorAll("select").forEach((el) => el.addEventListener("change", () => edit(el.dataset.k, el.value, true)));
}

function fmt(k, v) {
  if (k === "stem") return v.toFixed(0);
  if (["stress", "head", "slant"].includes(k)) return v.toFixed(0) + "°";
  if (k === "ratio") return v.toFixed(2);
  return v.toFixed(2);
}

function syncControls() {
  const g = state.genome;
  if (!g) return;
  for (const el of document.querySelectorAll("#groups [data-k]")) {
    const k = el.dataset.k;
    if (el.type === "checkbox") el.checked = !!g[k];
    else if (el.tagName === "SELECT") el.value = g[k];
    else if (document.activeElement !== el) {
      el.value = g[k];
      const o = $(`o-${k}`);
      if (o) o.textContent = fmt(k, +g[k]);
    }
  }
}

// ---------------------------------------------------------------- specimen

const FALL_TEXT = "Hamburgefontsiv — the quick brown fox jumps over the lazy dog";
function buildSheet() {
  $("fall").innerHTML = [10, 12, 14, 16, 20, 24, 32, 40, 56, 72, 96, 128]
    .map((z) => `<div><span class="z">${z}</span><span class="s" style="font-size:${z}px">${FALL_TEXT}</span></div>`)
    .join("");
  const cells = [...CHARSET].filter((c) => c !== " ");
  $("glyphs").innerHTML = cells.map((c) => `<button type="button" data-c="${esc(c)}" title="U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}">${esc(c)}</button>`).join("");
  $("glyphs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    document.querySelectorAll("#glyphs button[aria-pressed]").forEach((x) => x.removeAttribute("aria-pressed"));
    b.setAttribute("aria-pressed", "true");
    zoom(b.dataset.c);
  });
  zoom("R");
  document.querySelectorAll(".tab").forEach((t) =>
    t.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((x) => x.setAttribute("aria-selected", String(x === t)));
      document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.id !== t.dataset.pane));
    })
  );
  $("kern-on").addEventListener("change", (e) => $("pairs").classList.toggle("off", !e.target.checked));
}

function zoom(c) {
  $("gz").textContent = c;
  const cp = c.codePointAt(0);
  $("gz-meta").innerHTML = `<dt>character</dt><dd>${esc(c)}</dd><dt>code point</dt><dd>U+${cp.toString(16).toUpperCase().padStart(4, "0")}</dd><dt>font</dt><dd>${esc(state.genome ? state.genome.family : "")}</dd>`;
}

// ---------------------------------------------------------------- chrome

function buildArches() {
  const box = $("arches");
  const all = [["Any", -1], ...ARCHES.map((n, i) => [n, i])];
  box.innerHTML = all.map(([n, i]) => `<button class="chip" type="button" data-i="${i}" aria-pressed="${i === state.arch}">${n}</button>`).join("");
  box.querySelectorAll(".chip").forEach((b) =>
    b.addEventListener("click", () => {
      state.arch = +b.dataset.i;
      store.set("roll.arch", state.arch);
      box.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      roll();
    })
  );
}

function initTheme() {
  const saved = store.get("roll.theme", null);
  if (saved) document.documentElement.dataset.theme = saved;
  $("theme").addEventListener("click", () => {
    const dark = matchMedia("(prefers-color-scheme: dark)").matches;
    const cur = document.documentElement.dataset.theme || (dark ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("roll.theme", next);
  });
}

async function main() {
  initTheme();
  try {
    const [a, g, c] = await Promise.all([call("archetypes"), call("genes"), call("charset")]);
    ARCHES = JSON.parse(a.result);
    GENES = JSON.parse(g.result);
    CHARSET = c.result;
  } catch (e) {
    $("family").textContent = "The engine failed to load: " + e.message;
    return;
  }
  state.arch = store.get("roll.arch", -1);
  buildArches();
  buildControls();
  buildSheet();

  $("roll").addEventListener("click", roll);
  $("litter").addEventListener("click", litter);
  $("companion").addEventListener("click", companion);
  $("wander").addEventListener("input", (e) => (state.wander = +e.target.value));
  $("rate").addEventListener("input", (e) => (state.rate = +e.target.value));
  $("reset").addEventListener("click", () => {
    state.spec = "";
    render({ full: true, push: true });
  });
  $("share").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(location.href);
      $("share").textContent = "Copied ✓";
    } catch {
      $("share").textContent = "Copy the address bar";
    }
    setTimeout(() => ($("share").textContent = "Copy link"), 1600);
  });
  document.addEventListener("keydown", (e) => {
    const t = e.target;
    const typing = t.isContentEditable || /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName);
    if (!typing && (e.key === "r" || e.key === "R") && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      roll();
    }
  });
  window.addEventListener("popstate", () => {
    const u = readUrl();
    if (u.seed) goTo(u.seed, u.spec, false);
  });
  // typing in the hero: make sure new characters exist in a subset preview
  $("hero-text").addEventListener("input", () => {});

  drawLineage();
  const u = readUrl();
  if (u.seed) goTo(u.seed, u.spec, false);
  else roll();
}

main();
