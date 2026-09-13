#!/usr/bin/env node
// report.selftest.mjs — the assembly report by its contents: the parts list it
// counts, the steps it reads off the document (and what it refuses to invent),
// the exploded view actually separating parts that touch, the links it writes,
// and that one document gives one page, byte for byte.
import fs from 'node:fs';
import path from 'node:path';
import { assemblyReport, assemblySteps, explodeBodies, b64url } from './lib/report.js';
import { flatten, solveAngles, modelOf } from './lib/assembly.js';
import { clearances, posedTriangles } from './lib/proximity.js';
import { kernels, facesOf, benchRef, ROOT } from './agent/common.mjs';

let fails = 0;
const check = (ok, msg) => { console.log(`${ok ? '✓' : '✗'} ${msg}`); if (!ok) fails++; };
const bench = (n) => JSON.parse(fs.readFileSync(path.join(ROOT, 'bench', `${n}.json`), 'utf8'));
const { engine } = await kernels();

async function load(name, t = 0) {
  const doc = bench(name);
  const { components, mates, drive, partTrees, fits } = await flatten(doc, benchRef, { facesOf });
  const angles = solveAngles(components, mates, drive, t);
  const builds = new Map();
  for (const [key, tree] of partTrees) { const r = engine.build(tree, { kernel: 'truck' }); builds.set(key, { mesh: r.mesh, faces: r.report.faces, invariants: r.report.invariants }); }
  return { doc, components, mates, drive, partTrees, fits, angles, builds, t };
}

// 1. the lift: a page that counts what is there and links where it came from
const lift = await load('lift', 0.5);
const rep = assemblyReport({ ...lift, modelOf, title: 'lift' });
{
  check(rep.components === 7 && rep.bom.length === 4 && rep.bom.find((r) => r.part === 'bolt').qty === 4 && rep.bom.find((r) => r.part === 'bolt').ids.length === 4, `the parts list: ${rep.bom.map((r) => `${r.qty}× ${r.part}`).join(', ')}`);
  check(rep.bom[0].item === 1 && rep.bom.every((r, i) => r.item === i + 1 && r.volume > 0), 'every item is numbered and carries its volume');
  const svgs = (rep.html.match(/<svg/g) || []).length;
  check(svgs === 2 + rep.sheets && rep.sheets === 4 && rep.html.includes('id="exploded"') && rep.html.includes('class="balloon"'), `one page holds the assembly, the exploded view with balloons and ${rep.sheets} part sheets (${svgs} drawings, ${(rep.bytes / 1024).toFixed(0)} kB)`);
  const link = `https://cad.mino.mobi/#t=${b64url(lift.partTrees.get(rep.bom[0].partKey))}`;
  check(rep.html.includes(link) && rep.html.includes('#item-4') && rep.html.includes('open the assembly in the viewer'), 'each part links into the viewer by its own tree, and the item links into its sheet');
  const again = assemblyReport({ ...lift, modelOf, title: 'lift' });
  check(again.html === rep.html, 'the same document gives the same page, byte for byte');
}

// 2. the steps say what the document says — and nothing else
{
  const s = rep.steps;
  check(s.length === 4 && s.map((x) => x.id).join() === 'screw,nut,platform,bolt[0…3]', `four steps, the repeat collapsed into one: ${s.map((x) => x.id).join(', ')}`);
  check(s[0].lines.some((l) => /is the base/.test(l)) && s[0].lines.some((l) => /driven component — 60 rpm/.test(l)), 'the first step names the base and the drive');
  check(s[1].lines.some((l) => l === 'rides `screw` as a nut — 2 mm of travel per turn of `screw`') && s[1].lines.some((l) => /clearance of 0.05–0.15 mm to `screw`/.test(l)), `the nut's step carries the mate's own number and the declared fit: ${s[1].lines[1]}`);
  check(s[2].lines.some((l) => l === 'is fixed to `nut` — it turns and travels with it'), 'a fixed mate reads as one');
  check(s[3].qty === 4 && s[3].lines.some((l) => /each sits on `platform`'s `pivot\[0\]`, `pivot\[1\]`/.test(l) && /no mate of their own/.test(l)), 'the four bolts are one step, on the four faces they name');
  const words = JSON.stringify(s);
  check(!/tighten|torque|screwdriver|carefully|should|recommend/i.test(words), 'no step invents an instruction the document does not state');
}

// 3. gear and belt ratios come from the mate, in both directions
{
  const train = await load('train');
  const steps = assemblySteps(train);
  const gear = steps.flatMap((s) => s.lines).filter((l) => /meshes with/.test(l));
  check(gear.length >= 2 && gear.every((l) => /\d+ teeth to \d+, so it turns [\d.]+× per turn of `[^`]+`, the other way/.test(l)), `a gear mate states its own ratio: ${gear[0]}`);
}

// 4. the exploded view really separates parts that touch
{
  const bodies = lift.components.filter((c) => !c.reference).map((c) => ({ id: c.id, mesh: lift.builds.get(c.partKey).mesh, model: modelOf(c, lift.angles) }));
  const near = (bs) => clearances(bs).pairs.filter((p) => p.touching || p.penetration > 0 || p.distance < 0.2).length;
  const before = near(bodies), after = near(explodeBodies(bodies, 0.6));
  check(before > 0 && after === 0, `assembled, ${before} pairs touch or nearly touch; exploded, ${after} do`);
  const moved = explodeBodies(bodies, 0.6);
  check(moved.every((b, i) => Math.hypot(...b.displaced) > 0) && moved.length === bodies.length, 'every body moves, none is left behind');
  const nut = moved.find((b) => b.id === 'nut'), plat = moved.find((b) => b.id === 'platform');
  check(Math.abs(nut.centre[2] - plat.centre[2]) > Math.abs(bodies.find((b) => b.id === 'nut').model[14] - bodies.find((b) => b.id === 'platform').model[14]), 'parts stacked on one axis separate from each other, not just from the middle');
}

// 5. a part this kernel cannot build is named on the page, not dropped
{
  const key = [...lift.partTrees.keys()].find((k) => k.startsWith('bolt'));
  const builds = new Map(lift.builds); builds.delete(key);
  const r = assemblyReport({ ...lift, builds, modelOf, title: 'lift', unbuilt: [{ partKey: key, part: 'bolt', error: 'head: boolean union failed', tree: lift.partTrees.get(key) }] });
  check(r.components === 3 && r.missing.length === 1 && r.missing[0].qty === 4 && r.html.includes('4 bolts are missing') === false && /1 part is missing from every drawing/.test(r.html) && r.html.includes('head: boolean union failed'), `a part the kernel cannot build is listed with its error and left out of the drawings (${r.components} components drawn, ${r.missing[0].qty} instances missing)`);
}

// 6. a document with nothing built is refused, not drawn empty
{
  let err = '';
  try { assemblyReport({ ...lift, builds: new Map(), modelOf, title: 'lift' }); } catch (e) { err = e.message; }
  check(/no component has an exact build/.test(err), `an unbuildable assembly is refused: ${err}`);
}

console.log(fails ? `\n✗ ${fails} failing` : '\n✓ report selftest passed');
process.exit(fails ? 1 : 0);
