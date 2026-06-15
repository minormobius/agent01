#!/usr/bin/env node
/* mint-forge-codex — OFFLINE: run forge's foundry (the novelty search, ~30s) once and bake the
   discovered laws + the hand-written knowns into hoop/minigame/forge/codex.json. The in-world
   minigame loads this and runs atlas.puzzleFor() per chamber (fast); it never runs the foundry.
   Re-mint: node scripts/mint-forge-codex.mjs [count]                                        */
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { KNOWN_LAWS, describe, lawKey } from '../fable/forge/js/dsl.js';
import { buildCodex } from '../fable/forge/js/foundry.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const count = +(process.argv[2] || 10);

const known = KNOWN_LAWS.map((k) => ({ name: k.name, law: k.law, text: describe(k.law), minted: false }));
console.log(`minting ${count} novel laws (foundry novelty search)…`);
const { codex, stats } = buildCodex(count);
const minted = codex.map((e) => ({ name: e.name, law: e.law, text: e.text || describe(e.law), minted: true }));

const all = [...known, ...minted];
const seen = new Set(), laws = [];
for (const l of all) { const k = lawKey(l.law); if (seen.has(k)) continue; seen.add(k); laws.push(l); }

const out = { _note: 'forge codex — game forms for hoop in-world minigames. knowns are hand-written; minted are foundry-discovered (laws no one wrote). Baked offline by scripts/mint-forge-codex.mjs; the in-world layer runs atlas.puzzleFor() on these. Re-mint to refresh.', stats, count: laws.length, laws };
writeFileSync(join(ROOT, 'hoop/minigame/forge/codex.json'), JSON.stringify(out, null, 0) + '\n');
console.log(`✓ ${laws.length} laws (${known.length} known + ${minted.length} minted) → hoop/minigame/forge/codex.json`);
console.log('  ' + laws.map((l) => l.name).join(' · '));
