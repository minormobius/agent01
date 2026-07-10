// node rite/org/engine.selftest.mjs
// Gates: determinism, structural soundness of the bounded tree, the node
// budget, the infinite (wrapping) node lens across every vertical × shape, and
// error paths. Run before touching engine.js.

import { generateOrg, expandOrgNode, catalog, siteSeed, VERTICALS, SHAPES } from './engine.js';

let failures = 0;
function check(cond, msg) {
  if (cond) { console.log(`  ✓ ${msg}`); }
  else { failures++; console.error(`  ✗ ${msg}`); }
}

// Walk a bounded tree, calling fn(node, depth, parent).
function walk(node, fn, depth = 0, parent = null) {
  fn(node, depth, parent);
  if (node.reports) for (const k of node.reports) walk(k, fn, depth + 1, node);
}

console.log('— determinism —');
{
  const a = generateOrg({ seed: 'tabard', vertical: 'corp', shape: 'pyramid', depth: 4 });
  const b = generateOrg({ seed: 'tabard', vertical: 'corp', shape: 'pyramid', depth: 4 });
  check(JSON.stringify(a) === JSON.stringify(b), 'same seed → byte-identical org');
  const c = generateOrg({ seed: 'tabard2', vertical: 'corp', shape: 'pyramid', depth: 4 });
  check(a.orgName !== c.orgName || a.root.name !== c.root.name, 'different seed → different org');
  const n1 = expandOrgNode({ seed: 'tabard', vertical: 'corp', shape: 'pyramid', id: 'r.2.1' });
  const n2 = expandOrgNode({ seed: 'tabard', vertical: 'corp', shape: 'pyramid', id: 'r.2.1' });
  check(JSON.stringify(n1) === JSON.stringify(n2), 'same node id → byte-identical expansion');
}

console.log('— bounded tree structure —');
{
  const o = generateOrg({ seed: 'struct', vertical: 'corp', shape: 'pyramid', depth: 5 });
  check(o.root.id === 'r' && o.root.rankIdx === 0, 'root is the apex');
  let nodeCount = 0, badRank = 0, badId = 0, maxDepth = 0, dupIds = 0;
  const ids = new Set();
  walk(o.root, (node, depth, parent) => {
    nodeCount++;
    maxDepth = Math.max(maxDepth, depth);
    if (ids.has(node.id)) dupIds++; ids.add(node.id);
    if (parent) {
      // child id extends parent id; child rank is deeper than parent (never wraps in pyramid).
      if (!node.id.startsWith(parent.id + '.')) badId++;
      if (node.rankIdx <= parent.rankIdx) badRank++;
    }
  });
  check(nodeCount === o.nodeCount, `reported nodeCount matches walk (${nodeCount})`);
  check(dupIds === 0, 'all node ids unique');
  check(badId === 0, 'every child id extends its parent id');
  check(badRank === 0, 'pyramid never inverts or repeats a rank downward');
  check(maxDepth <= o.requestedDepth, `depth respected (reached ${maxDepth} ≤ ${o.requestedDepth})`);
}

console.log('— node budget —');
{
  const o = generateOrg({ seed: 'budget', vertical: 'corp', shape: 'wide', depth: 8, maxNodes: 300 });
  check(o.nodeCount <= 300, `node budget honoured (${o.nodeCount} ≤ 300)`);
  check(o.truncatedCount > 0, 'truncation is flagged when the budget bites');
  let hasReports = false;
  walk(o.root, (n) => { if (n.reports && n.reports.length) hasReports = true; });
  check(hasReports, 'still produced a real tree under budget');
}

