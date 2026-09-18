#!/usr/bin/env node
// hoop/scripts/extract-content-rev.mjs — HOOPY'S REVIEW HARNESS → a world_export.
//
// Hoopy publishes a content revision as a self-contained review page (e.g.
// https://hoopy.wisp.place/mobius_sample.html): a story bible, then one card per pool item. Each
// card carries the authoring payload in a <pre> JSON block, and the record's ENVELOPE — tiers,
// status, tags, refs, produces — only in the rendered markup beside it. So neither half alone is
// the record: this script re-joins them into the `world_export` shape `story/import.js` consumes.
//
// It is deliberately tolerant about what it does NOT find. Hoopy's harness is a moving target and
// the point of this script is to get a rev in front of the real pipeline early, not to be a
// schema authority — anything it can't parse is reported, never guessed.
//
//   node hoop/scripts/extract-content-rev.mjs <file.html|url> [--out <path>] [--quiet]
//
// Records are emitted WITHOUT an `id`, exactly as hoopy's raw records arrive. That is not an
// omission — id derivation and de-collision are import.js's job (the Kaelen Voss soft-lock), and
// a fixture that pre-assigns ids would test a path the live content never takes.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const dec = (s) => String(s)
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;|&rsquo;/g, "'").replace(/&mdash;/g, '—')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

const strip = (s) => dec(String(s).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// ── the card envelope ────────────────────────────────────────────────────────────────────────
// "r1 · n1 · p1" → the three axes. Hoopy's prefixes are r=revelation, n=narrative, p=power; the
// AXIS_MAP in import.js owns the remap, so we emit his prefixes verbatim as our own field names
// only where they are unambiguous, and let the importer decide.
function parseTiers(html) {
  const m = /<span class="tiers">([^<]*)<\/span>/.exec(html);
  const out = {};
  if (!m) return out;
  for (const tok of dec(m[1]).split(/[·,\s]+/)) {
    const t = /^([rnp])(\d+)$/i.exec(tok.trim());
    if (!t) continue;
    const n = +t[2];
    if (t[1].toLowerCase() === 'r') out.revelation_tier = n;
    if (t[1].toLowerCase() === 'n') out.narrative_tier = n;
    if (t[1].toLowerCase() === 'p') out.power_tier = n;
  }
  return out;
}

// "sets flag.theme.continuity" / "+rep continuant" / "gives <item>" → gates.js's producer shape.
function parseProduces(html) {
  const block = /<div class="produces">([\s\S]*?)<\/div>\s*(?=<\/div>|<div class="rb-col)/.exec(html);
  if (!block) return null;
  const sets = [], rep = {}, gives = [];
  for (const m of block[1].matchAll(/<span class="ptok">([^<]*)<\/span>/g)) {
    const tok = strip(m[1]);
    let x;
    if ((x = /^sets\s+(.+)$/i.exec(tok))) sets.push(x[1].trim());
    else if ((x = /^\+?rep\s+(\S+)(?:\s*([+-]?\d+))?$/i.exec(tok))) rep[x[1].toLowerCase()] = x[2] ? +x[2] : 1;
    else if ((x = /^gives\s+(.+)$/i.exec(tok))) gives.push(x[1].trim());
    else sets.push(tok);                       // unknown producer form — carry it, don't drop it
  }
  const out = {};
  if (sets.length) out.sets = sets;
  if (Object.keys(rep).length) out.rep = rep;
  if (gives.length) out.gives = gives;
  return Object.keys(out).length ? out : null;
}

function parseList(html, label) {
  const re = new RegExp(`<strong>${label}:</strong>([^<]*)`, 'i');
  const m = re.exec(html);
  if (!m) return [];
  const v = strip(m[1]);
  if (!v || v === '—' || v === '-') return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

export function extractContentRev(html) {
  const warnings = [];

  // Bible: the <details> sections above the pool, flattened to markdown-ish text.
  let bible = '';
  const bibleWrap = /<div class="bible-sections">([\s\S]*?)<\/div>\s*<\/section>/.exec(html)
    || /<div class="bible-sections">([\s\S]*?)(?=<section)/.exec(html);
  if (bibleWrap) {
    for (const sec of bibleWrap[1].matchAll(/<summary[^>]*>([\s\S]*?)<\/summary>([\s\S]*?)(?=<details|<\/details>\s*(?:<details|$))/g)) {
      const title = strip(sec[1]);
      const body = dec(sec[2].replace(/<\/(p|div|li|h[1-6])>/g, '\n').replace(/<li>/g, '- ').replace(/<[^>]+>/g, ''))
        .split('\n').map((s) => s.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
      if (title) bible += `## ${title}\n\n${body}\n\n`;
    }
  }
  if (!bible) warnings.push('no story bible found (the <details> bible sections did not parse)');

  // Cards, in document order, joined to the JSON blocks in the same order.
  const cards = [...html.matchAll(/<div class="card ([^"]*)"([^>]*)>([\s\S]*?)(?=<div class="card |<\/main>|$)/g)];
  const jsonBlocks = [...html.matchAll(/<pre class="json-pre">([\s\S]*?)<\/pre>/g)].map((m) => {
    try { return JSON.parse(dec(m[1]).trim()); } catch { return null; }
  });

  const items = [];
  let ji = 0;
  for (const c of cards) {
    const [, cls, attrs, body] = c;
    const typeM = /data-type="([^"]*)"/.exec(attrs);
    const type = typeM ? dec(typeM[1]) : null;
    if (!type) { warnings.push('a card carried no data-type; skipped'); continue; }

    const payload = jsonBlocks[ji++] ?? null;
    if (payload == null) {
      warnings.push(`${type} card #${ji}: its JSON block is missing or did not parse; skipped`);
      continue;
    }

    const statusM = /<span class="badge-(pending|approved|retired)">/.exec(body);
    const tagsM = /data-tags="([^"]*)"/.exec(attrs);

    const rec = {
      type,
      ...parseTiers(body),
      status: statusM ? statusM[1] : 'approved',
      tags: tagsM ? dec(tagsM[1]).split(',').map((s) => s.trim()).filter(Boolean) : [],
      content: payload,
    };
    const refs = parseList(body, 'refs'); if (refs.length) rec.refs = refs;
    const produces = parseProduces(body); if (produces) rec.produces = produces;
    if (rec.narrative_tier == null) warnings.push(`${type} "${strip(payload.name || '')}": no tiers on the card`);
    items.push(rec);
  }
  if (jsonBlocks.length !== items.length) {
    warnings.push(`${jsonBlocks.length} JSON blocks vs ${items.length} cards paired — check the pairing`);
  }
  return { story_bible: bible.trim(), content_pool: { items }, warnings };
}

