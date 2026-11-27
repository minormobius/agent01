// days/search.worker.js — both search indexes, off the main thread.
//
//   init   { texts }           build the keyword index (≈0.5 s on 52k posts), say
//                              so, then load the Model2Vec model and embed every
//                              post (≈1.4 s on 52k in node), reporting progress
//   query  { id, mode, q, k }  'words' → every BM25 match; 'meaning' → top k by
//                              cosine. Typed arrays come back transferred.
//   bingo  { id, seed }        a 5×5 card (bingo.js). The analysis runs once,
//                              ~4 s on 52k posts; a reroll only re-deals.
import { buildIndex, search } from './search.js';
import { loadModel, embed, embedAll, scoreAll, topK } from './embed.js';
import { parseBackground, accountDf, sayings, contentEmbedder, contentIndex, onTopics, deal } from './bingo.js';

let kw = null, model = null, sem = null, pending = null, posts = null, bingoBase = null;
let modelReady = null, modelP = null;   // bingo waits on the model, not on the whole meaning index

async function loadSemantic(texts) {
  const t0 = performance.now();
  postMessage({ type: 'semantic-progress', stage: 'model', done: 0, n: texts.length });
  const [bin, vocab] = await Promise.all([
    fetch(new URL('./model/potion-base-8M.bin', import.meta.url)).then((r) => { if (!r.ok) throw new Error('model ' + r.status); return r.arrayBuffer(); }),
    fetch(new URL('./model/potion-base-8M.vocab.txt', import.meta.url)).then((r) => { if (!r.ok) throw new Error('vocab ' + r.status); return r.text(); }),
  ]);
  model = loadModel(bin, vocab);
  modelReady?.resolve();
  const tModel = performance.now() - t0;
  sem = await embedAll(model, texts, {
    chunk: 2500,
    onProgress: (done, n) => { postMessage({ type: 'semantic-progress', stage: 'embed', done, n }); return new Promise((r) => setTimeout(r, 0)); },
  });
  postMessage({ type: 'semantic-ready', ms: performance.now() - t0, modelMs: tModel });
  if (pending) { const p = pending; pending = null; answer(p); }
}

function answer(m) {
  if (m.mode === 'meaning') {
    if (!sem) { pending = m; return; }                // answered the moment the index is ready
    const q = embed(model, m.q);
    if (!q.some((x) => x !== 0)) { postMessage({ type: 'result', id: m.id, mode: m.mode, ids: new Uint32Array(0), scores: new Float32Array(0), terms: [], empty: true }); return; }
    const scores = scoreAll(sem, q);
    const top = topK(scores, m.k || 250);
    const ids = Uint32Array.from(top), sc = Float32Array.from(top.map((i) => scores[i]));
    postMessage({ type: 'result', id: m.id, mode: m.mode, ids, scores: sc, terms: [] }, [ids.buffer, sc.buffer]);
    return;
  }
  const r = search(kw, m.q);
  postMessage({ type: 'result', id: m.id, mode: m.mode, ids: r.ids, scores: r.scores, terms: r.terms }, [r.ids.buffer, r.scores.buffer]);
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'init') {
    const t0 = performance.now();
    posts = m.texts.map((text, i) => ({ text, t: m.times[i] }));
    bingoBase = null;
    modelP = new Promise((resolve, reject) => { modelReady = { resolve, reject }; });
    modelP.catch(() => {});
    kw = buildIndex(m.texts);
    postMessage({ type: 'keyword-ready', ms: performance.now() - t0 });
    loadSemantic(m.texts).catch((err) => { modelReady?.reject(err); postMessage({ type: 'semantic-error', message: String(err.message || err) }); });
  } else if (m.type === 'query') {
    if (!kw) return;
    answer(m);
  } else if (m.type === 'bingo') {
    bingo(m).catch((err) => postMessage({ type: 'bingo-error', id: m.id, message: String(err.message || err) }));
  }
};

// ── bingo ──────────────────────────────────────────────────────────────────
// Days are the viewer's own calendar, like the grid (a worker shares the page's
// time zone).
const dayOf = (t) => { const d = new Date(t); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); };
const CAP = 3000;
async function bingo(m) {
  const step = (stage) => postMessage({ type: 'bingo-progress', id: m.id, stage });
  if (!bingoBase) {
    const t0 = performance.now();
    step('reading what Bluesky usually says…');
    const bgP = fetch(new URL('./bingo-bg.txt', import.meta.url)).then((r) => { if (!r.ok) throw new Error('background ' + r.status); return r.text(); });
    if (!model) { step('loading the meaning model…'); await modelP; }
    const bg = parseBackground(await bgP);
    step('finding what they say more than anyone…');
    const df = accountDf(posts, dayOf);
    const says = sayings(df, posts.length, bg);
    step('finding what they keep coming back to…');
    await new Promise((r) => setTimeout(r, 0));
    const emb = contentEmbedder(model, bg);
    const cix = contentIndex(emb, posts);
    const on = onTopics(emb, cix, posts, dayOf, df, bg);
    bingoBase = { says, on, ms: performance.now() - t0 };
  }
  const cells = deal(bingoBase.says, bingoBase.on, { seed: m.seed }).map((c) => {
    if (c.kind === 'on') return { kind: 'on', term: c.term, alts: c.alts, posts: c.posts, days: c.days, ids: Uint32Array.from(c.ids.slice(0, CAP)), medoid: c.medoid, centre: !!c.centre };
    if (c.kind === 'says') {
      const r = search(kw, c.term.includes(' ') ? `"${c.term}"` : c.term + ' ');
      return { kind: 'says', term: c.term, ratio: c.ratio, known: c.known, posts: c.posts, days: c.days, ids: r.ids.slice(0, CAP), centre: !!c.centre };
    }
    return { kind: 'free', term: c.term, ids: new Uint32Array(0) };
  });
  postMessage({ type: 'bingo', id: m.id, seed: m.seed, cells, ms: bingoBase.ms, nSays: bingoBase.says.length, nOn: bingoBase.on.length }, cells.map((c) => c.ids.buffer));
}