console.log('— titles + people fill everywhere (every vertical × shape, depth 3) —');
{
  let combos = 0, empties = 0, unfilled = 0, tokenLeaks = 0, nameLeaks = 0;
  for (const vertical of Object.keys(VERTICALS)) {
    for (const shape of Object.keys(SHAPES)) {
      combos++;
      const o = generateOrg({ seed: 'sweep', vertical, shape, depth: 3, maxNodes: 800 });
      if (o.nodeCount < 2) empties++;
      walk(o.root, (n) => {
        if (!n.title || !n.title.trim()) unfilled++;
        if (!n.name || !n.name.trim()) unfilled++;
        if (/[{}]/.test(n.title)) tokenLeaks++;
        if (/undefined|null/.test(n.title) || /undefined/.test(n.name)) nameLeaks++;
      });
    }
  }
  check(empties === 0, `${combos} vertical×shape combos all grow a tree`);
  check(unfilled === 0, 'every node has a non-empty title and name');
  check(tokenLeaks === 0, 'no unexpanded {token} leaks into any title');
  check(nameLeaks === 0, 'no undefined/null leaks into titles or names');
}

console.log('— the infinite lens: wrapping never dead-ends —');
{
  // Drill straight down the 0th report for a long way; every node must expand.
  for (const vertical of Object.keys(VERTICALS)) {
    let id = 'r', ok = true, wrapped = false;
    for (let i = 0; i < 40; i++) {
      const r = expandOrgNode({ seed: 'deep', vertical, shape: 'fractal', id });
      if (!r.reportCount) { ok = false; break; }
      if (r.node.subOrg) wrapped = true;
      id = r.node.reports[0].id;
    }
    check(ok, `${vertical}: 40 levels deep, every node still has reports (infinite)`);
    check(wrapped, `${vertical}: descent wrapped into a shadow sub-org (subOrg flagged)`);
  }
}

console.log('— path reconstruction matches the tree —');
{
  const o = generateOrg({ seed: 'path', vertical: 'academic', shape: 'pyramid', depth: 4 });
  // pick a real deep node from the tree
  let target = o.root;
  while (target.reports && target.reports.length) target = target.reports[Math.floor(target.reports.length / 2)];
  const r = expandOrgNode({ seed: 'path', vertical: 'academic', shape: 'pyramid', id: target.id });
  check(r.node.name === target.name && r.node.title === target.title, `expandNode(${target.id}) reproduces the tree node`);
  check(r.path.length === target.id.split('.').length, `breadcrumb path has the right length (${r.path.length})`);
  check(r.path[0].id === 'r' && r.path[r.path.length - 1].id === target.id, 'path runs root → target');
}

console.log('— matrix dotted lines —');
{
  const o = generateOrg({ seed: 'matrix', vertical: 'corp', shape: 'matrix', depth: 6, maxNodes: 2000 });
  let dotted = 0;
  walk(o.root, (n) => { if (n.dotted) dotted++; });
  check(dotted > 0, `matrix shape produces dotted-line reports (${dotted})`);
  const p = generateOrg({ seed: 'matrix', vertical: 'corp', shape: 'pyramid', depth: 6, maxNodes: 2000 });
  let pd = 0; walk(p.root, (n) => { if (n.dotted) pd++; });
  check(pd === 0, 'non-matrix shapes carry no dotted lines');
}

console.log('— catalog + error paths —');
{
  const cat = catalog();
  check(Object.keys(cat.verticals).length === Object.keys(VERTICALS).length, 'catalog lists all verticals');
  check(Object.keys(cat.shapes).length === Object.keys(SHAPES).length, 'catalog lists all shapes');
  let threw = 0;
  for (const bad of [{ vertical: 'ministry' }, { shape: 'donut' }]) {
    try { generateOrg({ seed: 'x', ...bad }); } catch { threw++; }
  }
  try { expandOrgNode({ seed: 'x', vertical: 'corp', shape: 'pyramid', id: 'r.9999' }); } catch { threw++; }
  try { expandOrgNode({ seed: 'x', vertical: 'corp', shape: 'pyramid', id: 'nonsense' }); } catch { threw++; }
  check(threw === 4, 'bad vertical / shape / out-of-range id / malformed id all throw');
  const capped = generateOrg({ seed: 'cap', depth: 99, maxNodes: 99999 });
  check(capped.requestedDepth <= 12 && capped.maxNodes <= 6000, 'depth and maxNodes are capped');
}

