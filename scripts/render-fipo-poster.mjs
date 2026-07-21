#!/usr/bin/env node
/* scripts/render-fipo-poster.mjs
 *
 * Renders FIPO poster paintings via the OpenAI Images API. The prompt is
 * assembled by fipo/poster/project.js from the genome — nothing freestyles.
 *
 * Sentinel: fipo/poster/img/<seed>.png. Re-running is a no-op for seeds that
 * already have a painting (delete the PNG to force a re-render).
 *
 * Every render logs fipo/poster/prompts/<seed>.json — genome + projection +
 * prompt + promptVersion together, so the archive is inspectable and
 * template versions are A/B-testable against judge outcomes (charter §6).
 *
 * Args:
 *   --seeds   "1,42,1729" | "range:0-49"      default: range:0-4
 *   --quality "low" | "medium" | "high"        default: medium
 *   --model   "gpt-image-1" | "dall-e-3"       default: gpt-image-1
 *   --force                                    re-render even if PNG exists
 *   --dry                                      print prompts only
 *
 * Env: OPENAI_API_KEY (required unless --dry).
 */
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FIPO = require("../fipo/pitch/engine.js");
const FIPO_POSTER = require("../fipo/poster/project.js");

const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const seedsArg = getArg("--seeds", "range:0-4");
const quality = getArg("--quality", "medium");
const model = getArg("--model", "gpt-image-1");
const dryRun = args.includes("--dry");
const force = args.includes("--force");

const KEY = process.env.OPENAI_API_KEY;
if (!KEY && !dryRun) { console.error("OPENAI_API_KEY not set"); process.exit(1); }

const IMG_DIR = path.join(process.cwd(), "fipo/poster/img");
const LOG_DIR = path.join(process.cwd(), "fipo/poster/prompts");
await fs.mkdir(IMG_DIR, { recursive: true });
await fs.mkdir(LOG_DIR, { recursive: true });

let seeds;
if (seedsArg.startsWith("range:")) {
  const [a, b] = seedsArg.slice(6).split("-").map(Number);
  seeds = Array.from({ length: b - a + 1 }, (_, i) => a + i);
} else {
  seeds = seedsArg.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isInteger(n) && n >= 0);
}

const existing = new Set(await fs.readdir(IMG_DIR).catch(() => []));
const targets = force ? seeds : seeds.filter((s) => !existing.has(`${s}.png`));
console.log(`Seeds: [${seeds.join(", ")}] — ${targets.length} to render, ${seeds.length - targets.length} on disk. model=${model} quality=${quality}${dryRun ? " (dry)" : ""}`);

for (const seed of targets) {
  const genome = FIPO.generate(seed);
  const proj = FIPO_POSTER.project(genome);
  console.log(`\n[${seed}] “${genome.title.text}” (${genome.production.era.id}, brief: ${proj.brief.fidelity})`);
  if (dryRun) { console.log(proj.prompt); continue; }

  const body = model === "gpt-image-1"
    ? { model, prompt: proj.prompt, n: 1, size: "1024x1536", quality }
    : { model, prompt: proj.prompt, n: 1, size: "1024x1792", quality: quality === "high" ? "hd" : "standard", response_format: "b64_json" };

  const resp = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    console.error(`  ✗ ${resp.status}: ${(await resp.text()).slice(0, 400)}`);
    continue;
  }
  const json = await resp.json();
  const b64 = json.data?.[0]?.b64_json;
  const url = json.data?.[0]?.url;
  let buf;
  if (b64) buf = Buffer.from(b64, "base64");
  else if (url) buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  else { console.error("  ✗ no image payload in response"); continue; }

  await fs.writeFile(path.join(IMG_DIR, `${seed}.png`), buf);
  await fs.writeFile(path.join(LOG_DIR, `${seed}.json`), JSON.stringify({
    seed, promptVersion: proj.promptVersion, model, quality,
    genome, projection: proj, renderedAt: new Date().toISOString()
  }, null, 2));
  console.log(`  ✓ wrote fipo/poster/img/${seed}.png (${(buf.length / 1024).toFixed(0)} KB) + prompts/${seed}.json`);
}
