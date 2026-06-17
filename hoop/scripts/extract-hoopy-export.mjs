#!/usr/bin/env node
/* extract-hoopy-export — reconstruct hoopy's world_export records from his published gallery
   (https://hoopy.wisp.place/world_export.html) into machine JSON, until he hands over the real
   world_export.json his pipeline emits. The gallery renders every record's fields, including the full
   dialogue tree (in a <pre class="json-pre">), so this is a faithful (if presentation-derived) capture.

   Each record is emitted in HIS schema (power_tier:"rN", narrative_tier:"nN", plot_tier:"pN",
   requires:[gate strings], produces:{sets}, refs, revelation_hint, dialogue) — story/import.js then
   normalizes that onto the engine's content_item. Swap the input for his real export; the importer is
   unchanged.

   Usage: node hoop/scripts/extract-hoopy-export.mjs <world_export.html> [out.json]
*/
import { readFileSync, writeFileSync } from 'fs';

const inPath = process.argv[2];
const outPath = process.argv[3] || 'hoop/v096/story/world_export.json';
if (!inPath) { console.error('usage: extract-hoopy-export.mjs <world_export.html> [out.json]'); process.exit(1); }

const html = readFileSync(inPath, 'utf8');
const un = (s) => String(s == null ? '' : s)
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
const all = (re, s) => { const out = []; let m; while ((m = re.exec(s))) out.push(un(m[1])); return out; };
const one = (re, s) => { const m = re.exec(s); return m ? un(m[1]) : ''; };

const cards = html.split(/<div class="card" /).slice(1);
const records = [];
for (const c of cards) {
  const type = one(/^data-type="([^"]+)"/, c);
  const tags = (one(/data-tags="([^"]*)"/, c) || '').split(',').map((t) => t.trim()).filter(Boolean);
  const tierTok = one(/<span class="tiers">([^<]+)<\/span>/, c).split('·').map((t) => t.trim());
  const tiers = {};                                  // assign by prefix letter so order can't bite us
  for (const t of tierTok) { if (/^r/.test(t)) tiers.power_tier = t; else if (/^n/.test(t)) tiers.narrative_tier = t; else if (/^p/.test(t)) tiers.plot_tier = t; }
  const status = one(/<span class="badge-approved">([^<]+)<\/span>/, c) || 'approved';
  const name = one(/<h3 class="card-name">([\s\S]*?)<\/h3>/, c);
  const description = one(/<p class="card-desc">([\s\S]*?)<\/p>/, c);
  const refs = (one(/<strong>\s*refs:\s*<\/strong>\s*([^<]+)/i, c) || '').split(',').map((r) => r.trim()).filter(Boolean);
  const requires = all(/<span class="gate-str">([^<]+)<\/span>/g, c);          // e.g. "flag.player_rebuilt=True"
  const produces = all(/<span class="ptok">([^<]+)<\/span>/g, c).map((p) => p.replace(/^sets\s+/, ''));
  // the <pre class="json-pre"> carries {name, description, revelation_hint, dialogue} — take dialogue + hint from it
  let revelation_hint = '', dialogue;
  const jm = /<pre class="json-pre">([\s\S]*?)<\/pre>/.exec(c);
  if (jm) { try { const j = JSON.parse(un(jm[1])); revelation_hint = j.revelation_hint || ''; if (j.dialogue) dialogue = j.dialogue; } catch (e) {} }

  const rec = { name, type, ...tiers, status, description, tags };
  if (refs.length) rec.refs = refs;
  if (requires.length) rec.requires = requires;
  if (produces.length) rec.produces = { sets: produces };
  if (revelation_hint) rec.revelation_hint = revelation_hint;
  if (dialogue) rec.dialogue = dialogue;
  records.push(rec);
}

const byType = {};
for (const r of records) byType[r.type] = (byType[r.type] || 0) + 1;
const out = { title: 'The Tabard: Chapter One', _source: 'extracted from hoopy.wisp.place/world_export.html', content_pool: { total_items: records.length, items: records } };
writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(`extracted ${records.length} records → ${outPath}`);
console.log('by type:', JSON.stringify(byType));
console.log('with dialogue:', records.filter((r) => r.dialogue).length, '| with requires:', records.filter((r) => r.requires).length, '| with produces:', records.filter((r) => r.produces).length);
