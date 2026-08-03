#!/usr/bin/env node
// lab-fetch-assets.mjs — bring the files somebody linked onto the domain.
//
//   printf '%s\n' $urls | node scripts/lab-fetch-assets.mjs lab/www/<slug>
//
// Writes into <dir>/assets/ and prints a manifest to stdout for the brief.
// NEVER exits non-zero for a refusal: an asset that cannot be fetched, or may
// not be published, is a normal outcome and must not take down a build that has
// not started yet. Only a usage error is fatal.
//
// WHY THE HARNESS AND NOT THE AGENT. The build agent has no Bash and no
// network — deliberately, because the secret scan only inspects published
// files, so an agent that can make an outbound request is a channel no gate can
// see. Everything that touches the network happens here, before the agent runs,
// and the agent finds files on disk.
//
// WHY ONTO THE DOMAIN AND NOT THROUGH A PROXY: see the header of
// lib/asset-sources.mjs. Short version — a same-origin `/_asset/?url=…` would
// turn `connect-src 'self'` into "any host" for every tenant at once.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { safeFetch } from './lib/safe-fetch.mjs';
import { planAsset, directFile, resolveAsset, looksLike, safeName, creditLine } from './lib/asset-sources.mjs';

/** Caps, and what each one is actually defending.
 *
 *  PER FILE — the page has to load on a phone. The model that prompted all this
 *  is 44 KB; 4 MB is generous for the low-poly work these sources exist for and
 *  small enough that a mistake is not a 30 MB download on someone's data plan.
 *
 *  TOTAL — the site is one directory in a repo that keeps every version
 *  forever, and Workers Static Assets uploads the whole manifest on every
 *  deploy. Per-file alone bounds one asset; this bounds a build.
 *
 *  COUNT — a submission can list dozens of files. Taking all of them turns "use
 *  this sprite" into a bulk mirror of somebody's portfolio. */
const MAX_BYTES = 4 * 1024 * 1024;
const MAX_TOTAL = 12 * 1024 * 1024;
const MAX_ASSETS = 6;
const MAX_PAGES = 6;
const TIMEOUT_MS = 25000;
/** opengameart.org/robots.txt asks for Crawl-delay: 10. One build fetches a
 *  handful of pages, so honouring it costs seconds and is the difference
 *  between a good citizen and a scraper. */
const CRAWL_DELAY = { 'opengameart.org': 10000 };

const ci = Boolean(process.env.GITHUB_ACTIONS);
const warn = (m) => console.error(ci ? `::warning::${m}` : `  ! ${m}`);
const note = (m) => console.error(`  · ${m}`);

const dir = process.argv[2];
if (!dir) {
  console.error('usage: lab-fetch-assets.mjs <tenant dir>   [urls on stdin]');
  process.exit(2);
}

const stdin = await new Promise((r) => {
  let s = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => { s += d; });
  process.stdin.on('end', () => r(s));
  process.stdin.on('error', () => r(''));
});

