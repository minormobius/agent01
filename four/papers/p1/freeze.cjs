/* Freezes paper 1's current draft as a numbered version that never changes again: papers/p1/v<N>/ gets its own copy
   of the paper and the supplement (HTML and their sources), the figures, the stylesheet, the data and ledger the paper
   links, both PDFs and the link card. Relative links are rewritten to the version's own copies, the card tags point at
   the version, a line under the byline says what was frozen and where the living draft is, and the PDFs are printed
   from the frozen pages with their links resolved against the version's address. The draft keeps moving; a version
   is what gets shared. Needs Playwright (sandbox), like pdf.cjs. Run it on a clean, current draft (build.mjs,
   page.mjs, pdf.cjs first) and commit the result.
     node four/papers/p1/freeze.cjs 1        → papers/p1/v1/ (refuses to overwrite an existing version) */
const { chromium } = require("playwright");
const fs = require("node:fs"), path = require("node:path"), { execFileSync } = require("node:child_process");

const n = Number(process.argv[2]);
if (!Number.isInteger(n) || n < 1) { console.error("usage: node four/papers/p1/freeze.cjs <version number>"); process.exit(2); }
const P1 = __dirname, DRAFT = path.join(P1, "draft"), OUT = path.join(P1, `v${n}`);
if (fs.existsSync(OUT)) { console.error(`papers/p1/v${n} already exists: a version is never rewritten`); process.exit(1); }
const git = (...a) => execFileSync("git", a, { cwd: P1, encoding: "utf8" }).trim();
if (git("status", "--porcelain", "--", ".")) { console.error("papers/p1 has uncommitted changes: freeze a committed draft, so the version names its commit"); process.exit(1); }
const commit = git("rev-parse", "--short=9", "HEAD"), date = new Date().toISOString().slice(0, 10);
const DRAFT_URL = "https://four.mino.mobi/papers/p1/draft/", URL = `https://four.mino.mobi/papers/p1/v${n}/`;

fs.mkdirSync(path.join(OUT, "figures"), { recursive: true }); fs.mkdirSync(path.join(OUT, "data"), { recursive: true });
for (const f of fs.readdirSync(path.join(P1, "figures")).filter((f) => f.endsWith(".svg"))) fs.copyFileSync(path.join(P1, "figures", f), path.join(OUT, "figures", f));
fs.copyFileSync(path.join(P1, "paper.css"), path.join(OUT, "paper.css"));
fs.copyFileSync(path.join(P1, "ledger.json"), path.join(OUT, "ledger.json"));
fs.copyFileSync(path.join(P1, "data/table4-hundspin.csv"), path.join(OUT, "data/table4-hundspin.csv"));
fs.copyFileSync(path.join(DRAFT, "og.png"), path.join(OUT, "og.png"));
for (const f of ["paper.md", "supplement.md"]) fs.copyFileSync(path.join(DRAFT, f), path.join(OUT, f));

const note = `<p class="p-meta">Version ${n}, frozen ${date} from commit ${commit}. This copy never changes; the <a href="../draft/${"FILE"}">living draft</a> keeps moving with the code.</p>`;
for (const f of ["paper.html", "supplement.html"]) {
  let h = fs.readFileSync(path.join(DRAFT, f), "utf8");
  const before = h;
  h = h.replaceAll('href="../paper.css"', 'href="paper.css"').replaceAll('src="../figures/', 'src="figures/').replaceAll('href="../figures/', 'href="figures/')
    .replaceAll('href="../data/', 'href="data/').replaceAll('href="../ledger.json"', 'href="ledger.json"')
    .replaceAll(DRAFT_URL, URL) // the card's og:url and og:image
    .replace(/four\.mino\.mobi · paper 1 · in preparation/, `four.mino.mobi · paper 1 · version ${n}`)
    .replace(/(<div class="p-affils">[\s\S]*?<\/div>)/, `$1\n${note.replace("FILE", f)}`);
  if (h === before || !h.includes(`version ${n}`) || !h.includes(`Version ${n}, frozen`)) throw new Error(`${f}: the rewrite didn't take; page.mjs's markup may have changed`);
  if (/(?:href|src)="\.\.\/(?!\.\.\/|draft\/)/.test(h)) throw new Error(`${f}: a relative link still reaches outside the version`);
  fs.writeFileSync(path.join(OUT, f), h);
}

(async () => {
  const b = await chromium.launch();
  for (const name of ["paper", "supplement"]) {
    const pg = await b.newPage(); await pg.goto("file://" + path.join(OUT, `${name}.html`)); await pg.waitForTimeout(1500);
    await pg.evaluate((base) => document.querySelectorAll("a[href]").forEach((a) => { const h = a.getAttribute("href"); if (!/^(#|[a-z]+:)/i.test(h)) a.href = new URL(h, base).href; }), `${URL}${name}.html`);
    await pg.pdf({ path: path.join(OUT, `${name}.pdf`), format: "A4", margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" }, printBackground: true });
    await pg.close();
  }
  await b.close();
  console.log(`froze papers/p1/v${n} from ${commit} (${date}): ${fs.readdirSync(OUT).join(", ")}`);
})();
