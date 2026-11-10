/* Paper 1 as a PDF: draft/paper.html (page.mjs) printed by headless Chromium, A4, with the paper stylesheet's own
   print rules. Needs Playwright (preinstalled in the agent's sandbox); not part of the build or the selftest.
     node four/papers/p1/pdf.cjs        → draft/paper.pdf and draft/supplement.pdf */
const { chromium } = require("playwright");
const path = require("node:path"), LIVE = "https://four.mino.mobi/papers/p1/draft/";
(async () => {
  const b = await chromium.launch();
  for (const name of ["paper", "supplement"]) {
    const pg = await b.newPage(); await pg.goto("file://" + path.join(__dirname, `draft/${name}.html`)); await pg.waitForTimeout(1500);
    // a PDF has no neighbours: links to the other page, the data and the site go to the live copy, not this disk
    await pg.evaluate((base) => document.querySelectorAll("a[href]").forEach((a) => { const h = a.getAttribute("href"); if (!/^(#|[a-z]+:)/i.test(h)) a.href = new URL(h, base).href; }), `${LIVE}${name}.html`);
    await pg.pdf({ path: path.join(__dirname, `draft/${name}.pdf`), format: "A4", margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" }, printBackground: true });
    console.log(`wrote draft/${name}.pdf`); await pg.close();
  }
  await b.close();
})();
