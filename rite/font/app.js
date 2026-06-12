// Roll — front end. Loads the Rust/WASM engine, rolls a font from a seed, loads
// the resulting bytes as a real FontFace (proving it's a genuine font, not a
// canvas drawing), renders the specimen, and wires the .ttf download.
//
// The seed lives in the URL (?s=...), so every roll is a shareable permalink —
// the same determinism the breeding/phylogeny view will build on next.

import init, { roll, describe } from "/font/pkg/minofont.js";

const $ = (id) => document.getElementById(id);
const status = $("status");

let loadCount = 0;
let currentUrl = null;

function seedFromUrl() {
  return new URLSearchParams(location.search).get("s");
}

function randomSeed() {
  // Unseeded roll is the ONE allowed non-deterministic step: it only chooses
  // which deterministic font to open. Everything downstream is reproducible.
  return Math.random().toString(36).slice(2, 10);
}

async function show(seed) {
  const bytes = roll(seed); // Uint8Array of real .ttf
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

  let info;
  try {
    info = JSON.parse(describe(seed));
  } catch {
    info = {};
  }
  dl.download = `${(info.family || "MinoRoll").replace(/\s+/g, "")}.ttf`;

  $("seed").value = seed;
  renderMeta(info, bytes.length);
  status.textContent = `Rolled “${info.family || seed}” — a valid TrueType font, ${(
    bytes.length / 1024
  ).toFixed(1)} KB.`;
}

function renderMeta(info, size) {
  const chips = [
    ["Family", info.family ?? "—"],
    ["Weight", info.weightClass ?? "—"],
    ["Stem", info.stem ?? "—"],
    ["Thin", info.thin ?? "—"],
    ["Contrast", info.contrast ?? "—"],
    ["Width", info.width ?? "—"],
    ["Slant°", info.slant ?? "—"],
    ["Pen°", info.pen ?? "—"],
    ["Aperture", info.aperture ?? "—"],
    ["Arch", info.arch ?? "—"],
    ["Serif", info.serif ? "yes" : "no"],
    ["Bytes", size],
  ];
  $("meta").innerHTML = chips
    .map(([k, v]) => `<div class="chip"><b>${v}</b><span>${k}</span></div>`)
    .join("");
}

function go(seed, push) {
  const url = new URL(location);
  url.searchParams.set("s", seed);
  if (push) history.pushState({}, "", url);
  else history.replaceState({}, "", url);
  show(seed).catch((e) => (status.textContent = "Error: " + e.message));
}

async function main() {
  try {
    await init();
  } catch (e) {
    status.textContent = "Failed to load engine: " + e.message;
    return;
  }
  $("roll").addEventListener("click", () => go(randomSeed(), true));
  $("apply").addEventListener("click", () => {
    const s = $("seed").value.trim();
    if (s) go(s, true);
  });
  $("seed").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("apply").click();
  });
  window.addEventListener("popstate", () => {
    const s = seedFromUrl();
    if (s) show(s);
  });

  go(seedFromUrl() || randomSeed(), false);
}

main();
