import fs from 'node:fs'; import vm from 'node:vm';
const ctx = { URLSearchParams, Map, Set, Math, Promise, Date, console }; ctx.globalThis = ctx; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[2], 'utf8'), ctx); const DG = ctx.DG;
const g = JSON.parse(fs.readFileSync(process.argv[3])).graph, N = g.nodes.length, short = (h) => h.replace('.delve.town', '');
const part = {};
for (const [m, s] of [['follow'], ['talk', 'count']]) { const c = DG.communities(N, DG.weightedEdges(g, m, s), { runs: 30, nulls: 0 }); part[m] = c.comm;
  const by = {}; c.comm.forEach((k, i) => k >= 0 && (by[k] ??= []).push(i));
  console.log('==', m); for (const k in by) console.log(k, by[k].length, by[k].map((i) => short(g.nodes[i].handle) + (g.nodes[i].bot ? '*' : '')).slice(0, 14).join(' ')); }
// agreement: adjusted pair counting (Rand index on nodes in both)
let same = 0, agree = 0, tot = 0; const ids = [...Array(N).keys()].filter((i) => part.follow[i] >= 0 && part.talk[i] >= 0);
for (const i of ids) for (const j of ids) if (i < j) { tot++; const a = part.follow[i] === part.follow[j], b = part.talk[i] === part.talk[j]; if (a === b) agree++; if (a && b) same++; }
console.log('nodes in both', ids.length, 'Rand', (agree / tot).toFixed(3), 'pairs together in both', same);
const bots = g.nodes.filter((n) => n.bot).length; const talkB = g.interactions.filter(([a, b]) => g.nodes[a].bot && g.nodes[b].bot).reduce((s, x) => s + x[2], 0), all = g.interactions.reduce((s, x) => s + x[2], 0);
console.log('bots', bots, '/', N, 'interactions bot->bot', talkB, '/', all);
