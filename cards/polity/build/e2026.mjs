// The November 3, 2026 federal + gubernatorial results, from English Wikipedia,
// where winners are marked {{aye}}. Unmarked races are kept as uncalled with their
// leading candidates. Writes raw/e2026-federal.json. Usage: node e2026.mjs
import fs from 'node:fs';
import path from 'node:path';
const here = path.dirname(new URL(import.meta.url).pathname);
const dir = path.join(here, 'raw', 'e26'); fs.mkdirSync(dir, { recursive: true });
const UA = 'minomobi-polity-builder/0.1 (https://cards.mino.mobi/polity/)';
const ST = { Alabama: 'AL', Alaska: 'AK', Arizona: 'AZ', Arkansas: 'AR', California: 'CA', Colorado: 'CO', Connecticut: 'CT', Delaware: 'DE', Florida: 'FL', Georgia: 'GA', Hawaii: 'HI', Idaho: 'ID', Illinois: 'IL', Indiana: 'IN', Iowa: 'IA', Kansas: 'KS', Kentucky: 'KY', Louisiana: 'LA', Maine: 'ME', Maryland: 'MD', Massachusetts: 'MA', Michigan: 'MI', Minnesota: 'MN', Mississippi: 'MS', Missouri: 'MO', Montana: 'MT', Nebraska: 'NE', Nevada: 'NV', 'New Hampshire': 'NH', 'New Jersey': 'NJ', 'New Mexico': 'NM', 'New York': 'NY', 'North Carolina': 'NC', 'North Dakota': 'ND', Ohio: 'OH', Oklahoma: 'OK', Oregon: 'OR', Pennsylvania: 'PA', 'Rhode Island': 'RI', 'South Carolina': 'SC', 'South Dakota': 'SD', Tennessee: 'TN', Texas: 'TX', Utah: 'UT', Vermont: 'VT', Virginia: 'VA', Washington: 'WA', 'West Virginia': 'WV', Wisconsin: 'WI', Wyoming: 'WY', 'District of Columbia': 'DC', Guam: 'GU', 'Northern Mariana Islands': 'MP', 'U.S. Virgin Islands': 'VI', 'American Samoa': 'AS', 'Puerto Rico': 'PR' };

