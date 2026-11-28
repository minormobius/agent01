// node research/delve-graph/check/browser-stub.mjs <crawl.json> <out.html>: index.html with fetch() answered from an archived crawl
// (headless Chromium here has no network). Serve www/ on :8765 and open out.html through it.
import fs from 'node:fs';
const [crawl, out] = process.argv.slice(2);
const g = JSON.parse(fs.readFileSync(crawl)).graph;
const page = fs.readFileSync(new URL('../../../www/delve-graph/index.html', import.meta.url), 'utf8');
const stub = `<base href="http://localhost:8765/delve-graph/"><script>
window.__G = ${JSON.stringify(g)}; window.__reads = 0;
const _f = window.fetch.bind(window);
window.fetch = async (u, o) => { u = String(u); console.log('STUBFETCH ' + u); if (!/^https:/.test(u)) return _f(u, o); window.__reads++;
  const G = window.__G, url = new URL(u), m = url.pathname.split('.').slice(-2).join('.'), a = url.searchParams.get('actor') || url.searchParams.get('q') || '';
  const find = (x) => G.nodes.findIndex((n) => n.did === x || n.handle === x);
  const prof = (i) => ({ did: G.nodes[i].did, handle: G.nodes[i].handle, labels: G.nodes[i].bot ? [{ val: 'bot' }] : [] });
  const ok = (b) => new Response(JSON.stringify(b), { status: 200, headers: { 'content-type': 'application/json' } });
  await new Promise((s) => setTimeout(s, 5));
  if (m === 'actor.getProfile') { const i = find(a); console.log('STUBPROFILE ' + i + ' ' + JSON.stringify(prof(i))); return i < 0 ? new Response('{}', { status: 400 }) : ok(prof(i)); }
  if (m === 'graph.getFollows') { const i = find(a); return ok({ follows: G.follows.filter(([x]) => x === i).map(([, y]) => prof(y)) }); }
  if (m === 'feed.getAuthorFeed') { const i = find(a), feed = []; for (const [x, y, n] of G.interactions) if (x === i) for (let k = 0; k < n; k++) feed.push({ post: { author: { did: G.nodes[i].did }, record: { reply: { parent: { uri: 'at://' + G.nodes[y].did + '/p/' + k } } } } }); return ok({ feed: feed.slice(0, 100) }); }
  if (m === 'actor.searchActorsTypeahead') return ok({ actors: url.hostname.includes('delve') ? G.nodes.filter((n) => n.handle.startsWith(a)).slice(0, 6).map((n) => ({ did: n.did, handle: n.handle })) : [{ did: 'did:plc:x', handle: a + '.bsky.social' }] });
  if (m === 'actor.getProfiles') return ok({ profiles: [] });
  return new Response('{}', { status: 404 }); };
</script>`;
fs.writeFileSync(out, page.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + stub));
