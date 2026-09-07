#!/usr/bin/env node
// Gate G1 of the sci loop (docs/SCI-LOOP.md): every DOI cited on a page must
// actually resolve.
//
// This exists because one did not. `10.1109/TMI.2011.2180730` was cited for
// Guerquin-Kern et al. 2012 on the k-space page and returns "DOI Not Found" —
// the paper is `10.1109/TMI.2011.2174158`. It was a plausible-looking string
// with the right registrant and the right shape, and nothing but resolving it
// would have caught it.
//
//   node scripts/check-dois.mjs sci/mri/kspace/index.html …    # named files
//   node scripts/check-dois.mjs --surface sci                  # every page
//   node scripts/check-dois.mjs --surface sci --offline        # syntax only
//
// Network calls are cached in .doi-cache.json so re-runs are free and CI does
// not hammer doi.org. Exits non-zero on the first DOI that does not resolve.

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const offline = args.includes("--offline");
const surfaceIx = args.indexOf("--surface");
const files = [];

if (surfaceIx >= 0) {
  const root = args[surfaceIx + 1];
  const walk = (dir) => {
    for (const e of readdirSync(dir)) {
      if (e === "pkg" || e === "target" || e === "node_modules") continue;
      const p = join(dir, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (e.endsWith(".html")) files.push(p);
    }
  };
  walk(root);
} else {
  files.push(...args.filter((a) => !a.startsWith("--")));
}

if (!files.length) {
  console.error("usage: check-dois.mjs <files…> | --surface <dir> [--offline]");
  process.exit(2);
}

const CACHE = ".doi-cache.json";
const cache = existsSync(CACHE) ? JSON.parse(readFileSync(CACHE, "utf8")) : {};

// Where each DOI was seen, so a failure names the page to fix.
//
// Extraction is by href attribute, deliberately. A character-class scan cannot
// do this: real DOIs contain parentheses — `10.1016/0022-2364(76)90233-X` is
// Hoult & Richards — and any class that excludes `)` truncates them into
// strings that look like DOIs and 404. The first run of this script "found" two
// bad citations that were both this bug.
const seen = new Map();
const add = (doi, f) => {
  const clean = decodeURIComponent(doi).replace(/[.,;]+$/, "").trim();
  if (!clean.startsWith("10.")) return;
  if (!seen.has(clean)) seen.set(clean, new Set());
  seen.get(clean).add(f);
};
for (const f of files) {
  const html = readFileSync(f, "utf8");
  // 1. links: take the whole attribute value, whatever is in it
  for (const m of html.matchAll(/href=["']https?:\/\/(?:dx\.)?doi\.org\/([^"']+)["']/g)) {
    add(m[1], f);
  }
  // 2. bare mentions in prose: stop only at whitespace or a tag
  for (const m of html.matchAll(/(?:^|[\s(>])(?:doi:|https?:\/\/(?:dx\.)?doi\.org\/)(10\.[^\s<]+)/g)) {
    add(m[1], f);
  }
}

if (!seen.size) {
  console.log("check-dois: no DOIs found in " + files.length + " file(s)");
  process.exit(0);
}

// Shape check first — free, and catches typos that would otherwise cost a
// network round trip.
let bad = 0;
for (const doi of seen.keys()) {
  if (!/^10\.\d{4,9}\/\S+$/.test(doi)) {
    console.error(`  ✗ ${doi} — not a well-formed DOI`);
    console.error(`      cited in: ${[...seen.get(doi)].join(", ")}`);
    bad++;
  }
}

if (offline) {
  console.log(`check-dois: ${seen.size} DOIs, syntax only (--offline)`);
  process.exit(bad ? 1 : 0);
}

const resolve = async (doi) => {
  if (cache[doi]) return cache[doi];
  try {
    const res = await fetch("https://doi.org/" + encodeURI(doi), {
      headers: { Accept: "application/vnd.citationstyles.csl+json" },
      redirect: "follow",
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return (cache[doi] = { ok: false, why: "HTTP " + res.status });
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("json")) {
      // doi.org serves an HTML error page for unknown DOIs.
      return (cache[doi] = { ok: false, why: "not registered" });
    }
    const j = await res.json();
    return (cache[doi] = {
      ok: true,
      title: (j.title || "").replace(/<[^>]+>/g, "").slice(0, 90),
      year: j.issued?.["date-parts"]?.[0]?.[0] ?? "?",
      journal: (j["container-title"] || "").slice(0, 50),
    });
  } catch (e) {
    // A network failure is not a bad citation; say so and do not fail the gate.
    return { ok: true, skipped: true, why: String(e.message || e).slice(0, 60) };
  }
};

let skipped = 0;
for (const doi of [...seen.keys()].sort()) {
  const r = await resolve(doi);
  if (r.skipped) {
    console.log(`  ? ${doi} — unreachable (${r.why})`);
    skipped++;
  } else if (r.ok) {
    console.log(`  ✓ ${doi}  ${r.year}  ${r.title}`);
  } else {
    console.error(`  ✗ ${doi} — ${r.why}`);
    console.error(`      cited in: ${[...seen.get(doi)].join(", ")}`);
    bad++;
  }
}

writeFileSync(CACHE, JSON.stringify(cache, null, 1));

const line = `check-dois: ${seen.size} DOIs across ${files.length} file(s)` +
  (skipped ? `, ${skipped} unreachable` : "");
if (bad) {
  console.error(`\n${line} — ${bad} do not resolve`);
  process.exit(1);
}
console.log(`\n${line} — all resolve`);
