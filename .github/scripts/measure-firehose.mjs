/**
 * Measure the real cost of a browser-side rule feed.
 *
 * Runs the SHIPPED preset from bsky/lib/rulefeed.js against the live Jetstream
 * tail, so the numbers are the ones a reader would actually see rather than an
 * estimate. Reports rate, bandwidth, match rate, and what the rule caught and
 * dropped — the dropped sample matters as much, because a subtractive feed is
 * judged by what it removes.
 */
import { JetstreamClient, KIND } from '../../packages/atproto/jetstream.js';
import { compile, PRESETS } from '../../bsky/lib/rulefeed.js';

const SECS = Math.min(300, Math.max(10, Number(process.env.SECONDS_TO_SAMPLE) || 60));
const COLLECTIONS = (process.env.COLLECTIONS || 'app.bsky.feed.post').split(',').map((s) => s.trim());
const rule = PRESETS[0];
const m = compile(rule);

let events = 0, posts = 0, matched = 0, bytes = 0, vetoed = 0;
const kept = [], dropped = [];
const reasons = new Map();

const js = new JetstreamClient({
  collections: COLLECTIONS,
  kinds: [KIND.commit ?? KIND.COMMIT],
  onEvent: (p) => {
    events++;
    bytes += JSON.stringify(p).length;
    if (p.collection !== 'app.bsky.feed.post') return;
    if (p.operation && p.operation !== 'create') return;
    const rec = p.record;
    if (!rec || typeof rec.text !== 'string') return;
    posts++;
    const hits = m.why(rec);
    if (hits.length) {
      matched++;
      for (const h of hits) reasons.set(h.split(' ')[0], (reasons.get(h.split(' ')[0]) || 0) + 1);
      if (kept.length < 12) kept.push({ text: rec.text.replace(/\s+/g, ' ').slice(0, 130), hits });
    } else if (/\b(paper|preprint|study|arxiv|published|journal|doi)\b/i.test(rec.text)) {
      // Near-misses: posts that LOOK academic but the rule rejected. This is
      // where an over-aggressive exclusion list shows up.
      vetoed++;
      if (dropped.length < 12) dropped.push(rec.text.replace(/\s+/g, ' ').slice(0, 130));
    }
  },
  onConnect: () => console.log(`connected · sampling ${SECS}s of ${COLLECTIONS.join(', ')}\n`),
  onError: (e) => console.log('socket error:', e?.message || e),
});

const t0 = Date.now();
await js.connect();
await new Promise((r) => setTimeout(r, SECS * 1000));
js.close();
const secs = (Date.now() - t0) / 1000;

const n = (x) => x.toLocaleString();
console.log('═══ what the firehose costs ═══');
console.log(`  window            ${secs.toFixed(0)}s`);
console.log(`  events            ${n(events)}   ${(events / secs).toFixed(0)}/s`);
console.log(`  posts created     ${n(posts)}   ${(posts / secs).toFixed(0)}/s`);
console.log(`  wire bytes        ${(bytes / 1048576).toFixed(1)} MB   ${(bytes / secs / 1024).toFixed(0)} KB/s`);
console.log(`  extrapolated      ${(bytes / secs * 3600 / 1073741824).toFixed(2)} GB/hour · `
  + `${(bytes / secs * 86400 / 1073741824).toFixed(1)} GB/day if left running`);

console.log('\n═══ what the rule does with it ═══');
console.log(`  matched           ${n(matched)}  (${(matched / Math.max(posts, 1) * 100).toFixed(2)}% of posts, `
  + `~${(matched / secs * 3600).toFixed(0)}/hour)`);
console.log(`  near-miss dropped ${n(vetoed)}  (looked academic, rule said no)`);
console.log(`  match reasons     ${[...reasons.entries()].sort((a, b) => b[1] - a[1])
  .map(([k, v]) => `${k}:${v}`).join('  ') || '(none)'}`);

console.log('\n═══ KEPT ═══');
for (const k of kept) console.log(`  · ${k.text}\n      ${k.hits.join(', ')}`);
console.log('\n═══ DROPPED but looked academic (check for over-exclusion) ═══');
for (const d of dropped) console.log(`  · ${d}`);

if (!events) {
  console.log('\nNo events at all — the socket never delivered. That is a connection');
  console.log('problem, not a rate of zero.');
  process.exit(1);
}
