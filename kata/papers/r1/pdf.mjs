#!/usr/bin/env node
/* R1 as PDFs: paper.html printed by headless Chromium with the journal stylesheet's print rules.
     paper.pdf           one column, A4
     paper-journal.pdf   two columns (the body's `single` class taken off), letter, the journal's page
     og.png              the link card: the title over figure 4
   Relative links are pointed at the live copy first (printed from disk they would be file:// paths). Needs Playwright.
   NODE_PATH=$(npm root -g) node kata/papers/r1/pdf.mjs */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const here = path.dirname(fileURLToPath(import.meta.url)), { chromium } = createRequire(import.meta.url)("playwright"), LIVE = "https://kata.mino.mobi/papers/r1/paper.html";
const b = await chromium.launch(), report = {};
for (const [name, two] of [["paper", false], ["paper-journal", true]]) { const pg = await b.newPage(); await pg.goto("file://" + path.join(here, "paper.html")); 
  await pg.evaluate(({ base, two }) => { document.querySelectorAll("img").forEach((i) => (i.loading = "eager")); document.querySelectorAll("a[href]").forEach((a) => { const h = a.getAttribute("href"); if (!/^(#|[a-z]+:)/i.test(h)) a.href = new URL(h, base).href; }); if (two) document.querySelector(".p-body").classList.remove("single"); }, { base: LIVE, two });
  await pg.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 30000 }); await pg.waitForTimeout(400);
  await pg.pdf({ path: path.join(here, name + ".pdf"), format: two ? "Letter" : "A4", margin: two ? { top: "18mm", bottom: "18mm", left: "14mm", right: "14mm" } : { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" }, printBackground: true });
  const bytes = fs.readFileSync(path.join(here, name + ".pdf")); report[name] = { kb: Math.round(bytes.length / 1024), pages: (bytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length }; await pg.close(); }
const card = await b.newPage({ viewport: { width: 1200, height: 630 } }), svg = fs.readFileSync(path.join(here, "fig/bench-ropes.svg"), "utf8"), title = (fs.readFileSync(path.join(here, "DRAFT.md"), "utf8").match(/^# (.+)$/m) || [, "Paper 2"])[1];
await card.setContent(`<!doctype html><html><body style="margin:0;width:1200px;height:630px;background:#fff;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;color:#1a1a1a;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px"><div style="font-size:34px;font-weight:700;text-align:center;max-width:1100px;line-height:1.2">${title}</div><div style="font-size:19px;color:#555">Claude · Astra · minor mobius &nbsp;·&nbsp; kata.mino.mobi</div><div style="width:900px;margin-top:6px">${svg}</div></body></html>`);
await card.waitForTimeout(300); await card.screenshot({ path: path.join(here, "og.png") }); await b.close();
console.error("wrote", Object.entries(report).map(([k, v]) => `${k}.pdf (${v.pages} pages, ${v.kb} KB)`).join(", "), "and og.png");
