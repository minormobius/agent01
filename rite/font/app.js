// Roll — front end. Loads the Rust/WASM engine, rolls a font from a seed, loads
// the resulting bytes as a real FontFace (proving it's a genuine font, not a
// canvas drawing), renders the specimen, and wires the .ttf download.
//
// The seed lives in the URL (?s=...), so every roll is a shareable permalink.
// On top of that, a panel of live sliders overrides individual genome fields
// via roll_params(seed, spec) — reshaping the current roll in real time.

import init, { roll, roll_params, describe } from "/font/pkg/minofont.js";

const $ = (id) => document.getElementById(id);
const status = $("status");

let loadCount = 0;
let currentUrl = null;
let seed = "";
// The working genome (seeded, then mutated by sliders). Keys match the engine's
// `apply_spec` keys; values map 1:1 to slider positions.
let spec = {};

// Each control: spec key, label, range, step, and how to format the readout.
const CONTROLS = [
  { k: "stem", label: "Weight", min: 24, max: 260, step: 1, fmt: (v) => v.toFixed(0) },
  { k: "mod", label: "Modulation", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "pen", label: "Pen angle°", min: -10, max: 45, step: 1, fmt: (v) => v.toFixed(0) },
  { k: "width", label: "Width", min: 0.6, max: 1.6, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "slant", label: "Slant°", min: -8, max: 26, step: 1, fmt: (v) => v.toFixed(0) },
  { k: "xh", label: "x-height", min: 0.45, max: 0.9, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "aperture", label: "Aperture", min: 0.5, max: 1.6, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "arch", label: "Arch", min: 0, max: 1, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "bar", label: "Bar height", min: 0.3, max: 0.7, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "bowl", label: "Bowl wrap°", min: 0, max: 50, step: 1, fmt: (v) => v.toFixed(0) },
  { k: "over", label: "Overshoot", min: 0, max: 0.06, step: 0.002, fmt: (v) => v.toFixed(3) },
  { k: "asc", label: "Ascender", min: 0.85, max: 1.25, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "desc", label: "Descender", min: 0.08, max: 0.4, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "track", label: "Tracking", min: 0.5, max: 1.8, step: 0.02, fmt: (v) => v.toFixed(2) },
  { k: "round", label: "Round width", min: 0.78, max: 1.3, step: 0.01, fmt: (v) => v.toFixed(2) },
  { k: "seriflen", label: "Serif length", min: 0, max: 260, step: 2, fmt: (v) => v.toFixed(0) },
  { k: "serifth", label: "Serif height", min: 4, max: 130, step: 2, fmt: (v) => v.toFixed(0) },
];
const TOGGLES = [
  { k: "serif", label: "Serifs" },
  { k: "apex", label: "Flat-top A" },
  { k: "a2", label: "Double-story a" },
  { k: "g2", label: "Double-story g" },
  { k: "ball", label: "Ball terminals" },
];

function seedFromUrl() {
  return new URLSearchParams(location.search).get("s");
}

function randomSeed() {
  // Unseeded roll is the ONE allowed non-deterministic step: it only chooses
  // which deterministic font to open. Everything downstream is reproducible.
  return Math.random().toString(36).slice(2, 10);
}

function specString() {
  return Object.entries(spec)
    .map(([k, v]) => `${k}=${typeof v === "boolean" ? (v ? 1 : 0) : v}`)
    .join(";");
}

// Render the current (seed + spec) font: build bytes, load as a FontFace.
async function render() {
  const s = specString();
  const bytes = s ? roll_params(seed, s) : roll(seed);
  const family = `rolled-${loadCount++}`;
  const blob = new Blob([bytes], { type: "font/ttf" });

  if (currentUrl) URL.revokeObjectURL(currentUrl);
  currentUrl = URL.createObjectURL(blob);

  const face = new FontFace(family, `url(${currentUrl})`);
  await face.load();
  document.fonts.add(face);
  document.documentElement.style.setProperty("--rolled", `"${family}"`);

  const dl = $("download");
  dl.href = currentUrl;
  dl.download = `MinoRoll-${seed}.ttf`;

  status.textContent = `Rolled “${seed}” — a valid TrueType font, ${(
    bytes.length / 1024
  ).toFixed(1)} KB.`;
}

