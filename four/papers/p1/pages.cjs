/* Paper 1's length in a journal's pages: draft/paper.html laid out as a two-column letter page at 10 pt (Physical
   Review's measure, roughly), each figure one column wide and each table across both, then printed by headless
   Chromium. It counts the main text's pages (title to the conclusion, without the back matter: the author contributions,
   the supplementary-material note and the references; the notation and appendices are on draft/supplement.html) and the whole page's, references included. Needs Playwright; sandbox-only, like pdf.cjs.
     node four/papers/p1/pages.cjs        → draft/paper-journal.pdf, and the counts */
const { chromium } = require("playwright");
const path = require("node:path"), fs = require("node:fs");
const STYLE = `
  @page { size: letter; margin: 19mm 16mm 20mm; }
  body { background: #fff !important; } .toolbar, .p-source { display: none !important; }
  .sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
  .p-body.single, .p-body { column-count: 2 !important; column-gap: 7mm !important; font-size: 10pt !important; line-height: 1.22 !important; text-align: justify; }
  .p-body p { margin: 0 0 3pt !important; }
  .p-body h1 { column-span: all; font-size: 11pt !important; margin: 8pt 0 4pt !important; }
  .p-body h1.p-title { font-size: 14pt !important; margin: 0 0 4pt !important; max-width: none !important; }
  .p-body .p-authors, .p-body .p-affils { column-span: all; margin: 2pt 0 !important; }
  .p-body h2 { font-size: 10pt !important; margin: 7pt 0 3pt !important; break-after: avoid; }
  .p-body figure { margin: 5pt 0 !important; break-inside: avoid; }
  .p-body figure img, .p-body figure svg { width: 100% !important; height: auto !important; }
  .p-body figcaption { font-size: 8pt !important; line-height: 1.2 !important; }
  .p-body table { column-span: all; font-size: 8pt !important; width: 100%; break-inside: avoid; }
  .p-body math[display="block"] { margin: 4pt auto !important; }
  .p-body ul, .p-body ol { margin: 2pt 0 4pt 1.1em !important; padding: 0 !important; }
  .p-body .references, .p-body #refs { font-size: 8pt !important; }`;
const count = (file) => (fs.readFileSync(file, "latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
(async () => {
  const b = await chromium.launch(), pg = await b.newPage(), src = path.join(__dirname, "draft/paper.html"), scratch = path.join(require("node:os").tmpdir(), "p1-body.pdf");
  await pg.goto("file://" + src); await pg.waitForTimeout(1500); await pg.addStyleTag({ content: STYLE });
  const whole = path.join(__dirname, "draft/paper-journal.pdf");
  await pg.pdf({ path: whole, preferCSSPageSize: true, printBackground: true });
  // the main text alone: drop the notation table, the appendices and everything after them
  const words = await pg.evaluate(() => {
    const body = document.querySelector(".p-body"), kids = [...body.children], app = kids.findIndex((e) => e.id === "appendices" || e.id === "author-contributions" || e.id === "supplementary-material");
    if (app >= 0) kids.slice(app).forEach((e) => e.remove());
    const n = kids.findIndex((e) => e.id === "notation"), nEnd = kids.findIndex((e, i) => i > n && /^H[12]$/.test(e.tagName));
    if (n >= 0) kids.slice(n, nEnd).forEach((e) => e.remove());
    const text = [...body.querySelectorAll("p, li, h1, h2")].map((e) => e.textContent).join(" ");
    return text.split(/\s+/).filter(Boolean).length; });
  await pg.pdf({ path: scratch, preferCSSPageSize: true, printBackground: true });
  const out = { mainPages: count(scratch), mainWords: words, wholePages: count(whole) }; fs.rmSync(scratch);
  await b.close(); console.log(JSON.stringify(out));
})();
