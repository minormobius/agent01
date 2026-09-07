#!/usr/bin/env node
// lab-card-image.mjs — the build agent asked for a picture instead of a card.
//
//   node scripts/lab-card-image.mjs <dir> <out.jpg> <out-alt.txt>
//
// THE AGENT'S SECOND WINDOW OUT. It already has NOTE.txt, which rides along on
// the "it's live" reply as text. This is the same channel for the picture: the
// agent writes <dir>/CARD.json —
//
//     { "embed": "image", "prompt": "…", "alt": "…" }
//
// — and if it is there and well-formed, the reply carries a generated image
// rather than a screenshot link card.
//
// WHAT THAT COSTS, because it is not free and the agent should mean it. A post
// has exactly ONE embed. app.bsky.embed.images and app.bsky.embed.external are
// alternatives, so the picture REPLACES the card: no title, no description, no
// thumbnail, and the URL demoted to unlinked characters in the post text. For a
// site whose whole point is the thing you see when you open it, the screenshot
// card is usually the better post. For a site that is a joke, a poster, a
// one-liner, or a refusal, the picture is the post and the card is a footnote
// about a page nobody needs to open. That judgement is the agent's; the trade
// is the same either way and it is written into the brief.
//
// FAIL-SOFT AT EVERY STEP. No CARD.json, bad JSON, refused prompt, dead model,
// oversized blob: all of them exit 0 with nothing written, and the reply falls
// back to the screenshot card it would have had anyway. A missing picture costs
// a nicer post; a failed step costs the requester their only message.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { generateImage, DEFAULT_MODEL } from './lib/imagegen.mjs';

const [dir, outImage, outAlt] = process.argv.slice(2);
if (!dir || !outImage || !outAlt) {
  console.error('usage: lab-card-image.mjs <dir> <out.jpg> <out-alt.txt>');
  process.exit(2);
}

const path = join(dir, 'CARD.json');
if (!existsSync(path)) process.exit(0);

let card;
try {
  card = JSON.parse(readFileSync(path, 'utf8'));
} catch (e) {
  console.log(`::warning::CARD.json is not valid JSON (${e.message}) — posting the screenshot card instead`);
  process.exit(0);
}

if (card?.embed !== 'image') {
  console.log(`CARD.json does not ask for an image (embed: ${JSON.stringify(card?.embed)}) — screenshot card it is`);
  process.exit(0);
}

// ALT TEXT IS THE PRICE OF THE PICTURE, not a field to leave blank. The agent
// is told this in the brief; refusing here is what makes it true.
const alt = typeof card.alt === 'string' ? card.alt.trim() : '';
if (!alt) {
  console.log('::warning::CARD.json asks for an image but carries no alt text — refused, posting the card');
  process.exit(0);
}
if (typeof card.prompt !== 'string' || card.prompt.trim().length < 8) {
  console.log('::warning::CARD.json has no usable prompt — posting the card');
  process.exit(0);
}

const img = await generateImage(card.prompt, {
  model: process.env.LAB_IMAGE_MODEL || DEFAULT_MODEL,
});
if (!img.bytes) {
  console.log(`::warning::no image (${img.why}) — posting the screenshot card instead`);
  process.exit(0);
}
if (img.bytes.length > 950_000) {
  console.log(`::warning::generated image is ${img.bytes.length} bytes, over the Bluesky blob limit — posting the card`);
  process.exit(0);
}

writeFileSync(outImage, img.bytes);
// Say it is generated even if the agent forgot. The alt text is where a screen
// reader user finds out what they are being shown, and "this is synthetic" is
// part of what they are being shown.
const disclosed = /\b(ai|generated|synthetic)\b/i.test(alt) ? alt : `${alt.replace(/\s*$/, '')} (AI-generated image.)`;
writeFileSync(outAlt, disclosed.slice(0, 2000));

console.log(`✓ card image ${img.bytes.length} bytes — ${img.model}, ${img.neurons} neurons ($${img.usd.toFixed(5)})`);
console.log(`  prompt: ${img.prompt.slice(0, 160)}`);