// Pull a fresh genome from a seed into `spec` and sync the sliders to it.
function loadGenome(s) {
  seed = s;
  let g;
  try {
    g = JSON.parse(describe(seed));
  } catch {
    g = {};
  }
  spec = {};
  for (const c of CONTROLS) if (g[c.k] != null) spec[c.k] = +g[c.k];
  for (const t of TOGGLES) if (g[t.k] != null) spec[t.k] = !!g[t.k];
  syncControls();
  renderMeta(g);
  $("seed").value = seed;
}

function syncControls() {
  for (const c of CONTROLS) {
    const el = $(`sl-${c.k}`);
    if (el && spec[c.k] != null) {
      el.value = spec[c.k];
      $(`out-${c.k}`).textContent = c.fmt(+spec[c.k]);
    }
  }
  for (const t of TOGGLES) {
    const el = $(`sl-${t.k}`);
    if (el && spec[t.k] != null) el.checked = !!spec[t.k];
  }
}

function renderMeta(g) {
  const chips = [
    ["Family", g.family ?? "—"],
    ["Weight", g.weightClass ?? "—"],
    ["Stem", g.stem ?? "—"],
    ["Thin", g.thin ?? "—"],
    ["Modulation", g.mod ?? "—"],
    ["Pen°", g.pen ?? "—"],
    ["Aperture", g.aperture ?? "—"],
    ["Arch", g.arch ?? "—"],
    ["Serif", g.serif ? "yes" : "no"],
  ];
  $("meta").innerHTML = chips
    .map(([k, v]) => `<div class="chip"><b>${v}</b><span>${k}</span></div>`)
    .join("");
}

// Build the slider DOM once.
function buildControls() {
  const root = $("sliders");
  const parts = [];
  for (const c of CONTROLS) {
    parts.push(
      `<div class="ctl"><label for="sl-${c.k}">${c.label}</label>` +
        `<output id="out-${c.k}">—</output>` +
        `<input id="sl-${c.k}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" /></div>`
    );
  }
  for (const t of TOGGLES) {
    parts.push(
      `<div class="ctl toggle"><label for="sl-${t.k}">${t.label}</label>` +
        `<input id="sl-${t.k}" type="checkbox" /></div>`
    );
  }
  root.innerHTML = parts.join("");

  let raf = 0;
  const schedule = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      render().catch((e) => (status.textContent = "Error: " + e.message));
    });
  };
  for (const c of CONTROLS) {
    const el = $(`sl-${c.k}`);
    el.addEventListener("input", () => {
      spec[c.k] = +el.value;
      $(`out-${c.k}`).textContent = c.fmt(+el.value);
      schedule();
    });
  }
  for (const t of TOGGLES) {
    $(`sl-${t.k}`).addEventListener("change", (e) => {
      spec[t.k] = e.target.checked;
      schedule();
    });
  }
}

function go(s, push) {
  const url = new URL(location);
  url.searchParams.set("s", s);
  if (push) history.pushState({}, "", url);
  else history.replaceState({}, "", url);
  loadGenome(s);
  render().catch((e) => (status.textContent = "Error: " + e.message));
}

async function main() {
  try {
    await init();
  } catch (e) {
    status.textContent = "Failed to load engine: " + e.message;
    return;
  }
  buildControls();
  $("roll").addEventListener("click", () => go(randomSeed(), true));
  $("apply").addEventListener("click", () => {
    const s = $("seed").value.trim();
    if (s) go(s, true);
  });
  $("seed").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("apply").click();
  });
  $("reset").addEventListener("click", () => {
    loadGenome(seed);
    render().catch((e) => (status.textContent = "Error: " + e.message));
  });
  window.addEventListener("popstate", () => {
    const s = seedFromUrl();
    if (s) go(s, false);
  });

  go(seedFromUrl() || randomSeed(), false);
}

main();
