#!/usr/bin/env node
// Fetches the published versions of the open lexicons used by /lexicon/ and
// writes them as JSON to rite/lexicon/data/. The page prefers these files
// over the inline mini-lexicons whenever they exist, so this is a one-shot
// upgrade — run via the fetch-lexicons.yml workflow on push.
//
// Each lexicon has its own parser since the upstream formats differ:
//   - AFINN: tab-separated word\tscore
//   - NRC Emotion: tab-separated word\temotion\t1|0  (one row per pair)
//   - Brysbaert Concreteness: CSV with Word + Conc.M columns
//   - SUBTLEX-US: CSV with Word + SUBTLWF columns (per million)
//
// If an upstream URL stops working the script logs and continues so that any
// successfully-fetched lexicon still gets written.
//
// Usage:
//   node scripts/fetch-lexicons.mjs            # fetch all
//   node scripts/fetch-lexicons.mjs --only=afinn,nrc

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(REPO_ROOT, 'rite', 'lexicon', 'data');

const args = new Map(
  process.argv.slice(2).map((a) => {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      return [k, v ?? true];
    }
    return [a, true];
  })
);
const only = args.get('only') ? args.get('only').split(',').map(s => s.trim()) : null;
const wants = (name) => !only || only.includes(name);

await fs.mkdir(OUT_DIR, { recursive: true });

// --- AFINN-en-165 -----------------------------------------------------------
// fnielsen/afinn is well-maintained on GitHub, MIT-licensed.
async function fetchAfinn() {
  const url = 'https://raw.githubusercontent.com/fnielsen/afinn/master/afinn/data/AFINN-en-165.txt';
  console.log('AFINN  ↓', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`AFINN fetch failed: ${res.status}`);
  const text = await res.text();
  const map = {};
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const [word, scoreStr] = line.split('\t');
    if (!word || !scoreStr) continue;
    const score = parseInt(scoreStr.trim(), 10);
    if (Number.isFinite(score)) map[word.toLowerCase()] = score;
  }
  return map;
}

// --- NRC Emotion Lexicon ----------------------------------------------------
// Mohammad & Turney 2013, CC-BY-NC-SA-4.0. The canonical file lives at
// saifmohammad.com behind a request form; we use a stable mirror.
// Wordlevel-v0.92 is the standard form: word\temotion\t1|0.
async function fetchNrc() {
  const candidates = [
    // Common community mirrors. We try in order; first success wins.
    'https://raw.githubusercontent.com/dinbav/LeXmo/master/NRC-Emotion-Lexicon-Wordlevel-v0.92.txt',
    'https://raw.githubusercontent.com/jcharis/Streamlit-Apps-Series/master/EmotionDetectionApp/NRC-Emotion-Lexicon-Wordlevel-v0.92.txt',
  ];
  let text = null;
  for (const url of candidates) {
    try {
      console.log('NRC    ↓', url);
      const res = await fetch(url);
      if (!res.ok) { console.warn('  →', res.status); continue; }
      text = await res.text();
      break;
    } catch (e) { console.warn('  →', e.message); }
  }
  if (!text) throw new Error('NRC: all mirrors failed');

  const map = {};
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue;
    const parts = line.split('\t');
    if (parts.length < 3) continue;
    const [word, emotion, flag] = parts;
    if (flag.trim() !== '1') continue;
    const w = word.toLowerCase();
    if (!map[w]) map[w] = [];
    map[w].push(emotion.trim());
  }
  return map;
}

