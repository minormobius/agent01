#!/usr/bin/env node
/* scripts/illustrate-culhwch.mjs
 *
 * Generates storybook illustrations for read.mino.mobi/culhwch via the OpenAI
 * Images API (gpt-image-1, with a dall-e-3 fallback if the org isn't verified).
 *
 * Sentinel: the PNG files themselves. By default this generates only spreads
 * whose image is missing, so it's safe to re-run on every push — once all
 * 23 exist, subsequent invocations are no-ops. Delete a spread's PNG (or
 * pass --spreads all|0,5,12) to force regeneration.
 *
 * Args:
 *   --spreads "missing" | "all" | "0,5,12"     default: missing
 *   --quality "low" | "medium" | "high"        default: medium
 *   --model   "gpt-image-1" | "dall-e-3"       default: gpt-image-1
 *   --dry                                       print prompts only
 *
 * Env: OPENAI_API_KEY (required unless --dry).
 */
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const STORY_FILE = path.join(ROOT, "read/culhwch/storybook.js");
const IMG_DIR = path.join(ROOT, "read/culhwch/img");

const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const spreadsArg = getArg("--spreads", "missing");
const quality = getArg("--quality", "medium");
let model = getArg("--model", "gpt-image-1");
const dryRun = args.includes("--dry");

const KEY = process.env.OPENAI_API_KEY;
if (!KEY && !dryRun) { console.error("OPENAI_API_KEY not set"); process.exit(1); }

// Load storybook.js (a browser script that attaches to window.CULHWCH)
const src = await fs.readFile(STORY_FILE, "utf8");
const win = { CULHWCH: {} };
new Function("window", src)(win);
const spreads = win.CULHWCH.book.spreads;
if (!Array.isArray(spreads) || !spreads.length) { console.error("No spreads found in storybook.js"); process.exit(1); }

await fs.mkdir(IMG_DIR, { recursive: true });
const existing = new Set(await fs.readdir(IMG_DIR).catch(() => []));
const filenameFor = (i) => `spread-${String(i).padStart(2, "0")}.png`;
const have = (i) => existing.has(filenameFor(i));

let targets;
if (spreadsArg === "all") targets = spreads.map((_, i) => i);
else if (spreadsArg === "missing") targets = spreads.map((_, i) => i).filter((i) => !have(i));
else targets = spreadsArg.split(",").map((s) => +s.trim()).filter((n) => Number.isInteger(n) && n >= 0 && n < spreads.length);

console.log(`Spreads: ${spreads.length} total, ${spreads.length - targets.length} already on disk, ${targets.length} to generate.`);
if (targets.length === 0) { console.log("Nothing to do."); process.exit(0); }
console.log(`Generating: [${targets.join(", ")}] | model=${model} quality=${quality}${dryRun ? " (dry-run)" : ""}`);

// ── House style + character pins ──────────────────────────────────────────
const HOUSE = [
  "A storybook illustration for an 8–12 readers' faithful retelling of the medieval Welsh tale Culhwch ac Olwen.",
  "Style: warm gouache-and-watercolour painting, soft painterly textures, gentle earthy palette — deep mossy greens, ochres, warm reds, with quiet gold accents; Celtic-medieval atmosphere; cinematic but child-friendly.",
  "Single illustrative scene, full bleed, no panel borders, no text, no captions, no lettering, no logos, no watermarks; no modern dress or anachronisms.",
].join(" ");

const PINS = {
  culhwch:    "Culhwch: a young man in his late teens, fair-skinned with shoulder-length copper-red hair, wearing a dark green tunic with a bronze brooch and a russet wool cloak. When riding, he is on a dappled-grey horse with a golden bridle.",
  olwen:      "Olwen: a young woman with pale skin and very long pale-gold hair, in a flame-red silk dress with a gold torque at her throat; four small white clover-flowers spring up in her footprints wherever she walks.",
  arthur:     "Arthur: a bearded warrior-king in his thirties in a dark indigo-blue cloak with a simple gold circlet on dark hair.",
  ysbaddaden: "Ysbaddaden, Chief of Giants: an enormous shaggy giant with a long grey beard and grotesquely heavy drooping eyebrows propped up by wooden forks held by tiny servants; comic-grotesque, not horrifying.",
  cei:        "Cei: a tall, broad warrior with russet hair and a green wool mantle.",
  bedwyr:     "Bedwyr: a swift, one-handed warrior with dark hair.",
  gwrhyr:     "Gwrhyr: a slim hooded man, hand outstretched toward birds or beasts as if listening.",
  menw:       "Menw the enchanter: a wiry cloaked man with faint silver light wreathing his silhouette.",
  twrch:      "Twrch Trwyth: a colossal black-bristled boar with a small golden comb and silver shears glinting between its ears.",
  oldest:     "The oldest animals: a great wise blackbird, a mighty antlered stag, a vast horned owl, an enormous eagle, and an immense salmon — each with the calm of great age.",
  goreu:      "Goreu: a brave dark-haired boy who has been hidden in a stone chest by the hearth.",
  giantfort:  "The giant's fortress: a vast distant stone keep on a wide green plain, walls and gates outsized.",
};
const PIN_TRIGGERS = [
  [/culhwch|young man|hero\b|riding/i, "culhwch"],
  [/olwen|maiden|clover/i, "olwen"],
  [/arthur|kingly/i, "arthur"],
  [/ysbaddaden|chief of giants|giant's hall|eyebrow/i, "ysbaddaden"],
  [/\bcei\b/i, "cei"],
  [/bedwyr/i, "bedwyr"],
  [/gwrhyr|interpret|listening to (a )?bird/i, "gwrhyr"],
  [/menw|enchant/i, "menw"],
  [/twrch|boar/i, "twrch"],
  [/oldest animals|blackbird|stag|owl|eagle|salmon/i, "oldest"],
  [/goreu|stone chest/i, "goreu"],
  [/fortress|castle|keep/i, "giantfort"],
];

function buildPrompt(spread) {
  const brief = spread.illus || `A scene from "${spread.title}"`;
  const pickedKeys = new Set();
  PIN_TRIGGERS.forEach(([rx, k]) => { if (rx.test(brief)) pickedKeys.add(k); });
  const pinsBlock = [...pickedKeys].map((k) => PINS[k]).join(" ");
  return [HOUSE, pinsBlock, "Scene: " + brief].filter(Boolean).join("\n\n");
}

// ── API ───────────────────────────────────────────────────────────────────
async function generate(prompt) {
  // First try chosen model. If gpt-image-1 hits an org-verification 403,
  // fall back to dall-e-3 once.
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

// ── Run ───────────────────────────────────────────────────────────────────
let made = 0, failed = 0;
for (const i of targets) {
  const s = spreads[i];
  const filename = filenameFor(i);
  const filepath = path.join(IMG_DIR, filename);
  const prompt = buildPrompt(s);
  console.log(`\n[${i}] ${s.title}`);
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
console.log(`\nDone. Generated ${made}, failed ${failed}.`);
process.exit(failed > 0 ? 1 : 0);
