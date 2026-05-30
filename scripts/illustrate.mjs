#!/usr/bin/env node
/* scripts/illustrate.mjs
 *
 * The unified storybook illustrator. Knows about every tale registered in
 * scripts/illustrate/tales.mjs and renders missing spreads via the OpenAI
 * Images API (gpt-image-1, with a dall-e-3 fallback if the org isn't
 * verified).
 *
 * Sentinel: the PNG files themselves. By default this generates only spreads
 * whose image is missing, so it's safe to re-run on every push — once every
 * spread for a tale exists, subsequent invocations for that tale are no-ops.
 * Delete a spread's PNG (or pass --spreads all|0,5,12) to force regeneration.
 *
 * Args:
 *   --tale    <slug>                       which tale (gawain|culhwch|orfeo|pwyll); required unless --list
 *   --spreads "missing" | "all" | "0,5,12"  default: missing
 *   --quality "low" | "medium" | "high"     default: medium
 *   --model   "gpt-image-1" | "dall-e-3"    default: gpt-image-1
 *   --dry                                   print prompts only
 *   --list                                  print the tale registry and exit
 *
 * Env: OPENAI_API_KEY (required unless --dry or --list).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TALES } from "./illustrate/tales.mjs";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };

if (args.includes("--list")) {
  console.log("Registered tales:");
  for (const [slug, t] of Object.entries(TALES)) {
    console.log(`  ${slug.padEnd(10)} window.${t.bookGlobal}   ${t.storyFile} → ${t.imgDir}`);
  }
  process.exit(0);
}

const taleSlug = getArg("--tale", "");
const spreadsArg = getArg("--spreads", "missing");
const quality = getArg("--quality", "medium");
let model = getArg("--model", "gpt-image-1");
const dryRun = args.includes("--dry");

if (!taleSlug) { console.error("--tale <slug> required (try --list)"); process.exit(1); }
const tale = TALES[taleSlug];
if (!tale) { console.error(`Unknown tale "${taleSlug}". Known: ${Object.keys(TALES).join(", ")}`); process.exit(1); }

const KEY = process.env.OPENAI_API_KEY;
if (!KEY && !dryRun) { console.error("OPENAI_API_KEY not set"); process.exit(1); }

const STORY_FILE = path.join(ROOT, tale.storyFile);
const IMG_DIR = path.join(ROOT, tale.imgDir);

// Load storybook.js (a browser script that attaches to window.<BOOKGLOBAL>)
const src = await fs.readFile(STORY_FILE, "utf8");
const win = { [tale.bookGlobal]: {} };
new Function("window", src)(win);
const spreads = win[tale.bookGlobal]?.book?.spreads;
if (!Array.isArray(spreads) || !spreads.length) {
  console.error(`No spreads found in ${tale.storyFile} (expected window.${tale.bookGlobal}.book.spreads)`);
  process.exit(1);
}

await fs.mkdir(IMG_DIR, { recursive: true });
const existing = new Set(await fs.readdir(IMG_DIR).catch(() => []));
const filenameFor = (i) => `spread-${String(i).padStart(2, "0")}.png`;
const have = (i) => existing.has(filenameFor(i));

let targets;
if (spreadsArg === "all") targets = spreads.map((_, i) => i);
else if (spreadsArg === "missing") targets = spreads.map((_, i) => i).filter((i) => !have(i));
else targets = spreadsArg.split(",").map((s) => +s.trim()).filter((n) => Number.isInteger(n) && n >= 0 && n < spreads.length);

const onDisk = spreads.map((_, i) => i).filter(have).length;
console.log(`[${taleSlug}] Spreads: ${spreads.length} total, ${onDisk} already on disk, ${targets.length} to generate.`);
if (targets.length === 0) { console.log("Nothing to do."); process.exit(0); }
console.log(`Generating: [${targets.join(", ")}] | model=${model} quality=${quality}${dryRun ? " (dry-run)" : ""}`);

function buildPrompt(spread) {
  const brief = spread.illus || `A scene from "${spread.title}"`;
  const pickedKeys = new Set();
  tale.triggers.forEach(([rx, k]) => { if (rx.test(brief)) pickedKeys.add(k); });
  const pinsBlock = [...pickedKeys].map((k) => tale.pins[k]).filter(Boolean).join(" ");
  return [tale.house, pinsBlock, "Scene: " + brief].filter(Boolean).join("\n\n");
}

async function generate(prompt) {
  const tries = model === "gpt-image-1" ? ["gpt-image-1", "dall-e-3"] : [model];
  let lastErr;
  for (const m of tries) {
    const body = m === "gpt-image-1"
      ? { model: m, prompt, n: 1, size: "1536x1024", quality }
      : { model: m, prompt, n: 1, size: "1792x1024", quality: quality === "high" ? "hd" : "standard", response_format: "b64_json" };
    const resp = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Authorization": `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (resp.ok) {
      const json = await resp.json();
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) throw new Error("response missing b64_json");
      if (m !== model) console.log(`  (fell back to ${m})`);
      return Buffer.from(b64, "base64");
    }
    const text = await resp.text();
    lastErr = new Error(`HTTP ${resp.status}: ${text.slice(0, 400)}`);
    if (m === "gpt-image-1" && resp.status === 403 && /verif/i.test(text)) {
      console.log(`  gpt-image-1 rejected (org not verified); trying dall-e-3…`);
      continue;
    }
    throw lastErr;
  }
  throw lastErr;
}

let made = 0, failed = 0;
for (const i of targets) {
  const s = spreads[i];
  const filename = filenameFor(i);
  const filepath = path.join(IMG_DIR, filename);
  const prompt = buildPrompt(s);
  console.log(`\n[${taleSlug} ${i}] ${s.title}`);
  console.log("  brief: " + (s.illus || "").slice(0, 140));
  if (dryRun) { console.log("  (dry-run, skipping)"); continue; }
  try {
    const png = await generate(prompt);
    await fs.writeFile(filepath, png);
    console.log(`  → wrote ${filename} (${(png.length / 1024).toFixed(0)} KB)`);
    made++;
  } catch (e) {
    console.error(`  FAILED: ${e.message}`);
    failed++;
  }
  await new Promise((r) => setTimeout(r, 1200));
}
console.log(`\n[${taleSlug}] Done. Generated ${made}, failed ${failed}.`);
process.exit(failed > 0 ? 1 : 0);