console.log('— people: every box has a coherent person —');
{
  const o = generateOrg({ seed: 'people', vertical: 'corp', shape: 'pyramid', depth: 4 });
  let missing = 0, badTriad = 0, badAttr = 0, missingPerf = 0;
  walk(o.root, (n) => {
    if (!n.person) { missing++; return; }
    const tr = n.person.triad;
    if (Math.abs((tr.craft + tr.drive + tr.wit) - 1) > 0.02) badTriad++;
    for (const k of Object.keys(n.person.attrs)) if (n.person.attrs[k] < 1 || n.person.attrs[k] > 100) badAttr++;
    if (!n.perf || typeof n.perf.morale !== 'number' || typeof n.perf.effective !== 'number') missingPerf++;
  });
  check(missing === 0, 'every box carries a person');
  check(badTriad === 0, 'every triad sums to 1');
  check(badAttr === 0, 'every attribute is within 1..100');
  check(missingPerf === 0, 'every box has rolled-up perf (morale + effective)');
  // seniority: apex should out-power a random IC on average competence
  const apex = o.root.person;
  const ics = []; walk(o.root, (n) => { if (!(n.reports && n.reports.length)) ics.push(n.person); });
  const avgIcSkill = ics.reduce((s, p) => s + p.attrs.skill, 0) / ics.length;
  check(apex.power >= 9, `apex is high-power (${apex.power})`);
  check(apex.attrs.judgment >= avgIcSkill - 20, 'leaders lean judgment (wit) vs ICs lean craft');
}

console.log('— determinism of people —');
{
  const a = generateOrg({ seed: 'detp', vertical: 'crime', shape: 'cellular', depth: 4 });
  const b = generateOrg({ seed: 'detp', vertical: 'crime', shape: 'cellular', depth: 4 });
  check(JSON.stringify(a) === JSON.stringify(b), 'same seed → byte-identical people + performance');
  // pick a real deep id from the tree
  let deep = a.root; while (deep.reports && deep.reports.length) deep = deep.reports[0];
  const n1 = expandOrgNode({ seed: 'detp', vertical: 'crime', shape: 'cellular', id: deep.id });
  check(n1.node.person && n1.node.person.cast, `single-node lens carries a person (${n1.node.person.cast})`);
  check(n1.node.reports.every((k) => k.person && k.perf), 'drilled reports carry person + local perf');
}

console.log('— the org performs: shape changes the numbers —');
{
  const base = { seed: 'perf', vertical: 'corp', depth: 5, maxNodes: 2500 };
  const shapes = ['pyramid', 'tall', 'flat', 'wide'].map((shape) => {
    const o = generateOrg({ ...base, shape });
    return { shape, ...o.performance };
  });
  for (const s of shapes) {
    check(s.score >= 0 && s.score <= 100, `${s.shape}: score in range (${s.score} ${s.tier}, eff ${s.efficiency}, morale ${s.avgMorale})`);
    check(['Thriving', 'Healthy', 'Stable', 'Fragile', 'Failing'].includes(s.tier), `${s.shape}: valid tier`);
  }
  // the whole point: same people, different shape → genuinely different performance
  const scores = new Set(shapes.map((s) => s.score));
  check(scores.size > 1, `shapes produce different scores (${shapes.map((s) => s.shape + ':' + s.score).join(', ')})`);
  // wide should overload managers harder than tall
  const wide = shapes.find((s) => s.shape === 'wide'), tall = shapes.find((s) => s.shape === 'tall');
  check(wide.avgSpan > tall.avgSpan, `wide has bigger spans than tall (${wide.avgSpan} vs ${tall.avgSpan})`);
  // highlights present
  const o = generateOrg({ ...base, shape: 'pyramid' });
  check(o.performance.highlights.topPerformer && o.performance.highlights.topPerformer.output > 0, 'names a top performer');
}

