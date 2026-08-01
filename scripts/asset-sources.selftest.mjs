#!/usr/bin/env node
// asset-sources.selftest.mjs — what may be published, and under whose name.
//
//   node scripts/asset-sources.selftest.mjs
//
// THE EXPENSIVE FAILURE HERE IS NOT A BROKEN BUILD. It is shipping somebody's
// work on the operator's domain, at a permanent URL, outside the terms they
// granted — with the operator's name on the publication. So most of what
// follows is the refusal half: the licences that must never be admitted, and
// the ways a page can look like it is offering a file when it is not.
//
// The markup fragments are excerpts from real pages (poly.pizza/m/9A6cuitiB_4,
// opengameart.org/content/a-platformer-in-the-forest and
// /content/free-music-pack), captured 2026-08-01. Excerpts rather than whole
// documents because the parsers only read named regions, and a 100 KB fixture
// nobody can diff is a fixture nobody checks.

import {
  normaliseLicence, licenceOf, planAsset, resolveAsset, looksLike, safeName, creditLine,
} from './lib/asset-sources.mjs';

let pass = 0, fail = 0;
const ck = (cond, msg) => { if (cond) pass++; else { fail++; console.error(`  ✗ ${msg}`); } };
const eq = (a, b, msg) => ck(a === b, `${msg}\n      expected: ${JSON.stringify(b)}\n      actual:   ${JSON.stringify(a)}`);

// --- the refusals, first, because they are the point ------------------------
//
// COPYLEFT IS REFUSED ON PURPOSE and this is the block that must never be
// "fixed" by adding an entry. CC-BY-SA and the GPL family attach conditions
// that reach past the file and onto whatever it is bundled into. Whether a
// static page carrying a sprite is a derivative work or mere aggregation is a
// judgement a human makes once — not one a build agent makes at 3am, forty-six
// times, on somebody else's behalf.
for (const bad of [
  'CC-BY-SA 3.0', 'CC-BY-SA 4.0', 'CC BY-SA', 'ccbysa', 'Attribution-ShareAlike 3.0',
  'GPL 2.0', 'GPL 3.0', 'LGPL 2.1', 'AGPL 3.0',
]) {
  eq(normaliseLicence(bad), null, `${bad} is refused`);
  eq(licenceOf([bad]).ok, false, `${bad} fails licenceOf`);
}
// And an unknown string is a refusal, never a default — "no licence stated" and
// "a licence we have not thought about" are both reasons to stop.
for (const unknown of ['Custom', 'Royalty Free', 'Public Domain-ish', 'See readme', '', null, undefined]) {
  eq(normaliseLicence(unknown), null, `unrecognised licence ${JSON.stringify(unknown)} → null`);
}
eq(licenceOf([]).ok, false, 'no licence at all is a refusal');
eq(licenceOf([]).reason, 'no licence stated', 'and it says which kind of refusal');

// THE SUBSTRING TRAP. "cc-by-sa 3.0" contains "cc-by 3.0"; a looser matcher
// admits precisely the family the list exists to exclude.
eq(normaliseLicence('CC-BY-SA 3.0'), null, 'share-alike is not matched as CC-BY');
eq(normaliseLicence('CC-BY 3.0'), 'cc-by 3.0', 'plain CC-BY 3.0 still resolves');

// --- what is allowed --------------------------------------------------------
eq(normaliseLicence('CC0'), 'cc0', 'CC0');
eq(normaliseLicence('CC-BY 4.0'), 'cc-by 4.0', 'CC-BY 4.0');
eq(normaliseLicence('OGA-BY 3.0'), 'oga-by 3.0', 'OGA-BY');
eq(normaliseLicence('Creative Commons Attribution 4.0'), 'cc-by 4.0', 'spelled out longhand');
eq(licenceOf(['CC0']).credit, false, 'CC0 needs no credit');
eq(licenceOf(['CC-BY 3.0']).credit, true, 'CC-BY does');

