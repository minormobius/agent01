/* Paper 1 as a PDF: draft/paper.html (page.mjs) printed by headless Chromium, A4, with the paper stylesheet's own
   print rules. Needs Playwright (preinstalled in the agent's sandbox); not part of the build or the selftest.
     node four/papers/p1/pdf.cjs        → draft/paper.pdf and draft/supplement.pdf, and draft/og.png
   og.png is the link card (og:image, 1200 × 630) for both pages: figure 2, the whole table, under the title and byline.
   Rerun after the table or the title changes. */
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
  // the link card: the full table (figure 2) under the title, on the paper's white
  const fs = require("node:fs"), svg = fs.readFileSync(path.join(__dirname, "figures/2.svg"), "utf8");
  const title = (fs.readFileSync(path.join(__dirname, "draft/paper.md"), "utf8").match(/^# (.+?)(\s*\{[^}]*\})?$/m) || [, "Paper 1"])[1];
  const card = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await card.setContent(`<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:#fff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px">
    <div style="font-size:31px;font-weight:700;text-align:center;max-width:1100px;line-height:1.2">${title}</div>
    <div style="font-size:19px;color:#555">Claude · Astra · minor mobius &nbsp;·&nbsp; four.mino.mobi</div>
    <div style="width:1140px;margin-top:8px">${svg.replace(/width="[^"]*" height="[^"]*"/, 'width="1140" height="386"')}</div></body></html>`);
  await card.waitForTimeout(300); await card.screenshot({ path: path.join(__dirname, "draft/og.png") }); console.log("wrote draft/og.png");
  await b.close();
})();