// ── CLI ──────────────────────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  const args = process.argv.slice(2);
  const src = args.find((a) => !a.startsWith('--'));
  const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
  const quiet = args.includes('--quiet');
  if (!src) {
    console.error('usage: node hoop/scripts/extract-content-rev.mjs <file.html|url> [--out <path>] [--quiet]');
    process.exit(2);
  }

  const html = /^https?:\/\//.test(src)
    ? await (await fetch(src)).text()
    : readFileSync(src, 'utf8');

  const { warnings, ...doc } = extractContentRev(html);
  const items = doc.content_pool.items;

  if (!quiet) {
    const byType = {};
    for (const i of items) byType[i.type] = (byType[i.type] || 0) + 1;
    console.log(`extracted ${items.length} records from ${src}`);
    console.log(`  types      ${Object.entries(byType).map(([k, v]) => `${k}=${v}`).join(' ') || '(none)'}`);
    console.log(`  bible      ${doc.story_bible.length} chars`);
    const zones = {};
    for (const i of items) { const z = i.content && i.content.zone; if (z) zones[z] = (zones[z] || 0) + 1; }
    if (Object.keys(zones).length) console.log(`  zones      ${Object.entries(zones).map(([k, v]) => `${k}=${v}`).join(' ')}`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(doc, null, 2) + '\n');
    if (!quiet) console.log(`  → ${out}`);
  } else if (quiet) {
    process.stdout.write(JSON.stringify(doc, null, 2) + '\n');
  }
}