// ALL, NOT ANY. A submission offered under several licences must have every one
// of them on the allowlist. Picking the permissive option out of a set the
// author chose to offer together is a decision for a human.
eq(licenceOf(['CC0', 'CC-BY-SA 3.0']).ok, false,
   'one copyleft entry refuses the whole submission, even alongside CC0');
eq(licenceOf(['CC0', 'CC-BY 3.0']).ok, true, 'two allowed licences are fine');
eq(licenceOf(['CC0', 'CC-BY 3.0']).credit, true,
   'and the strictest wins — a credit is generated when ANY of the terms asks');

// --- planAsset: which links are asset links ---------------------------------
ck(planAsset('https://poly.pizza/m/9A6cuitiB_4'), 'a poly.pizza model page');
ck(planAsset('https://opengameart.org/content/a-platformer-in-the-forest'), 'an OGA submission');
ck(planAsset('https://www.opengameart.org/content/x'), 'www. is folded');
for (const no of [
  'https://poly.pizza/',                          // the site, not a model
  'https://poly.pizza/search/robot',              // a search page
  'https://opengameart.org/users/buch',           // a profile
  'http://poly.pizza/m/x',                        // plain http
  'https://evil.example/m/x',                     // some other host
  'https://poly.pizza.evil.example/m/x',          // host that merely starts the same
  'javascript:alert(1)', '', null, 42,
]) {
  eq(planAsset(no), null, `not an asset source: ${JSON.stringify(no)}`);
}

// --- the real pages ---------------------------------------------------------
const POLY = `<title data-react-helmet="true">Robot - Free 3D Model By Poly by Google - Poly Pizza</title>
<meta name="twitter:player" content="https://modelviewer.dev/examples/twitter/player.html?src=https://static.poly.pizza/85a95cc6-99dc-4522-a79f-fcf04c308f1e.glb&amp;poster=x"/>
<script>window.x={"Licence":"CC-BY 3.0","Creator":{"Username":"Poly by Google","DPURL":"https:\\u002F\\u002Fstatic.poly.pizza\\u002Fdp%2Fpolygoogle.jpg"}}</script>`;

const poly = resolveAsset('https://poly.pizza/m/9A6cuitiB_4', POLY);
eq(poly.ok, true, 'the real poly.pizza page resolves');
eq(poly.title, 'Robot', 'the title loses the "- Free 3D Model By …" tail');
eq(poly.creator, 'Poly by Google', 'the creator comes out of the inlined state');
eq(poly.licence, 'CC-BY 3.0', 'and the licence');
eq(poly.credit, true, 'CC-BY, so a credit is required');
eq(poly.files.length, 1, 'one model');
eq(poly.files[0].url, 'https://static.poly.pizza/85a95cc6-99dc-4522-a79f-fcf04c308f1e.glb',
   'THE VIEWER PAGE IS NOT THE FILE — the .glb lives on a different host under a uuid');
eq(creditLine(poly), 'Robot by Poly by Google (CC-BY 3.0) — https://poly.pizza/m/9A6cuitiB_4',
   'the credit names the work, the author, the terms, and links home');

const OGA = `<title>A platformer in the forest | OpenGameArt.org</title>
<span class='username'><a href="/users/buch">Buch</a></span>
<p>even more animations, thanks to <a href="http://opengameart.org/users/kingakwasi">KingAkwasi</a></p>
<div class="field field-name-field-art-licenses">License(s):&nbsp;<span class='license-name'>CC0</span></div>
<div class="field-name-field-art-files">
  <a href="https://opengameart.org/sites/default/files/sheet_9.png">sheet_9.png</a>
  <a href="https://opengameart.org/sites/default/files/characters_7.png">characters_7.png</a>
</div>
<a href="https://opengameart.org/sites/default/files/css/css_ff3tJ.css">chrome</a>`;

