// build-bingo-bg.mjs — rebuild bingo-bg.tsv, the "what Bluesky usually says"
// background the bingo card's SAYS squares are measured against.
// node only, needs network, run by hand:
//
//   node b/days/build-bingo-bg.mjs            # two firehose slices, ~2 minutes
//
// Replays English posts from Jetstream at two times of day (a single slice is
// one time zone's night), drops exact duplicate texts (bots), caps any one
// author at 5 posts per term, and keeps a term only if enough DIFFERENT authors
// used it: 5 for a word, 8 for a two-word phrase. What ships is aggregate counts
// of common-enough terms, never a post and never anything one person said.
import { writeFileSync } from 'node:fs';
import { terms } from './bingo.js';

const OUT = new URL('./bingo-bg.tsv', import.meta.url);
const SLICES = [[22, 270000], [10, 150000]];        // [hours back, posts]
const MIN_AUTHORS_UNI = 5, MIN_AUTHORS_BI = 8, CAP = 5;

function slice(hoursBack, max, onPost) {
  return new Promise((resolve, reject) => {
    const cursor = (Date.now() - hoursBack * 3600e3) * 1000;
    const ws = new WebSocket(`wss://jetstream2.us-east.bsky.network/subscribe?wantedCollections=app.bsky.feed.post&cursor=${cursor}`);
    let n = 0;
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.commit?.operation !== 'create') return;
      const r = m.commit.record || {};
      if ((r.langs || []).length !== 1 || r.langs[0] !== 'en' || !r.text) return;
      onPost(m.did, r.text);
      if (++n >= max || m.time_us / 1000 > Date.now() - 60e3) { ws.close(); }
    };
    ws.onerror = (e) => reject(new Error(e.message || 'jetstream error'));
    ws.onclose = () => resolve(n);
  });
}

const seen = new Set(), df = new Map(), authors = new Map();
let posts = 0;
for (const [h, max] of SLICES) {
  const got = await slice(h, max, (did, text) => {
    const key = text.trim().toLowerCase();
    if (seen.has(key)) return;
    seen.add(key); posts++;
    for (const w of terms(text)) {
      let a = authors.get(w);
      if (!a) authors.set(w, a = new Map());
      const k = a.get(did) || 0;
      if (k >= CAP) continue;
      a.set(did, k + 1);
      df.set(w, (df.get(w) || 0) + 1);
    }
  });
  console.log(`slice ${h}h back: ${got} posts`);
}
const rows = [];
for (const [w, c] of df) if (authors.get(w).size >= (w.includes(' ') ? MIN_AUTHORS_BI : MIN_AUTHORS_UNI)) rows.push([w, c]);
rows.sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
const floor = Math.min(...rows.map((r) => r[1]));
writeFileSync(OUT, `#bingo-bg\tposts=${posts}\tfloor=${floor}\tminAuthors=${MIN_AUTHORS_UNI}/${MIN_AUTHORS_BI}\tcap=${CAP}\n` + rows.map((r) => r.join('\t')).join('\n') + '\n');
console.log(`${posts} posts → ${rows.length} terms, floor ${floor}`);
