/* Paper 2's one networked step: each DOI in refs.json → its Crossref record as CSL JSON, cached in data/crossref.json
   (the build reads only the cache). Rerun after adding a source.     node four/papers/p2/refs-crossref.mjs */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
const here = new URL(".", import.meta.url), R = JSON.parse(readFileSync(new URL("refs.json", here), "utf8")).refs, out = new URL("data/crossref.json", here);
const cache = existsSync(out) ? JSON.parse(readFileSync(out, "utf8")) : {};
for (const r of R.filter((x) => x.doi)) {
  if (cache[r.doi] && !process.argv.includes("--refresh")) continue;
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(r.doi)}/transform/application/vnd.citationstyles.csl+json`);
  if (!res.ok) { console.error(`${r.key}: ${r.doi} → HTTP ${res.status}`); process.exitCode = 1; continue; }
  cache[r.doi] = await res.json(); console.log(`${r.key}: ${cache[r.doi].title}`);
}
writeFileSync(out, JSON.stringify(cache, null, 1)); console.log(`data/crossref.json: ${Object.keys(cache).length} records`);
