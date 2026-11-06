/* Paper 1's pages: each draft section (draft/*.md, which build.mjs fills from text/*.md) rendered to HTML by pandoc,
   its $$ TeX $$ maths as MathML (browsers draw it natively; no maths library is downloaded), on the paper stylesheet
   (paper.css, forked from wormhole's). Each page carries its source's SHA-256, so the selftest can tell a stale page
   without pandoc.
     node four/papers/p1/page.mjs           render every draft section (needs pandoc)
     node four/papers/p1/page.mjs --check   exit 1 if a page is missing or older than its source */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url)), DRAFT = path.join(here, "draft");
const sha = (t) => createHash("sha256").update(t).digest("hex");
const sections = () => (existsSync(DRAFT) ? readdirSync(DRAFT).filter((f) => f.endsWith(".md")).sort() : []);

/* the pages that are missing or older than their draft source */
export function stalePages() {
  return sections().filter((f) => {
    const html = path.join(DRAFT, f.replace(/\.md$/, ".html"));
    if (!existsSync(html)) return true;
    const m = readFileSync(html, "utf8").match(/<meta name="source-sha256" content="([0-9a-f]+)"/);
    return !m || m[1] !== sha(readFileSync(path.join(DRAFT, f), "utf8"));
  });
}

function render(f) {
  const src = readFileSync(path.join(DRAFT, f), "utf8"), md = src.replace(/<!--[\s\S]*?-->\n?/g, "");
  const body = execFileSync("pandoc", ["-f", "markdown", "-t", "html5", "--mathml"], { input: md, encoding: "utf8" });
  const title = (md.match(/^# (.+)$/m) || [, f])[1];
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="source-sha256" content="${sha(src)}" />
<title>Paper 1 · ${title.replace(/[<>&]/g, "")}</title>
<link rel="icon" href="data:," />
<link rel="stylesheet" href="../paper.css" />
</head>
<body>
<div class="toolbar"><span class="brand"><a href="../../">four · papers</a></span><span>paper 1 · ${f === "paper.md" ? "the whole draft" : "draft section"}</span><span class="grow" style="flex:1"></span>${f === "paper.md" ? `<a href="paper.pdf">PDF</a>&nbsp;·&nbsp;` : ""}<a href="${f}">source with its numbers</a></div>
<article class="sheet">
<div class="p-venue">four.mino.mobi · paper 1 · in preparation</div>
<div class="p-body single">
${body}
</div>
<div class="p-source">Generated from <code>papers/p1/text/${f}</code>: every number in it is read by <code>build.mjs</code> from the solver, the bake or the runs, so this text says what the code does. Rendered by pandoc with MathML.</div>
</article>
</body>
</html>
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes("--check")) { const s = stalePages(); if (s.length) { console.error(`papers/p1 pages stale: ${s.join(", ")} (node four/papers/p1/page.mjs)`); process.exit(1); } console.log(`papers/p1: ${sections().length} pages current`); }
  else for (const f of sections()) { writeFileSync(path.join(DRAFT, f.replace(/\.md$/, ".html")), render(f)); console.log(`wrote draft/${f.replace(/\.md$/, ".html")}`); }
}