async function page(title, force) {
  const f = path.join(dir, title.replace(/[^\w.-]+/g, '_') + '.wiki');
  if (!force && fs.existsSync(f) && Date.now() - fs.statSync(f).mtimeMs < 3600e3) return fs.readFileSync(f, 'utf8');
  const r = await fetch(`https://en.wikipedia.org/w/index.php?title=${encodeURIComponent(title)}&action=raw`, { headers: { 'User-Agent': UA } });
  if (!r.ok) throw new Error(title + ' ' + r.status);
  const t = await r.text(); fs.writeFileSync(f, t); return t;
}
const section = (w, from, to) => { const a = w.indexOf(from); if (a < 0) throw new Error('no section ' + from); const b = to ? w.indexOf(to, a + from.length) : -1; return w.slice(a, b < 0 ? undefined : b); };
const strip = s => s.replace(/<ref[^>]*\/>/g, '').replace(/<ref[\s\S]*?<\/ref>/g, '').replace(/'''?/g, '');

// one candidate line: *{{Party stripe|..}}{{aye}} '''[[Target|Name]]''' (Party) 55.2%
function cand(line) {
  const l = strip(line);
  const won = /\{\{\s*aye\s*\}\}/i.test(l);
  const body = l.replace(/^\*\s*/, '').replace(/\{\{Party stripe\|[^}]*\}\}/gi, '').replace(/\{\{\s*aye\s*\}\}/gi, '').trim();
  let dep = 0, cut = body.length;
  for (let i = 0; i < body.length; i++) { if (body.startsWith('[[', i)) dep++; else if (body.startsWith(']]', i)) dep--; else if (body[i] === '(' && dep === 0) { cut = i; break; } }
  const head = body.slice(0, cut);
  const m = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/.exec(head);
  let name, wiki = null;
  if (m) { wiki = m[1].trim(); name = (m[2] || m[1]).trim(); }
  else name = head.replace(/\{\{[^}]*\}\}/g, '').replace(/[\[\]]/g, '').trim();
  const pm = /\(([^()]*?)\)\s*(?:([\d.]+)\s*%)?/.exec(body.slice(head.length));
  const party = pm ? pm[1].replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').trim() : null;
  const pct = pm && pm[2] ? +pm[2] : (/([\d.]+)\s*%/.exec(body)?.[1] ? +/([\d.]+)\s*%/.exec(body)[1] : null);
  return name ? { name, wiki, party, pct, won } : null;
}
function rows(table) { return table.split(/\n\|-[^\n]*/).slice(1); }
function race(row) {
  const cands = row.split('\n').filter(l => /^\*\s*\{\{Party stripe/i.test(l) || (/^\*/.test(l) && /\{\{\s*aye/i.test(l))).map(cand).filter(Boolean);
  if (!cands.length) return null;
  const winners = cands.filter(c => c.won);
  const lead = [...cands].sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1));
  // incumbent's party: the first cell that is just a party name, before the candidate list
  const pre = row.split(/\{\{\s*plainlist/i)[0];
  const im = /\|\s*(Democratic|Republican|Independent|Libertarian|DFL|Democratic[–-]Farmer[–-]Labor|Democratic-NPL|Nonpartisan)\s*$/m.exec(pre);
  const g = /(Democratic|Republican|Independent|Libertarian|DFL)\s+gain/i.exec(strip(pre)), hold = /(Democratic|Republican|Independent|DFL)\s+hold/i.exec(strip(pre));
  const result = g ? 'gain:' + g[1] : hold ? 'hold:' + hold[1] : null;
  return { result, called: winners.length > 0, winner: winners[0] || null, leaders: lead.slice(0, 2), incParty: im ? im[1] : null };
}

const out = { fetched: new Date().toISOString(), senate: [], house: [], governor: [], notes: [] };

// Senate: the "Elections leading to the next Congress" table (regular + special races on Nov 3)
{
  const w = await page('2026 United States Senate elections');
  const t = section(w, '=== Special elections during the preceding Congress ===', '=== Elections leading') + section(w, '=== Elections leading to the next Congress ===', '\n== ');
  for (const r of rows(t)) {
    const h = /^!\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/m.exec(r); if (!h) continue;
    const label = (h[2] || h[1]).replace(/\s*\(.*$/, '').trim();
    const st = ST[label] || ST[Object.keys(ST).find(k => h[1].includes(k)) || '']; if (!st) { out.notes.push('senate: no state for ' + h[0]); continue; }
    const cls = /Class (\d)/.exec(r)?.[1];
    const x = race(r); if (!x) { out.notes.push('senate: no candidates ' + st); continue; }
    out.senate.push({ st, cls: cls ? +cls : null, special: /special/i.test(h[1]), article: h[1], ...x });
  }
}
// Governors: "=== States ===" + territories table
{
  const w = await page('2026 United States gubernatorial elections');
  const t = section(w, '=== States ===', '== Alabama') ;
  for (const r of rows(t)) {
    const h = /^!\s*\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/m.exec(r); if (!h) continue;
    const st = ST[(h[2] || h[1]).trim()] || ST[Object.keys(ST).find(k => h[1].includes(' ' + k + ' ') || h[1].endsWith(' ' + k)) || ''];
    if (!st) { out.notes.push('gov: no state for ' + h[0]); continue; }
    const x = race(r); if (!x) { out.notes.push('gov: no candidates ' + st); continue; }
    out.governor.push({ st, article: h[1], ...x });
  }
}
// House: per-state sections, rows headed !{{ushr|ST|N|X}}
{
  const w = await page('2026 United States House of Representatives elections');
  const t = w.slice(w.indexOf('\n==Alabama=='));
  for (const r of rows(t)) {
    const h = /^!(?:[^|\n{]*\|)?\s*\{\{ushr\|([A-Z]{2})\|([^|}]+)/m.exec(r); if (!h) continue;
    const x = race(r); if (!x) { out.notes.push('house: no candidates ' + h[1] + '-' + h[2]); continue; }
    const d = /^(AL|at-large|0)$/i.test(h[2]) ? 'AL' : String(+h[2] || h[2]);
    const k = out.house.findIndex(y => y.st === h[1] && y.d === d); if (k >= 0) { out.notes.push('house: duplicate row ' + h[1] + '-' + d); out.house.splice(k, 1); }
    out.house.push({ st: h[1], d, ...x });
  }
}
fs.writeFileSync(path.join(here, 'raw', 'e2026-federal.json'), JSON.stringify(out, null, 1));
for (const k of ['senate', 'house', 'governor']) {
  const a = out[k]; const pc = {};
  for (const x of a) { const p = x.called ? x.winner.party : 'uncalled'; pc[p] = (pc[p] || 0) + 1; }
  console.log(k, a.length, 'races', JSON.stringify(pc));
}
console.log('notes', out.notes.length, out.notes.slice(0, 8));
