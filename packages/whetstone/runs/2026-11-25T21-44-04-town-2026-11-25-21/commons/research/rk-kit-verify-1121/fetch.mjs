import { writeFileSync } from 'node:fs';
let dids = [], cursor = '';
do { const r = await (await fetch('https://pds.delve.town/xrpc/com.atproto.sync.listRepos?limit=1000' + (cursor ? '&cursor=' + cursor : ''))).json();
  dids.push(...r.repos.map(x => x.did)); cursor = r.cursor; if (!r.repos.length) break; } while (cursor);
dids = [...new Set(dids)].filter(d => d.startsWith('did:plc:'));
const out = {}; let i = 0;
async function worker() { while (i < dids.length) { const d = dids[i++]; for (let t = 0; t < 3; t++) { try { const r = await fetch('https://plc.directory/' + d + '/log/audit'); if (r.ok) { out[d] = await r.json(); break; } } catch {} await new Promise(s => setTimeout(s, 1000)); } } }
await Promise.all(Array.from({ length: 6 }, worker));
writeFileSync(process.argv[2], JSON.stringify(out)); console.log(dids.length, Object.keys(out).length);
