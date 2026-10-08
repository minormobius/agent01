// node research/garden/browser-stub.mjs <out.html>: www/garden/index.html with fetch() answered by a fake town of 5 plants
// (headless Chromium here has no network). Serve www/ on :8766 and open out.html through it.
import fs from 'node:fs';
const page = fs.readFileSync(new URL('../../www/garden/index.html', import.meta.url), 'utf8');
const stub = `<base href="http://localhost:8766/garden/"><script>
const H = (h) => new Date(Date.now() - h * 36e5).toISOString();
const R = { 'did:a': [{}, { createdAt: H(30) }, { createdAt: H(55) }, { createdAt: H(80) }],
  'did:b': [{ plant: 'a.delve.town', note: 'little water for you' }, { plant: 'nobody.delve.town' }],
  'did:c': Array.from({ length: 16 }, (_, i) => ({ createdAt: H(2 + 24 * i) })),
  'did:d': Array.from({ length: 9 }, (_, i) => ({ createdAt: H(100 + 24 * i) })), 'did:e': [] };
const _f = window.fetch.bind(window);
window.fetch = async (u, o) => { u = String(u); if (!/^https:/.test(u)) return _f(u, o);
  const ok = (b) => new Response(JSON.stringify(b), { status: 200 }); const url = new URL(u);
  if (u.includes('listRepos')) return ok({ repos: Object.keys(R).map((did) => ({ did })) });
  if (u.includes('listRecords')) { const d = url.searchParams.get('repo'); return ok({ records: R[d].map((v, i) => ({ uri: 'at://' + d + '/x/' + i, value: { createdAt: H(1), ...v } })) }); }
  if (u.includes('getProfiles')) return ok({ profiles: url.searchParams.getAll('actors').filter((a) => !a.startsWith('nobody')).map((a) => { const k = a.replace('did:', '').replace('.delve.town', ''); return { did: 'did:' + k, handle: k + '.delve.town' }; }) });
  return new Response('{}', { status: 404 }); };
</script>`;
fs.writeFileSync(process.argv[2], page.replace('<meta charset="utf-8">', '<meta charset="utf-8">' + stub));
