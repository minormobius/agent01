#!/usr/bin/env node
// publish-sites.mjs — put the miniphim's www/ at minomobi.com/miniphim/ (lib/www.mjs).
//
//   node publish-sites.mjs --run runs/<run> --www <checkout of claude/lab-www>/lab/www [--gate <lab-content-gate.mjs>]
//
// Builds lab/www/miniphim/ from the run's commons/www/ (all of it, so a page they deleted goes
// away too), writes an index if they wrote none, and runs the factory's content gate over it.
// Gate red: lab/www/miniphim/ is put back exactly as it was, and nothing is published. Either way
// it writes the outcome to the run's commons/www/LIVE.md (what the next session reads) and
// run/sites.json, and prints one JSON line: { changed, ok, sites, errors }.
//
// It never commits or pushes; the workflow does, so the selftest can run this end to end.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readTree, writeTree } from './lib/commons.mjs';
import { TENANT, BASE, LIVE, README, SLUG, EXT } from './lib/www.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// What of the commons goes on the web, and what doesn't (and why), without touching disk.
export function plan(commons) {
  const files = {}, skipped = [];
  for (const [k, v] of Object.entries(commons)) {
    if (!k.startsWith('www/') || k === LIVE || k === README) continue;
    const rel = k.slice(4);
    const top = rel.split('/')[0];
    if (rel.includes('/') && !SLUG.test(top)) { skipped.push(`${k}: "${top}" is not a site name (lowercase letters, digits, hyphens)`); continue; }
    if (!EXT.test(rel)) { skipped.push(`${k}: not a file type the corner serves`); continue; }
    if (rel.split('/').some((p) => p.startsWith('.') || p === '..')) { skipped.push(`${k}: hidden or relative path`); continue; }
    if (v.startsWith('[left out of the commons:')) { skipped.push(`${k}: too big for the commons`); continue; }
    files[rel] = v;
  }
  const sites = [...new Set(Object.keys(files).filter((r) => r.includes('/')).map((r) => r.split('/')[0]))]
    .filter((s) => `${s}/index.html` in files).sort();
  if (!('index.html' in files) && (sites.length || Object.keys(files).length)) {
    files['index.html'] = `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">\n` +
      `<title>miniphim</title><meta property="og:title" content="miniphim"><meta property="og:description" content="Things made by Modulo, Morphyx and Mozzie, three AI parts of one person.">\n<link rel="stylesheet" href="/_kit/tokens.css"></head>\n<body style="max-width:680px;margin:40px auto;padding:0 16px;font-family:var(--mono,monospace)">\n` +
      `<h1>miniphim</h1>\n<p>Made by Modulo, Morphyx and Mozzie, three AI parts of one person. Published without review.</p>\n` +
      `<ul>\n${sites.map((s) => `<li><a href="${esc(s)}/">${esc(s)}</a></li>`).join('\n')}\n</ul>\n</body></html>\n`;
  }
  return { files, sites, skipped };
}

function gate(dir, gateScript) {
  const r = spawnSync(process.execPath, [gateScript, dir], { encoding: 'utf8', env: { ...process.env, GITHUB_ACTIONS: '' } });
  const errors = `${r.stdout || ''}${r.stderr || ''}`.split('\n').filter((l) => /✘|error/i.test(l)).map((l) => l.replace(dir, `www`).trim()).slice(0, 30);
  return { ok: r.status === 0, errors: r.status === 0 ? [] : (errors.length ? errors : [`the gate exited ${r.status}`]) };
}

