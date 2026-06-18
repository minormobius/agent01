// spine.selftest.mjs — pins the chunk↔content embeddings-match (hoop/story/spine.js): the deterministic
// lexical embedder, cosine, descriptors, thickness, and the brute-force kNN retrieval. The neural
// embedder is injected in production; here we prove the pure fallback works AND that any embedder slots in.
// Run: node hoop/test/spine.selftest.mjs
import {
  lexicalEmbed, cosine, tokenize, chunkDescriptor, contentDescriptor, thicknessGap, buildIndex, match, EMBED_DIM,
} from '../story/spine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const approx = (a, b, e = 1e-9) => Math.abs(a - b) < e;

// ── lexical embedder: deterministic, normalized, dimensioned ──
{
  const v = lexicalEmbed('the rind-walker salvages metal in the margin');
  ok(v.length === EMBED_DIM, 'embed vector has EMBED_DIM dims');
  ok(approx(Math.sqrt(v.reduce((s, x) => s + x * x, 0)), 1, 1e-9), 'embed vector is L2-normalized');
  ok(JSON.stringify(lexicalEmbed('a b c')) === JSON.stringify(lexicalEmbed('a b c')), 'embed is deterministic');
  ok(tokenize('The, the THE a of rind').join() === 'rind', 'tokenize lowercases + drops stopwords/short tokens');
}

// ── cosine: identical → 1, orthogonal-ish < related ──
{
  ok(approx(cosine(lexicalEmbed('rind salvage'), lexicalEmbed('rind salvage')), 1), 'cosine of identical text is 1');
  const near = cosine(lexicalEmbed('rind salvage metal'), lexicalEmbed('rind salvage hull'));
  const far = cosine(lexicalEmbed('rind salvage metal'), lexicalEmbed('garden bloom petal'));
  ok(near > far, 'overlapping text scores higher than disjoint text');
}

// ── descriptors + thickness ──
{
  const thin = { roles: { mend: 1 }, factions: { drift: 1 } };
  const thick = { roles: { mend: 3, grow: 2, govern: 1 }, domains: { metal: 2, food: 1 }, factions: { drift: 2, continuant: 1 }, motifs: ['salvage'], bridges: 0.2, thirdPlaces: 3, tier: 'Healthy' };
  const dThin = chunkDescriptor(thin), dThick = chunkDescriptor(thick);
  ok(dThick.thickness > dThin.thickness, 'a richer building/civ profile yields higher thickness');
  ok(dThick.text.split(/\s+/).filter((t) => t === 'mend').length === 3, 'weighted: a role repeats by its weight so the embedder weights it');
  ok(dThick.roles[0] === 'mend' && dThick.roles.length === 3, 'topKeys are weight-sorted');

  const npc = { type: 'npc', revelation_tier: 3, tags: ['drift', 'broker'], content: { name: 'Olo', description: 'a broker', dialogue: { nodes: { a: {}, b: {}, c: {} } } } };
  const lore = { type: 'lore_fragment', revelation_tier: 1, tags: ['rind'], content: { name: 'Mark', description: 'a stencil' } };
  ok(contentDescriptor(npc).thickness > contentDescriptor(lore).thickness, 'an NPC with a dialogue tree is thicker than a one-line lore fragment');
}

// ── thicknessGap: arc thinner than the chunk ⇒ positive (generate more) ──
ok(thicknessGap(6, 2) > 0, 'a thin arc on a thick chunk has a positive thickness gap');
ok(thicknessGap(3, 3) === 0, 'an arc that matches the chunk has zero gap');
ok(thicknessGap(5, 5, 0.8) === 0, 'the 0.8 ratio tolerates an exactly-matched arc');

// ── retrieval: build an index, match a chunk, best-first ──
{
  const corpus = [
    { id: 'rind-npc', type: 'npc', revelation_tier: 2, tags: ['rindwalker', 'salvage'], content: { name: 'Sevin', description: 'a hull navigator who salvages metal in the rind margin', dialogue: { nodes: { a: {}, b: {} } } } },
    { id: 'garden-lore', type: 'lore_fragment', revelation_tier: 1, tags: ['greendeck', 'grow'], content: { name: 'Bloom', description: 'the green deck gardens bloom under the sun-strip' } },
    { id: 'drift-npc', type: 'npc', revelation_tier: 1, tags: ['drift', 'broker'], content: { name: 'Olo', description: 'a drift broker who trades information on the braid' } },
  ];
  const profile = { roles: { salvage: 3, mend: 1 }, domains: { metal: 2 }, factions: { rindwalker: 2 }, motifs: ['hull', 'margin'] };

  await (async () => {
    const index = await buildIndex(corpus);   // default = lexicalEmbed (no network)
    ok(index.entries.length === 3, 'index embeds every corpus item');
    const res = await match(profile, index, undefined, { k: 2 });
    ok(res.candidates.length === 2, 'k caps the candidate list');
    ok(res.candidates[0].item.id === 'rind-npc', 'the rind/salvage chunk retrieves the rind-walker, not the garden');
    ok(res.candidates[0].score >= res.candidates[1].score, 'candidates are sorted best-first');
    ok(typeof res.chunkThickness === 'number' && res.candidates[0].thicknessGap >= 0, 'match reports chunk thickness + per-candidate gap');

    // an injected (fake "neural") embedder slots in with no shape change
    const fakeEmbed = async (t) => { const v = lexicalEmbed(t, 32); return v; };   // different dim, still works
    const index2 = await buildIndex(corpus, fakeEmbed);
    const res2 = await match(profile, index2, fakeEmbed, { k: 1 });
    ok(res2.candidates[0].item.id === 'rind-npc', 'an injected embedder produces the same top match (interface holds)');

    console.log(`spine.selftest: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  })();
}