// Only links that are ALREADY canonical URLs. The bot supplies these from the
// post's link facets, so there is no prose-scraping here and no second guess at
// what somebody meant.
const urls = [...new Set((stdin.match(/https:\/\/[^\s<>"']+/g) || []).map((u) => u.replace(/[.,)]+$/, '')))];
const pages = urls.filter((u) => planAsset(u)).slice(0, MAX_PAGES);

/** WHY NOTHING ARRIVED, KEPT AND HANDED TO THE AGENT.
 *
 *  A refusal used to be invisible: the brief simply had no asset section, so
 *  the agent could not tell "nobody linked anything" from "the harness tried
 *  and was turned away". It guessed, and expensively — one build spent turns
 *  writing an OBJ parser and a file-upload button, and left a NOTE.txt
 *  concluding "this build can't reach poly.pizza or opengameart, live or at
 *  build time", which was true of that run and wrong as a general fact. A
 *  silent failure that costs model turns is worse than a loud one.
 *
 *  Collected BEFORE the early exit, because a link straight at a file produces
 *  no page to visit and is exactly the case that needs an answer. */
const problems = [];
for (const u of urls) {
  const d = directFile(u);
  if (d) problems.push(`${u} — ${d.why}`);
}

const report = () => {
  if (problems.length) writeFileSync('/tmp/lab-assets-problems.txt', `${problems.join('\n')}\n`);
};
if (!pages.length) { report(); process.exit(0); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lastFetch = new Map();

/** 403 FROM A RUNNER IS NOT THE SAME AS 403 FROM A LAPTOP.
 *
 *  poly.pizza sits behind Cloudflare, and the first real build got 403 on one
 *  model page and on the CDN while serving the other page fine — from the same
 *  job, seconds apart. The identical requests succeed from a developer machine.
 *  That mixture is bot-scoring on a datacenter IP range, and GitHub Actions is
 *  one of the most heavily used ranges there is.
 *
 *  So: retry, with backoff, honouring Retry-After. It is the honest fix and it
 *  works if the scoring is rate-shaped, which the mixed result suggests.
 *
 *  WHAT IS DELIBERATELY NOT DONE is sending a browser User-Agent. It would very
 *  likely work — Cloudflare weighs UA heavily — and it would be evading an
 *  access control the site owner chose to put up, while telling their logs a
 *  lie about who is calling. A factory that identifies itself and is turned
 *  away has been turned away; the answer to that is to ask the operator, not to
 *  put on a costume. If poly.pizza should be reachable from CI, that is a
 *  conversation with poly.pizza. */
const RETRY_STATUS = new Set([403, 408, 425, 429, 500, 502, 503, 504]);

async function polite(url, attempt = 0) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const wait = CRAWL_DELAY[host];
  if (wait && lastFetch.has(host)) {
    const since = Date.now() - lastFetch.get(host);
    if (since < wait) await sleep(wait - since);
  }
  lastFetch.set(host, Date.now());
  // safeFetch, not fetch: the destination is chosen by whoever tagged the bot,
  // and it re-checks on every redirect hop. Identical reasoning to
  // lab-fetch-refs.mjs, and the same module.
  const res = await safeFetch(url, {
    timeoutMs: TIMEOUT_MS,
    headers: { 'User-Agent': 'mino-lab-factory (+https://minomobi.com)' },
  });
  if (!res.ok && RETRY_STATUS.has(res.status) && attempt < 2) {
    const after = Number(res.headers.get('retry-after'));
    const backoff = Number.isFinite(after) && after > 0
      ? Math.min(after * 1000, 15000)
      : 1500 * (attempt + 1) ** 2;
    note(`${url}: HTTP ${res.status}, retrying in ${Math.round(backoff / 1000)}s`);
    await sleep(backoff);
    return polite(url, attempt + 1);
  }
  return res;
}

const assetDir = join(dir, 'assets');
const written = [];
const credits = [];
let total = 0;

for (const page of pages) {
  if (written.length >= MAX_ASSETS) break;
  let html;
  try {
    const res = await polite(page);
    if (!res.ok) {
      warn(`${page}: HTTP ${res.status}`);
      problems.push(`${page} — the source answered HTTP ${res.status}${res.status === 403
        ? ' (its bot protection refused this runner; the same link works from a browser)' : ''}`);
      continue;
    }
    html = await res.text();
  } catch (err) {
    warn(`${page}: ${String(err.message || err).slice(0, 120)}`);
    problems.push(`${page} — ${String(err.message || err).slice(0, 120)}`);
    continue;
  }

  const a = resolveAsset(page, html);
  if (!a.ok) { note(`${page}: ${a.reason}`); problems.push(`${page} — ${a.reason}`); continue; }

  for (const [i, file] of a.files.entries()) {
    if (written.length >= MAX_ASSETS) break;
    let bytes;
    try {
      const res = await polite(file.url);
      if (!res.ok) {
        warn(`${file.url}: HTTP ${res.status}`);
        problems.push(`${a.page} — found the file but the download answered HTTP ${res.status}${
          res.status === 403 ? ' (bot protection on the CDN, from this runner)' : ''}`);
        continue;
      }
      // Content-Length first so an oversized file is refused before it is
      // pulled; then the real length, because the header is a claim.
      const claimed = Number(res.headers.get('content-length') || 0);
      if (claimed > MAX_BYTES) {
        note(`${file.url}: ${(claimed / 1048576).toFixed(1)} MB exceeds the ${MAX_BYTES / 1048576} MB cap`);
        continue;
      }
      bytes = new Uint8Array(await res.arrayBuffer());
    } catch (err) {
      warn(`${file.url}: ${String(err.message || err).slice(0, 120)}`);
      continue;
    }
    if (bytes.length > MAX_BYTES) {
      note(`${file.url}: ${(bytes.length / 1048576).toFixed(1)} MB exceeds the cap (header under-reported it)`);
      continue;
    }
    if (total + bytes.length > MAX_TOTAL) { note(`total budget reached at ${written.length} assets`); break; }
    // A redirect to a login wall, an error page and a rate-limit notice are all
    // 200s full of HTML. Without this the page gets a file called `robot.glb`
    // containing `<!doctype html>` and a scene that silently never renders.
    if (!looksLike(file.ext, bytes)) {
      warn(`${file.url}: does not look like a ${file.ext} — refusing it rather than shipping a broken asset`);
      continue;
    }

    mkdirSync(assetDir, { recursive: true });
    let name = safeName(file.title, file.ext, i);
    let n = 2;
    while (existsSync(join(assetDir, name))) name = safeName(`${file.title}-${n++}`, file.ext, i);
    writeFileSync(join(assetDir, name), bytes);
    written.push({
      name, bytes: bytes.length, source: a.source, page: a.page, licence: a.licence,
      // THE HASH IS WHAT LETS THE CONTENT GATE ALLOW THESE BYTES AT ALL.
      // A tenant directory may not contain anything the gate cannot read —
      // 'wasm-unsafe-eval' is on, so an unreviewed binary is potentially
      // executable code nobody looked at. That rule stood on "agents cannot
      // produce a binary: no compiler, no network, no shell", and this script
      // is exactly the thing that changes it. So the exemption is not "glb is
      // fine", it is "these specific bytes are the ones the harness fetched" —
      // and the agent, which has no way to compute one, cannot forge it.
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    total += bytes.length;
    note(`assets/${name} — ${(bytes.length / 1024).toFixed(0)} KB, ${a.licence}, from ${a.source}`);
  }
  // ONE CREDIT PER SUBMISSION, and it is written whenever anything from that
  // page was kept — including CC0, where it is courtesy rather than a
  // condition. The gate below only ENFORCES the ones the licence requires.
  if (written.some((w) => w.page === a.page)) {
    credits.push({ line: creditLine(a), required: a.credit, creator: a.creator, page: a.page });
  }
}

// Written whether or not anything arrived — an empty-handed run with reasons is
// the case this exists for.
report();
if (!written.length) process.exit(0);

// The manifest is the gate's evidence, and it ships: provenance for a file on a
// permanent public URL belongs next to the file.
writeFileSync(join(assetDir, 'manifest.json'), `${JSON.stringify({ assets: written, credits }, null, 2)}\n`);

// CREDITS.md is the record, and the brief tells the agent it must be rendered.
// A file on disk rather than a line in a prompt because the prompt is long and
// this has to survive being skimmed — and because the content gate reads it.
writeFileSync(join(dir, 'CREDITS.md'), [
  '# Credits',
  '',
  'Assets in `assets/` came from elsewhere and are used under their own terms.',
  'Every line marked REQUIRED must appear in the rendered page — attribution is a',
  'condition of the licence, not a courtesy, and the build will fail without it.',
  '',
  ...credits.map((c) => `- ${c.required ? '**REQUIRED** ' : ''}${c.line}`),
  '',
].join('\n'));

console.log(JSON.stringify({
  dir: assetDir,
  assets: written,
  credits: credits.map((c) => ({ line: c.line, required: c.required })),
  totalBytes: total,
}, null, 2));