const oga = resolveAsset('https://opengameart.org/content/a-platformer-in-the-forest', OGA);
eq(oga.ok, true, 'the real OGA page resolves');
eq(oga.licence, 'CC0', 'CC0');
eq(oga.credit, false, 'so no credit is enforced');
// THE ATTRIBUTION MUST NAME THE RIGHT PERSON. The description thanks a second
// user and the page ends with commenters; matching /users/ anywhere picks one
// of those, and a credit naming the wrong author is worse than none.
eq(oga.creator, 'Buch', 'the submitter, not whoever the description thanks');
eq(oga.files.length, 2, 'the two art files');
ck(!oga.files.some((f) => /css|\.js/.test(f.url)),
   "the site's own CSS lives under the same /sites/default/files/ prefix and must not be taken");

// A ZIP-ONLY SUBMISSION IS REFUSED, and that is a v1 line rather than a
// permanent one: unpacking an archive a stranger chose is zip-slip and
// zip-bomb territory, with its own budget and its own tests.
const ZIPONLY = `<span class='license-name'>CC0</span>
<div class="field-name-field-art-files">
  <a href="https://opengameart.org/sites/default/files/Free%20Music%20Pack.zip">pack.zip</a>
</div>`;
const zip = resolveAsset('https://opengameart.org/content/free-music-pack', ZIPONLY);
eq(zip.ok, false, 'a submission offering only a .zip yields nothing');
ck(/no downloadable file/.test(zip.reason), `and says why: ${zip.reason}`);

// A page whose licence we refuse yields nothing, even though the file is right
// there — the refusal is about terms, not about parsing.
const SHAREALIKE = OGA.replace(">CC0<", ">CC-BY-SA 3.0<");
const sa = resolveAsset('https://opengameart.org/content/a-platformer-in-the-forest', SHAREALIKE);
eq(sa.ok, false, 'a share-alike submission is refused despite having usable files');
ck(/allowlist/.test(sa.reason), `and names the reason: ${sa.reason}`);

// --- looksLike: the extension is a claim, the bytes are the fact ------------
const bytes = (...b) => new Uint8Array(b);
ck(looksLike('glb', bytes(0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0)), 'a real glTF header');
ck(looksLike('png', bytes(0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10)), 'a real PNG header');
ck(looksLike('ogg', bytes(0x4f, 0x67, 0x67, 0x53)), 'a real Ogg header');
// THE CASE THIS EXISTS FOR. A redirect to a login wall, a rate-limit notice and
// an error page all arrive as 200s full of HTML. Without this the page gets a
// file called robot.glb containing "<!doctype html>" and a scene that silently
// never renders — which reads as the agent having failed.
ck(!looksLike('glb', new TextEncoder().encode('<!doctype html><html>')),
   'an HTML error page is not a model, whatever the URL ended in');
ck(!looksLike('png', new TextEncoder().encode('{"error":"rate limited"}')), 'nor JSON a PNG');
ck(!looksLike('exe', bytes(0x4d, 0x5a)), 'an extension with no signature is never accepted');
ck(!looksLike('glb', bytes()), 'empty bytes');
ck(!looksLike('glb', null), 'no bytes at all, without throwing');

// --- safeName: the filename comes off a stranger's page ---------------------
eq(safeName('Robot', 'glb'), 'robot.glb', 'the ordinary case');
eq(safeName('../../etc/passwd', 'png'), 'etc-passwd.png', 'no traversal survives');
eq(safeName('a/b\\c', 'png'), 'a-b-c.png', 'no separators survive');
eq(safeName('.bashrc', 'png'), 'bashrc.png', 'no leading dot');
eq(safeName('Café Números', 'png'), 'cafe-numeros.png', 'accents fold');
eq(safeName('', 'glb', 0), 'asset-1.glb', 'an empty title still gets a name');
eq(safeName('日本語', 'png', 2), 'asset-3.png', 'a title with nothing to slug');
ck(safeName('x'.repeat(200), 'png').length <= 45, 'and it is bounded');

console.log(fail ? `✗ asset-sources: ${fail} failed, ${pass} passed` : `✓ asset-sources — ${pass} passed`);
process.exit(fail ? 1 : 0);
