#!/usr/bin/env node
/* scripts/illustrate-orfeo.mjs
 *
 * Generates storybook illustrations for read.mino.mobi/orfeo via the OpenAI
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
const STORY_FILE = path.join(ROOT, "read/orfeo/storybook.js");
const IMG_DIR = path.join(ROOT, "read/orfeo/img");

const args = process.argv.slice(2);
const getArg = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const spreadsArg = getArg("--spreads", "missing");
const quality = getArg("--quality", "medium");
let model = getArg("--model", "gpt-image-1");
const dryRun = args.includes("--dry");

const KEY = process.env.OPENAI_API_KEY;
if (!KEY && !dryRun) { console.error("OPENAI_API_KEY not set"); process.exit(1); }

// Load storybook.js (a browser script that attaches to window.ORFEO)
const src = await fs.readFile(STORY_FILE, "utf8");
const win = { ORFEO: {} };
new Function("window", src)(win);
const spreads = win.ORFEO.book.spreads;
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
  "A storybook illustration for an 8–12 readers' faithful retelling of the c.1300 Middle English Breton lay Sir Orfeo (the classical Orpheus rebuilt as a king of Winchester whose queen is taken not into Hades but into the Land of Faerie).",
  "Style: warm gouache-and-watercolour painting in the tradition of Howard Pyle and Edmund Dulac, soft painterly textures; a cool northern English palette — deep mossy greens, vermilion reds, silver, indigo, oxidised gold — with quiet jewel-tone accents; medieval English atmosphere (c.1300 setting); cinematic but child-friendly.",
  "Single illustrative scene, full bleed, no panel borders, no text, no captions, no lettering, no logos, no watermarks; medieval English setting around 1300, no modern dress or anachronisms.",
].join(" ");

const PINS = {
  orfeo_king:    "Sir Orfeo as king: a young, fair-haired English king in his late twenties with shoulder-length golden-blond hair, in fine scarlet medieval royal robes trimmed with ermine, a slim gold circlet on his head, carrying a small carved gold-strung Celtic lap-harp; expressive, gentle, noble.",
  orfeo_pilgrim: "Sir Orfeo in pilgrim/exile form: the same man, now very thin and weathered, with a long unkempt black beard down to his waist, long matted black hair to his shoulders, in a tattered rough grey wool pilgrim's cloak (a sclavin), barefoot, the same small gold-strung Celtic harp hanging on his back by a leather cord; dignified, not pitiful.",
  orfeo_disguise: "Sir Orfeo in beggar's disguise: ragged figure in a rough brown beggar's hooded coat over the grey sclavin, long black beard and shaggy hair, the harp on his back, his face half-hidden by the hood; weary but watchful.",
  heurodis:      "Lady Heurodis (Eurydice): a beautiful young queen with very long pale-gold hair, fine-featured pale skin, wearing a flowing silver-and-gold silk medieval gown trimmed with white ermine, a thin gold circlet on her head; radiant, gentle, grave.",
  fairyking:     "The Fairy King: a tall, dark-haired, otherworldly king ageless and proud, wearing rich green-and-silver medieval robes; crowned not with metal but with a single huge radiant precious stone (a jewel-crown) that shines like the sun; severe but kingly, awe-inspiring, not evil.",
  fairyqueen:    "The Fairy Queen: a regal, otherworldly queen with very pale-gold hair, robed in white-silver silks; crowned, like her king, with a single radiant precious stone instead of metal; shining almost too bright to look at.",
  steward:       "The high steward of Winchester: an older man in his fifties with a kind, careworn face, full grey-brown beard, in fine russet wool robes trimmed with fox-fur, a silver chain of office across his shoulders; dignified, loyal.",
  beggar:        "The Winchester beggar: a kind, weathered old man with a long grey beard, in a worn brown wool cloak with a hood, his face calm and welcoming.",
  porter:        "The porter of the Otherworld castle: a tall cloaked figure standing at a crystal-and-gold gate, robed in deep green, face partly luminous and indistinct, otherworldly.",
  ympetree:      "The ympe-tree: a particular grafted/doubled fruit tree (two trunks twisted into one, like grafted apple or pear), heavy with white blossom in May; a folk-symbol of the fae-frequenting spot.",
  harp:          "Orfeo's harp: a small portable medieval Celtic-style lap harp of dark wood, gold-strung, beautifully carved at the neck and pillar, the size of a child.",
  fairyretinue:  "The Fairy King's retinue: a hundred fair knights and a hundred fair damsels riding snow-white horses, robes as white as milk, gold-thread embroidery, expressions calm and grave; a procession out of the Otherworld.",
  halftaken:     "The half-taken: the inside of the Otherworld castle yard, full of human figures perfectly still, frozen in the postures they were taken in — a fully armoured knight on a stilled horse with sword raised mid-stroke, a sleeping fair woman on grass under a small ympe-tree, a young mother peacefully holding a swaddled baby, an oarsman frozen in a small boat half-tilted on calm water, a man with one hand raised against an off-stage threat. Strictly handled with folktale tact — beautiful and uncanny, NEVER gory, no visible wounds or blood. Like statues in a tableau.",
  wildbeasts:    "The wild beasts and birds of England: a stag with great antlers, a great brown bear, foxes, hares, badgers, every kind of small English bird perched on briars; a peaceful audience to harping in a sunlit clearing.",
  hawkingladies: "Sixty fair-haired ladies in green and gold riding habits on snow-white horses, each with a falcon perched on her gauntleted left hand; gentle, graceful, no men among them; an Otherworld hunt.",
  crystalcastle: "The Otherworld crystal castle: an enormous fairy castle on a smooth green plain; walls of clear crystal as bright as glass; a hundred slender towers; buttresses of red gold arching out of the moat; cornices carved with every manner of beast; some of the stones in the walls glowing faintly with their own light; magical, awe-inspiring, slightly uncanny — not quite Paradise.",
  rockcleft:     "A great grey rock face in a wild English landscape, with a tall narrow vertical cleft in the rock just wide enough for a horse — the threshold between worlds.",
  winchester:    "Medieval Winchester: a small English walled medieval cathedral city with stone walls and slender towers and gatehouses, low timber-and-stone houses inside, the cathedral spire visible above the rooftops; about 1300 in style.",
  greathall:     "A great medieval English hall lit by warm firelight: high arched ceiling, tapestries, long oak tables, carved wooden throne or high seat on a dais, banners on the walls, Christmas-greenery or just rich firelight.",
};
const PIN_TRIGGERS = [
  [/\bking orfeo\b|young king orfeo|fair[- ]haired (young )?king|on a (carved wooden )?throne|gold circlet|crowned together on a throne|royal scarlet|king in scarlet/i, "orfeo_king"],
  [/sclavin|pilgrim'?s cloak|ragged|beard (down|hangs) to (his )?(waist|girdle|knee|belt)|long black beard|matted black hair|bearded.*grey|grey pilgrim'?s wool|tattered.*grey/i, "orfeo_pilgrim"],
  [/beggar'?s (brown |coarse |borrowed )?(coat|hood)|in the borrowed beggar'?s|brown beggar'?s hooded coat/i, "orfeo_disguise"],
  [/heurodis|the queen \(heurodis\)|silver[- ]and[- ]gold silk|queen in silver silk|pale[- ]gold hair circlet|silver gown/i, "heurodis"],
  [/fairy king\b|king o fairy|fairy king'?s|jewel[- ]crown|crown of one (huge )?radiant (gem|jewel|stone)/i, "fairyking"],
  [/fairy queen/i, "fairyqueen"],
  [/steward/i, "steward"],
  [/kind (old )?beggar|old beggar|the beggar (standing|talking|seated|in|at)|grey[- ]bearded beggar/i, "beggar"],
  [/porter(?! of the castle gate of fairy)/i, "porter"],
  [/ympe[- ]tree|grafted (\/doubled )?fruit tree|grafted apple|doubled trunk/i, "ympetree"],
  [/\bharp\b/i, "harp"],
  [/snow[- ]white (horses|riders|steeds)|hundred (fair )?(knights|damsels)|fairy retinue/i, "fairyretinue"],
  [/half[- ]taken|frozen in the (postures|moment)|armoured knight on a stilled horse|tableau/i, "halftaken"],
  [/wild beasts|wild creatures|\bstag\b|antlered|brown bear\b|foxes\b|\bhares\b|badgers|every kind of small (english )?bird/i, "wildbeasts"],
  [/sixty (fair[- ]haired )?ladies|hawking|falcon|gauntleted/i, "hawkingladies"],
  [/crystal castle|walls of (clear )?crystal|crystal[- ]and[- ]gold gate|fairy[- ]castle|otherworld castle|crystal gate|hundred (slender )?towers/i, "crystalcastle"],
  [/rock cleft|cleft in (a |the |great )?rock|three miles? through (the )?rock/i, "rockcleft"],
  [/winchester|medieval english city|city gate|cathedral city/i, "winchester"],
  [/great (firelit )?(medieval )?(english )?hall|firelit hall|long oak tables|carved wooden throne/i, "greathall"],
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
