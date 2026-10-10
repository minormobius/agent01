// delve-graph/lib.js: live crawl of either world (Delvetown or Bluesky) and weighted community detection.
// No DOM here, so node can test it: globalThis.DG.
(function (G) {
  'use strict';

  // ---- worlds ----------------------------------------------------------------------------------
  const WORLDS = {
    delve: { base: 'https://api.delve.town/xrpc/town.delve.', name: 'Delvetown', seedPages: 10, followPages: 5, maxDepth1: 400, twoHop: true },
    bsky: { base: 'https://public.api.bsky.app/xrpc/app.bsky.', name: 'Bluesky', seedPages: 2, followPages: 3, maxDepth1: 120, twoHop: false },
  };
  // a typed handle with no pick from the list: *.delve.town is Delvetown, anything else Bluesky
  const worldOf = (h) => (/\.delve\.town$/i.test(String(h).trim()) ? 'delve' : 'bsky');
  const didOfUri = (u) => { const m = /^at:\/\/(did:[^/]+)/.exec(u || ''); return m ? m[1] : null; };
  const isBot = (p) => (p.labels || []).some((l) => l.val === 'bot');

  // who one feed item points at: [kind, did]. Replies (to the parent's author), mentions, quotes, reposts.
  function targetsOf(item, self) {
    const out = [];
    const p = item.post || {}, r = p.record || {};
    if (item.reason && /repost/i.test(item.reason.$type || '')) {
      if (p.author && p.author.did !== self) out.push(['repost', p.author.did]);
      return out; // a repost is someone else's post: its replies and mentions aren't ours
    }
    if (p.author && p.author.did && p.author.did !== self) return out; // not authored by this account
    const par = r.reply && r.reply.parent && didOfUri(r.reply.parent.uri);
    if (par && par !== self) out.push(['reply', par]);
    for (const f of r.facets || []) for (const ft of f.features || []) if (/mention/i.test(ft.$type || '') && ft.did && ft.did !== self) out.push(['mention', ft.did]);
    const e = r.embed || {};
    const q = didOfUri((e.record && (e.record.uri || (e.record.record && e.record.record.uri))) || '');
    if (q && q !== self && /record/i.test(e.$type || '')) out.push(['quote', q]);
    return out;
  }

  // ---- crawl -----------------------------------------------------------------------------------
  // fetchJson(url) -> object (injected so tests can stub it). onStep(text) for progress.
  async function crawl(seed, world, { fetchJson, onStep = () => {}, conc = 6, feeds = true } = {}) {
    const W = WORLDS[world]; let reads = 0;
    const get = async (path, q) => { reads++; return fetchJson(W.base + path + '?' + new URLSearchParams(q)); };
    async function follows(actor, pages) {
      const all = []; let cursor, complete = false;
      for (let k = 0; k < pages; k++) {
        const d = await get('graph.getFollows', cursor ? { actor, limit: 100, cursor } : { actor, limit: 100 });
        all.push(...(d.follows || [])); cursor = d.cursor;
        if (!cursor || !(d.follows || []).length) { complete = true; break; }
      }
      return { list: all, complete };
    }
    async function pool(items, f) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, items.length) }, async () => { while (i < items.length) { const it = items[i++]; try { await f(it); } catch (e) { it.err = String(e.message || e); } } })); }

    onStep('reading ' + seed);
    const sp = await get('actor.getProfile', { actor: seed });
    const nodes = [], byDid = new Map();
    const add = (p, depth) => { let n = byDid.get(p.did); if (n) return n; n = { did: p.did, handle: p.handle, avatar: p.avatar || null, bot: isBot(p), depth, crawled: false, complete: false, out: new Set() }; byDid.set(p.did, n); nodes.push(n); return n; };
    const s = add(sp, 0);
    const f0 = await follows(s.did, W.seedPages);
    s.crawled = true; s.complete = f0.complete;
    const d1 = f0.list.slice(0, W.maxDepth1);
    for (const p of d1) { add(p, 1); s.out.add(p.did); }
    const ring1 = nodes.filter((n) => n.depth === 1);
    let done = 0;
    await pool(ring1, async (n) => {
      const f = await follows(n.did, W.followPages);
      n.crawled = true; n.complete = f.complete;
      for (const p of f.list) { if (!byDid.has(p.did)) { if (!W.twoHop) continue; add(p, 2); } n.out.add(p.did); }
      onStep(`follows ${++done}/${ring1.length}`);
    });
    // interactions: one page (up to 100 items) of each crawled account's own feed
    const inter = new Map(); // "a b" -> {reply, mention, quote, repost}
    let feedsRead = 0;
    if (feeds) {
      const crawled = nodes.filter((n) => n.crawled);
      await pool(crawled, async (n) => {
        const d = await get('feed.getAuthorFeed', { actor: n.did, limit: 100 });
        n.feedItems = (d.feed || []).length;
        for (const it of d.feed || []) for (const [kind, did] of targetsOf(it, n.did)) {
          if (!byDid.has(did)) continue;
          const k = n.did + ' ' + did; const c = inter.get(k) || { reply: 0, mention: 0, quote: 0, repost: 0 }; c[kind]++; inter.set(k, c);
        }
        onStep(`posts ${++feedsRead}/${crawled.length}`);
      });
    }
    return pack(nodes, inter, { seed: s.handle, world, at: new Date().toISOString(), reads, feeds: feeds ? feedsRead : 0, live: true });
  }

  // nodes with out:Set(did) -> index form the page uses
  function pack(nodes, inter, meta) {
    const idx = new Map(nodes.map((n, i) => [n.did, i]));
    const follows = [];
    nodes.forEach((n, i) => { for (const d of n.out) { const j = idx.get(d); if (j !== undefined && j !== i) follows.push([i, j]); } });
    const interactions = [];
    for (const [k, c] of inter || []) { const [a, b] = k.split(' '); const i = idx.get(a), j = idx.get(b); if (i !== undefined && j !== undefined && i !== j) interactions.push([i, j, c.reply + c.mention + c.quote + c.repost, c]); }
    return { ...meta, nodes: nodes.map((n) => ({ did: n.did, handle: n.handle, avatar: n.avatar, bot: n.bot, depth: n.depth, crawled: n.crawled, complete: n.complete, feedItems: n.feedItems ?? null })), follows, interactions };
  }

  // ---- weights ---------------------------------------------------------------------------------
  // mode: 'follow' (mutual follow = 1), 'talk' (interactions either way), 'both' (sum). scale: 'log' or 'count'.
  function weightedEdges(g, mode, scale) {
    const N = g.nodes.length, dir = new Set(g.follows.map(([a, b]) => a * N + b)), w = new Map();
    const addW = (a, b, x) => { if (a === b || !(x > 0)) return; const k = a < b ? a * N + b : b * N + a; w.set(k, (w.get(k) || 0) + x); };
    if (mode !== 'talk') for (const [a, b] of g.follows) if (a < b && dir.has(b * N + a)) addW(a, b, 1);
    if (mode !== 'follow') {
      const t = new Map();
      for (const [a, b, n] of g.interactions || []) { const k = a < b ? a * N + b : b * N + a; t.set(k, (t.get(k) || 0) + n); }
      for (const [k, n] of t) addW(Math.floor(k / N), k % N, scale === 'count' ? n : Math.log2(1 + n));
    }
    return [...w].map(([k, x]) => [Math.floor(k / N), k % N, x]);
  }

  // ---- community detection: weighted Louvain (local moving + aggregation) ------------------------
  function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; }; }

  function modularity(n, edges, comm) {
    let m2 = 0; const tot = new Map(), inn = new Map();
    for (const [a, b, w] of edges) { m2 += 2 * w; tot.set(comm[a], (tot.get(comm[a]) || 0) + w); tot.set(comm[b], (tot.get(comm[b]) || 0) + w); if (comm[a] === comm[b]) inn.set(comm[a], (inn.get(comm[a]) || 0) + 2 * w); }
    if (!m2) return 0;
    let Q = 0; for (const [c, t] of tot) Q += (inn.get(c) || 0) / m2 - (t / m2) ** 2; return Q;
  }

  function louvain(n, edges, rand) {
    let member = Array.from({ length: n }, (_, i) => i); // original node -> current super-node
    let N = n, E = edges.map((e) => e.slice());
    for (let level = 0; level < 20; level++) {
      const adj = Array.from({ length: N }, () => []); const k = new Float64Array(N); let m2 = 0;
      for (const [a, b, w] of E) { if (a === b) { adj[a].push([a, w * 2]); k[a] += 2 * w; m2 += 2 * w; continue; } adj[a].push([b, w]); adj[b].push([a, w]); k[a] += w; k[b] += w; m2 += 2 * w; }
      if (!m2) break;
      const c = Array.from({ length: N }, (_, i) => i), tot = Float64Array.from(k);
      const order = Array.from({ length: N }, (_, i) => i);
      let movedAny = false;
      for (let pass = 0; pass < 50; pass++) {
        for (let i = N - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        let moved = 0;
        for (const i of order) {
          const wTo = new Map(); let self = 0;
          for (const [j, w] of adj[i]) { if (j === i) { self += w; continue; } wTo.set(c[j], (wTo.get(c[j]) || 0) + w); }
          const ci = c[i]; tot[ci] -= k[i];
          let best = ci, gain = (wTo.get(ci) || 0) - (tot[ci] * k[i]) / m2;
          for (const [cc, w] of wTo) { const g2 = w - (tot[cc] * k[i]) / m2; if (g2 > gain + 1e-12) { gain = g2; best = cc; } }
          c[i] = best; tot[best] += k[i]; if (best !== ci) moved++;
        }
        if (!moved) break; movedAny = true;
      }
      if (!movedAny) break;
      const ren = new Map(); for (let i = 0; i < N; i++) if (!ren.has(c[i])) ren.set(c[i], ren.size);
      member = member.map((s) => ren.get(c[s]));
      const agg = new Map();
      for (const [a, b, w] of E) { let x = ren.get(c[a]), y = ren.get(c[b]); if (x > y) [x, y] = [y, x]; const key = x * 1e6 + y; agg.set(key, (agg.get(key) || 0) + w); }
      N = ren.size; E = [...agg].map(([key, w]) => [Math.floor(key / 1e6), key % 1e6, w]);
    }
    return member;
  }

  // degree-preserving rewiring (double-edge swaps); each edge keeps its weight, so strengths are only roughly kept
  function rewire(n, edges, rand) {
    const E = edges.map((e) => e.slice()), has = new Set(E.map(([a, b]) => Math.min(a, b) * n + Math.max(a, b)));
    for (let t = 0; t < E.length * 10; t++) {
      const i = Math.floor(rand() * E.length), j = Math.floor(rand() * E.length); if (i === j) continue;
      const [a, b] = E[i], [c, d] = E[j];
      if (a === d || c === b || a === c || b === d) continue;
      const k1 = Math.min(a, d) * n + Math.max(a, d), k2 = Math.min(c, b) * n + Math.max(c, b);
      if (has.has(k1) || has.has(k2)) continue;
      has.delete(Math.min(a, b) * n + Math.max(a, b)); has.delete(Math.min(c, d) * n + Math.max(c, d)); has.add(k1); has.add(k2);
      E[i] = [a, d, E[i][2]]; E[j] = [c, b, E[j][2]];
    }
    return E;
  }

  // the null for a weighting: mutual follows rewired keeping each account's degree; interactions re-paired keeping
  // each account's total (a configuration model on single interactions: same volume per account, partners shuffled)
  function nullFor(g, mode, scale) {
    const N = g.nodes.length;
    return (rand) => {
      const h = { nodes: g.nodes, follows: [], interactions: [] };
      if (mode !== 'talk') for (const [a, b] of rewire(N, weightedEdges(g, 'follow'), rand)) h.follows.push([a, b], [b, a]);
      if (mode !== 'follow') {
        const stubs = []; for (const [a, b, k] of g.interactions || []) for (let t = 0; t < k; t++) stubs.push(a, b);
        for (let i = stubs.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [stubs[i], stubs[j]] = [stubs[j], stubs[i]]; }
        for (let i = 0; i + 1 < stubs.length; i += 2) if (stubs[i] !== stubs[i + 1]) h.interactions.push([stubs[i], stubs[i + 1], 1]);
      }
      return weightedEdges(h, mode, scale);
    };
  }

  // best of `runs` Louvain runs, renumbered by size (largest = 0); nodes with no edge get -1. Then a null.
  function communities(n, edges, { runs = 30, nulls = 10, nullRuns = 5, seed = 1, nullEdges = null } = {}) {
    const rand = rng(seed); const qs = []; let best = null, bestQ = -1;
    for (let r = 0; r < runs; r++) { const m = louvain(n, edges, rand); const q = modularity(n, edges, m); qs.push(q); if (q > bestQ) { bestQ = q; best = m; } }
    const deg = new Array(n).fill(0); for (const [a, b] of edges) { deg[a]++; deg[b]++; }
    const size = new Map(); if (best) best.forEach((c, i) => deg[i] && size.set(c, (size.get(c) || 0) + 1));
    const rank = new Map([...size].sort((x, y) => y[1] - x[1]).map(([c], i) => [c, i]));
    const comm = best ? best.map((c, i) => (deg[i] ? rank.get(c) : -1)) : new Array(n).fill(-1);
    const nullQ = [];
    const mkNull = nullEdges || ((r) => rewire(n, edges, r));
    for (let t = 0; t < nulls && edges.length > 3; t++) { const E2 = mkNull(rand); let mq = -1; for (let r = 0; r < nullRuns; r++) mq = Math.max(mq, modularity(n, E2, louvain(n, E2, rand))); nullQ.push(mq); }
    qs.sort((a, b) => a - b);
    return { comm, Q: { best: bestQ, median: qs[Math.floor(qs.length / 2)] ?? 0 }, nullMax: nullQ.length ? Math.max(...nullQ) : null, nullMedian: nullQ.length ? nullQ.sort((a, b) => a - b)[Math.floor(nullQ.length / 2)] : null, edges: edges.length, isolated: comm.filter((c) => c < 0).length, groups: rank.size };
  }

  // snapshot data.json (the morning crawl) -> the same shape a live crawl gives
  function fromSnapshot(D) {
    const nodes = D.nodes.map((x) => ({ did: x[0], handle: x[1], avatar: null, bot: !!x[2], depth: x[3], crawled: !!x[4], complete: true, feedItems: null }));
    const follows = []; for (let k = 0; k < D.edges.length; k += 2) if (D.edges[k] !== D.edges[k + 1]) follows.push([D.edges[k], D.edges[k + 1]]);
    return { seed: D.seed, world: 'delve', at: D.at, reads: D.reads, feeds: 0, live: false, nodes, follows, interactions: [] };
  }

  G.DG = { WORLDS, worldOf, targetsOf, crawl, pack, weightedEdges, modularity, louvain, rewire, communities, nullFor, fromSnapshot, rng, didOfUri };
})(typeof globalThis !== 'undefined' ? globalThis : window);
