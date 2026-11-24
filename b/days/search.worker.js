// days/search.worker.js — both search indexes, off the main thread.
//
//   init   { texts }           build the keyword index (≈0.5 s on 52k posts), say
//                              so, then load the Model2Vec model and embed every
//                              post (≈1.4 s on 52k in node), reporting progress
//   query  { id, mode, q, k }  'words' → every BM25 match; 'meaning' → top k by
//                              cosine. Typed arrays come back transferred.
import { buildIndex, search } from './search.js';
import { loadModel, embed, embedAll, scoreAll, topK } from './embed.js';

let kw = null, model = null, sem = null, pending = null;

async function loadSemantic(texts) {
  const t0 = performance.now();
  postMessage({ type: 'semantic-progress', stage: 'model', done: 0, n: texts.length });
  const [bin, vocab] = await Promise.all([
    fetch(new URL('./model/potion-base-8M.bin', import.meta.url)).then((r) => { if (!r.ok) throw new Error('model ' + r.status); return r.arrayBuffer(); }),
    fetch(new URL('./model/potion-base-8M.vocab.txt', import.meta.url)).then((r) => { if (!r.ok) throw new Error('vocab ' + r.status); return r.text(); }),
  ]);
  model = loadModel(bin, vocab);
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
    kw = buildIndex(m.texts);
    postMessage({ type: 'keyword-ready', ms: performance.now() - t0 });
    loadSemantic(m.texts).catch((err) => postMessage({ type: 'semantic-error', message: String(err.message || err) }));
  } else if (m.type === 'query') {
    if (!kw) return;
    answer(m);
  }
};