async function renderOg(dest, files) {
  const ogs = Object.keys(files).filter((f) => /(^|\/)og\.svg$/.test(f));
  if (!ogs.length) return [];
  let Resvg; try { ({ Resvg } = await import('@resvg/resvg-js')); } catch { return ogs.map((f) => `${f}: not rendered (no SVG renderer on this runner)`); }
  return ogs.map((f) => {
    const svg = files[f].includes('xmlns=') ? files[f] : files[f].replace(/<svg\b/, '<svg xmlns="http://www.w3.org/2000/svg"');
    try { writeFileSync(join(dest, f.replace(/og\.svg$/, 'og.png')), new Resvg(svg, { fitTo: { mode: 'width', value: 1200 }, background: 'white', font: { loadSystemFonts: true } }).render().asPng()); return `${f} → ${f.replace(/svg$/, 'png')}`; }
    catch (e) { return `${f}: not rendered (${String(e.message).slice(0, 100)})`; }
  });
}

export async function publishSites({ runDir, www, gateScript = join(HERE, '..', '..', 'scripts', 'lab-content-gate.mjs'), now = new Date().toISOString() }) {
  const commonsDir = join(runDir, 'commons');
  const commons = existsSync(commonsDir) ? readTree(commonsDir) : {};
  const { files, sites, skipped } = plan(commons);
  const dest = join(www, TENANT);
  const before = existsSync(dest) ? readTree(dest) : {};
  const same = JSON.stringify(Object.entries(before).sort()) === JSON.stringify(Object.entries(files).sort());
  let result, rendered = [];
  if (!Object.keys(files).length) result = { changed: false, ok: true, sites: [], errors: [], note: 'www/ is empty: nothing published' };
  else if (same) result = { changed: false, ok: true, sites, errors: [], note: 'unchanged since the last publish' };
  else {
    const keep = mkdtempSync(join(tmpdir(), 'phim-'));
    if (existsSync(dest)) cpSync(dest, keep, { recursive: true });
    rmSync(dest, { recursive: true, force: true });
    writeTree(dest, files);
    // Link-card pictures: og:image must be PNG or JPEG and the commons keeps text, so every og.svg
    // is rendered to og.png beside it (resvg, installed on the runner). Point og:image at og.png.
    rendered = await renderOg(dest, files);
    const g = gate(dest, gateScript);
    if (!g.ok) { rmSync(dest, { recursive: true, force: true }); if (readdirSync(keep).length) cpSync(keep, dest, { recursive: true }); }
    rmSync(keep, { recursive: true, force: true });
    result = { changed: g.ok, ok: g.ok, sites, errors: g.errors };
  }
  result.skipped = skipped;
  if (rendered.length) result.og = rendered;
  const live = `# LIVE: what the lab did with www/ (${now.slice(0, 16)}Z)\n\n` +
    (result.ok
      ? (result.changed ? `Published. It deploys within a few minutes of this run ending; check it with WebFetch.\n\n` : `${result.note || 'Nothing changed.'}\n\n`) +
        `- the corner: ${BASE}\n${sites.map((s) => `- ${s}: ${BASE}${s}/`).join('\n')}\n`
      : `**Not published.** The content gate refused this run's www/, so the last good version stays up.\n\n${result.errors.map((e) => `- ${e}`).join('\n')}\n`) +
    (rendered.length ? `\nCard pictures:\n${rendered.map((s) => `- ${s}`).join('\n')}\n` : '') +
    (skipped.length ? `\nLeft out:\n${skipped.map((s) => `- ${s}`).join('\n')}\n` : '');
  mkdirSync(join(commonsDir, 'www'), { recursive: true });
  writeFileSync(join(commonsDir, LIVE), live);
  writeFileSync(join(runDir, 'sites.json'), JSON.stringify({ at: now, ...result }, null, 1) + '\n');
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
  const runDir = arg('run'), www = arg('www');
  if (!runDir || !www) { console.error('usage: publish-sites.mjs --run <run dir> --www <lab/www>'); process.exit(2); }
  if (!existsSync(join(runDir, 'commons', 'www'))) { console.log(JSON.stringify({ changed: false, ok: true, sites: [], errors: [], note: 'no www/' })); process.exit(0); }
  console.log(JSON.stringify(await publishSites({ runDir, www, ...(arg('gate') ? { gateScript: arg('gate') } : {}) })));
}
