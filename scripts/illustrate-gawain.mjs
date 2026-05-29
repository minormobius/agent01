#!/usr/bin/env node
/* scripts/illustrate-gawain.mjs
 *
 * Generates storybook illustrations for read.mino.mobi/gawain via the OpenAI
 * Images API (gpt-image-1, with a dall-e-3 fallback if the org isn't verified).
 *
 * Sentinel: the PNG files themselves. By default this generates only spreads
 * whose image is missing, so it's safe to re-run on every push — once every
 * spread exists, subsequent invocations are no-ops. Delete a spread's PNG
 * (or pass --spreads all|0,5,12) to force regeneration.
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
const STORY_FILE = path.join(ROOT, "read/gawain/storybook.js");
const IMG_DIR = path.join(ROOT, "read/gawain/img");

const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const spreadsArg = getArg("--spreads", "missing");
const quality = getArg("--quality", "medium");
let model = getArg("--model", "gpt-image-1");
const dryRun = args.includes("--dry");

const KEY = process.env.OPENAI_API_KEY;
if (!KEY && !dryRun) { console.error("OPENAI_API_KEY not set"); process.exit(1); }

// Load storybook.js (a browser script that attaches to window.GAWAIN)
const src = await fs.readFile(STORY_FILE, "utf8");
const win = { GAWAIN: {} };
new Function("window", src)(win);
const spreads = win.GAWAIN.book.spreads;
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
  "A storybook illustration for an 8–12 readers' faithful retelling of the 14th-century Middle English alliterative romance Sir Gawain and the Green Knight (the Pearl-Poet, Cotton Nero A.x).",
  "Style: warm gouache-and-watercolour painting in the tradition of Howard Pyle and Edmund Dulac, soft painterly textures, a cool northern winter palette — deep mossy greens, vermilion reds, oxidised gold-leaf, indigo and pewter — with quiet gold accents; Pearl-Poet manuscript atmosphere; cinematic but child-friendly.",
  "Single illustrative scene, full bleed, no panel borders, no text, no captions, no lettering, no logos, no watermarks; medieval English North-West Midlands setting around 1380, no modern dress or anachronisms.",
].join(" ");

const PINS = {
  gawain:       "Sir Gawain: a fair-skinned young knight in his early twenties with golden shoulder-length hair, wearing a scarlet surcoat over mail with a gold five-pointed star — a pentangle, every line drawn continuous, the endless knot — clearly painted on the chest; gold spurs; sky-blue cloak when riding.",
  greenknight:  "The Green Knight: an enormous, vivid green-skinned knight with green hair and a long green beard, green clothes, on a green warhorse; in one hand a small sprig of bright red-berried holly, in the other a colossal gold-bound axe whose handle is as tall as a man; magical, awe-inspiring, not menacing.",
  bertilak:     "Bertilak the lord of the castle (same large frame as the Green Knight but without any green): a broad, jovial, broad-shouldered nobleman with a thick red-brown beard, in russet hunting furs over fine wool, warm and laughing.",
  lady:         "Lady Bertilak: a strikingly beautiful young woman with pale-gold hair coiled and netted in gold, in a flame-red brocade gown with white ermine trim and a gold girdle.",
  morgan:       "Morgan le Fay disguised as the ancient lady: a small wrinkled old woman in dark indigo robes, her face almost wholly hidden by a white wimple and a heavy black veil drawn up to her chin, walking very quietly just behind the young lady — present but barely noticed.",
  arthur:       "King Arthur: a young, beardless king in his mid-twenties with dark hair and a slim gold circlet, in a deep red mantle over mail, restless and bright-eyed.",
  guinevere:    "Queen Guinevere: a fair young queen with grey eyes in a green-and-gold brocade gown, set beside the king.",
  gringolet:    "Gringolet: a powerful chestnut warhorse with a long mane and a richly gold-decorated harness — saddle, breastband and bridle worked with gold trim.",
  pentangle:    "The pentangle: a five-pointed star painted in shining gold leaf on Gawain's red shield, every line drawn unbroken and interlaced — the endeles knot — and inside the shield, on the side toward the bearer, a tiny painted figure of the Virgin Mary.",
  camelot:      "Camelot: a great firelit medieval hall on a snowy winter evening, jewel-coloured tapestries, deep arched stone windows, Christmas greenery on the walls, long high tables and a high seat under a fur-trimmed canopy.",
  hautdesert:   "Hautdesert castle: a warm timber-and-stone winter castle gleaming with lamplight, set in a snow-dusted wood of bare oaks; smoke from chimneys; high battlements; secluded.",
  chapel:       "The Green Chapel: a grass-and-moss-covered ancient burial mound in a snowy valley, with three small openings (one at each end, one on top), beside a clear brook that runs steaming over small stones; bare winter trees, uncanny and quiet.",
  axe:          "The Green Knight's axe: a colossal Danish-style long-axe, gold-bound at the head, the handle bound with bright cloth, freshly sharpened to a mirror edge — four feet of blade plus a man-tall handle.",
  girdle:       "The green girdle: a long bright-green silk sash, narrow as a hand's-breadth, with embroidered ends and gold-thread hems — the lady's lace that becomes Gawain's fault and finally the court's livery.",
  guide:        "Bertilak's guide: a cloaked man on a sturdy horse, hood drawn deep, face barely visible.",
  agravain:     "Agravain à la dure main: a black-haired young knight at the Christmas table, brother to Gawain.",
  yvain:        "Yvain son of Urien: a young knight in russet at the Christmas table.",
  baldwin:      "Bishop Baldwin: a white-haired elderly bishop in red-and-gold vestments, opposite Gawain at the Christmas table.",
};
const PIN_TRIGGERS = [
  [/sir gawain|gawain|young knight|hero|pentangle/i, "gawain"],
  [/green knight|green man|the giant\b|green hair|green skin|green beard|\ball (vivid )?green\b|green warhorse|green horse|enormous knight|holly bough|sprig of (red[- ]berried )?holly|huge axe|colossal axe/i, "greenknight"],
  [/bertilak|lord of the castle|laughing lord|broad[- ]bearded|the lord\b|red[- ]brown bear(d|ded)/i, "bertilak"],
  [/the lady|lady bertilak|lady of the castle|young lady|beautiful (young )?(woman|lady)/i, "lady"],
  [/morgan|ancient lady|veiled|wimpled|withered/i, "morgan"],
  [/\barthur\b|king arthur|the king/i, "arthur"],
  [/guinevere|the queen/i, "guinevere"],
  [/gringolet|chestnut (horse|warhorse)|gold[- ]decorated harness/i, "gringolet"],
  [/pentangle|endless knot|five-pointed|gold star/i, "pentangle"],
  [/camelot|great hall|high table|christmas feast|christmas hall|firelit (great )?hall/i, "camelot"],
  [/hautdesert|castle in the wood|winter castle|warm[- ]lit (towers|castle)|castle (gleaming|gates)/i, "hautdesert"],
  [/green chapel|barrow|burial mound|hollow mound|steaming brook|grassy mound|grass[- ]covered .* mound/i, "chapel"],
  [/\baxe\b|axe[- ]handle|whetstone|danish[- ]style/i, "axe"],
  [/girdle|green sash|green silk|silk lace|silk (sash)?\s*trimmed with gold/i, "girdle"],
  [/cloaked (rider|guide)|hooded (man|rider)|silent (rider|guide)|guide on horseback/i, "guide"],
  [/agravain/i, "agravain"],
  [/yvain|ywain/i, "yvain"],
  [/baldwin|bishop/i, "baldwin"],
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