console.log('— people can be turned off —');
{
  const o = generateOrg({ seed: 'nop', vertical: 'corp', depth: 3, people: false });
  check(!o.performance, 'people:false skips the performance rollup');
  check(!o.root.person, 'people:false leaves boxes empty');
}

console.log('— siteSeed bridge (mappa) —');
{
  const s1 = siteSeed(42, 'Aldermoor', 137);
  const s2 = siteSeed(42, 'Aldermoor', 137);
  check(s1 === s2 && s1.includes('Aldermoor'), `siteSeed is stable (${s1})`);
  const o = generateOrg({ seed: s1, vertical: 'feudal', shape: 'pyramid', depth: 3 });
  check(o.orgName && o.performance, 'an org sites reproducibly onto a world seed');
}

console.log('— flavor smoke (eyeball these) —');
for (const [vertical, shape] of [['corp', 'pyramid'], ['military', 'tall'], ['feudal', 'pyramid'], ['crime', 'cellular'], ['academic', 'flat'], ['ecclesiastic', 'pyramid'], ['monastic', 'pyramid'], ['startup', 'flat']]) {
  const o = generateOrg({ seed: 'taste', vertical, shape, depth: 3, maxNodes: 60 });
  const sample = [];
  walk(o.root, (n, d) => { if (sample.length < 5) sample.push(`${'  '.repeat(d)}${n.name} — ${n.title}`); });
  console.log(`\n  ${o.orgName} [${vertical}/${shape}]`);
  for (const s of sample) console.log('  ' + s);
}
{
  console.log('\n  — people in the boxes (feudal/pyramid, top of the chart) —');
  const o = generateOrg({ seed: 'court', vertical: 'feudal', shape: 'pyramid', depth: 3, maxNodes: 40 });
  const rows = [];
  walk(o.root, (n, d) => {
    if (rows.length < 6) {
      const p = n.person;
      rows.push(`${'  '.repeat(d)}${n.name} (${n.title}) — ${p.cast}, age ${p.age}, ${p.vocationTag}; skill ${p.attrs.skill} judg ${p.attrs.judgment} · morale ${n.perf.morale}${p.traits[0] ? ' · ' + p.traits[0].label : ''}`);
    }
  });
  for (const r of rows) console.log('  ' + r);
  const perf = o.performance;
  console.log(`  ORG: ${perf.tier} (${perf.score}/100) · ${perf.headcount} people · eff ${perf.efficiency} · morale ${perf.avgMorale} · attrition ${(perf.attritionRate * 100).toFixed(0)}%`);
}
{
  console.log('\n  — same corp, four shapes, how it performs —');
  for (const shape of ['pyramid', 'tall', 'flat', 'wide', 'cellular']) {
    const o = generateOrg({ seed: 'compare', vertical: 'corp', shape, depth: 5, maxNodes: 2500 });
    const p = o.performance;
    console.log(`  ${shape.padEnd(9)} ${p.tier.padEnd(9)} score ${String(p.score).padStart(3)} · eff ${p.efficiency} · morale ${p.avgMorale} · avgSpan ${p.avgSpan} · overloaded ${p.overloadedManagers}/${p.managers} · attrition ${(p.attritionRate * 100).toFixed(0)}%`);
  }
}
{
  console.log('\n  — an infinite descent (corp/fractal, following the 0th report) —');
  let id = 'r';
  for (let i = 0; i < 9; i++) {
    const r = expandOrgNode({ seed: 'abyss', vertical: 'corp', shape: 'fractal', id });
    const tag = r.node.subOrg ? ` [shadow org, stratum ${r.node.stratum}]` : '';
    console.log(`  ${'· '.repeat(i)}${r.node.name} — ${r.node.title}${tag}`);
    id = r.node.reports[0].id;
  }
}

if (failures) { console.error(`\n${failures} FAILURE(S)`); process.exit(1); }
console.log('\nall checks passed');
