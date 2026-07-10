// node rite/org/engine.selftest.mjs
// Gates: determinism, structural soundness of the bounded tree, the node
// budget, the infinite (wrapping) node lens across every vertical × shape, and
// error paths. Run before touching engine.js.

import { generateOrg, expandOrgNode, catalog, VERTICALS, SHAPES } from './engine.js';

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

console.log('— flavor smoke (eyeball these) —');
for (const [vertical, shape] of [['corp', 'pyramid'], ['military', 'tall'], ['feudal', 'pyramid'], ['crime', 'cellular'], ['academic', 'flat'], ['ecclesiastic', 'pyramid'], ['monastic', 'pyramid'], ['startup', 'flat']]) {
  const o = generateOrg({ seed: 'taste', vertical, shape, depth: 3, maxNodes: 60 });
  const sample = [];
  walk(o.root, (n, d) => { if (sample.length < 5) sample.push(`${'  '.repeat(d)}${n.name} — ${n.title}`); });
  console.log(`\n  ${o.orgName} [${vertical}/${shape}]`);
  for (const s of sample) console.log('  ' + s);
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