// --- Brysbaert Concreteness -------------------------------------------------
// Brysbaert, Warriner & Kuperman 2014. Free for research.
// We use a stable CSV mirror; the original is an .xlsx that needs xlsx parsing.
async function fetchConcreteness() {
  const candidates = [
    // ArtsEngine has hosted the Brysbaert ratings as plain CSV for years.
    'https://raw.githubusercontent.com/ArtsEngine/concreteness/master/Concreteness_ratings_Brysbaert_et_al_BRM.csv',
    // Re-mirror under different name in same repo.
    'https://raw.githubusercontent.com/ArtsEngine/concreteness/master/concreteness.csv',
    // Other community copies.
    'https://raw.githubusercontent.com/seantyh/concreteness-norms/master/Concreteness_ratings_Brysbaert_et_al_BRM.csv',
  ];
  let text = null;
  for (const url of candidates) {
    try {
      console.log('CONC   ↓', url);
      const res = await fetch(url);
      if (!res.ok) { console.warn('  →', res.status); continue; }
      text = await res.text();
      break;
    } catch (e) { console.warn('  →', e.message); }
  }
  if (!text) throw new Error('Concreteness: all mirrors failed');

  // Detect column indices for Word and Conc.M (mean concreteness).
  const lines = text.split(/\r?\n/);
  const sep = lines[0].includes('\t') ? '\t' : ',';
  const header = lines[0].split(sep).map(h => h.replace(/^"|"$/g, '').trim());
  const wordIdx = header.findIndex(h => /^word$/i.test(h));
  const concIdx = header.findIndex(h => /conc\.?m/i.test(h) || /^concreteness$/i.test(h) || /^mean$/i.test(h));
  if (wordIdx < 0 || concIdx < 0) {
    throw new Error(`Concreteness: missing Word / Conc.M columns in header: ${header.join(' | ')}`);
  }
  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i], sep);
    if (cols.length <= Math.max(wordIdx, concIdx)) continue;
    const word = cols[wordIdx].replace(/^"|"$/g, '').trim().toLowerCase();
    const v = parseFloat(cols[concIdx]);
    if (!word || !Number.isFinite(v)) continue;
    map[word] = Math.round(v * 100) / 100;
  }
  return map;
}

// --- Word-frequency baseline (hermitdave/FrequencyWords) ------------------
// Used to be the SUBTLEX-US CSV but my GitHub mirrors were stale (404'd in
// CI silently). hermitdave/FrequencyWords ships OpenSubtitles-2018 word
// counts for ~80 languages; en_50k.txt has the top 50k English words.
// Same kind of source SUBTLEX is built from (subtitle corpora), and the
// URL is rock-solid. Format: `word count` per line, raw counts.
// We normalize to per-million so the page's score formula stays consistent.
async function fetchSubtlex() {
  const url = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';
  console.log('FREQ   ↓', url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const text = await res.text();

  const raw = [];
  let total = 0;
  for (const line of text.split('\n')) {
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    const word = parts[0].toLowerCase();
    const n = parseInt(parts[1], 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    if (!/^[a-z']{2,}$/.test(word)) continue;     // ascii letters/apostrophe only
    raw.push([word, n]);
    total += n;
  }
  if (!total) throw new Error('parsed empty corpus');

  const scale = 1e6 / total;
  const map = {};
  for (const [word, n] of raw) {
    const pm = n * scale;
    if (pm < 0.3) continue;                       // drop ultra-rare to keep file lean
    map[word] = Math.round(pm * 10) / 10;
  }
  return map;
}

// Tiny CSV row parser (handles double-quoted fields with embedded commas).
function parseCsvLine(line, sep) {
  const out = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuote) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuote = false;
      else cur += c;
    } else {
      if (c === '"') inQuote = true;
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

async function writeJson(name, data) {
  const out = path.join(OUT_DIR, `${name}.json`);
  // Compact-ish JSON: keys are short (words, scores) so this stays small.
  await fs.writeFile(out, JSON.stringify(data));
  const size = (JSON.stringify(data).length / 1024).toFixed(1);
  console.log(`  ✓ ${name}.json — ${Object.keys(data).length} entries, ${size} KB`);
}

const tasks = [];
if (wants('afinn'))         tasks.push(['afinn',         fetchAfinn]);
if (wants('nrc'))           tasks.push(['nrc',           fetchNrc]);
if (wants('concreteness'))  tasks.push(['concreteness',  fetchConcreteness]);
if (wants('baseline'))      tasks.push(['baseline',      fetchSubtlex]);

const results = { ok: [], failed: [] };
for (const [name, fn] of tasks) {
  try {
    const data = await fn();
    await writeJson(name, data);
    results.ok.push(name);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
    results.failed.push({ name, error: e.message });
  }
}

console.log('\n──────');
console.log(`OK:     ${results.ok.join(', ') || '(none)'}`);
console.log(`Failed: ${results.failed.map(f => f.name).join(', ') || '(none)'}`);
// Exit 0 even if some lexicons failed — partial success is useful (the page
// gracefully falls back to inline mini-lexicons for any missing files), and
// the workflow's commit step should still commit whatever JSON did get written.
process.exit(0);
