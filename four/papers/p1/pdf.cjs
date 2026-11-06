/* Paper 1 as a PDF: draft/paper.html (page.mjs) printed by headless Chromium, A4, with the paper stylesheet's own
   print rules. Needs Playwright (preinstalled in the agent's sandbox); not part of the build or the selftest.
     node four/papers/p1/pdf.cjs        → draft/paper.pdf */
const { chromium } = require("playwright");
const path = require("node:path");
(async () => {
  const b = await chromium.launch(), pg = await b.newPage(), src = path.join(__dirname, "draft/paper.html");
  await pg.goto("file://" + src); await pg.waitForTimeout(1500);
  await pg.pdf({ path: path.join(__dirname, "draft/paper.pdf"), format: "A4", margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" }, printBackground: true });
  const pages = await pg.evaluate(() => document.body.scrollHeight); await b.close(); console.log(`wrote draft/paper.pdf (page height ${pages}px)`);
})();
