#!/usr/bin/env node
// e2026-states.mjs — November 3, 2026 US state legislative election results, from English Wikipedia.
//
// Fetches the summary article "2026 United States state legislative elections", discovers each
// chamber article from its {{main|...}} links, caches every page under raw/e26/, parses district
// winners and chamber compositions, and writes raw/e2026-states.json.
//
// Sources of a district result, in order of trust:
//   1. general-election {{Election box ...}} blocks (winner = "Election box winning candidate")
//   2. results-summary wikitables whose rows list candidates as bullets, winner marked {{aye}}
// Nothing is inferred: a race with no winner marked is called:false.
//
// Usage: node e2026-states.mjs [--refresh]   (--refresh re-downloads cached pages)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, 'raw', 'e26');
const OUT = path.join(HERE, 'raw', 'e2026-states.json');
const UA = 'minomobi-polity-builder/0.1 (https://cards.mino.mobi/polity/)';
const SUMMARY = '2026 United States state legislative elections';
const REFRESH = process.argv.includes('--refresh');
fs.mkdirSync(CACHE, { recursive: true });

const STATES = { Alabama:'AL', Alaska:'AK', Arizona:'AZ', Arkansas:'AR', California:'CA', Colorado:'CO', Connecticut:'CT', Delaware:'DE', Florida:'FL', Georgia:'GA', Hawaii:'HI', Idaho:'ID', Illinois:'IL', Indiana:'IN', Iowa:'IA', Kansas:'KS', Kentucky:'KY', Louisiana:'LA', Maine:'ME', Maryland:'MD', Massachusetts:'MA', Michigan:'MI', Minnesota:'MN', Mississippi:'MS', Missouri:'MO', Montana:'MT', Nebraska:'NE', Nevada:'NV', 'New Hampshire':'NH', 'New Jersey':'NJ', 'New Mexico':'NM', 'New York':'NY', 'North Carolina':'NC', 'North Dakota':'ND', Ohio:'OH', Oklahoma:'OK', Oregon:'OR', Pennsylvania:'PA', 'Rhode Island':'RI', 'South Carolina':'SC', 'South Dakota':'SD', Tennessee:'TN', Texas:'TX', Utah:'UT', Vermont:'VT', Virginia:'VA', Washington:'WA', 'West Virginia':'WV', Wisconsin:'WI', Wyoming:'WY' };

// ---------- fetching ----------
let lastFetch = 0;
const cacheFile = t => path.join(CACHE, t.replace(/[^A-Za-z0-9]+/g, '_') + '.wiki');
async function raw(title, depth = 0) {
  const f = cacheFile(title);
  let text;
  if (!REFRESH && fs.existsSync(f)) text = fs.readFileSync(f, 'utf8');
  else {
    const wait = lastFetch + 1100 - Date.now();
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
    lastFetch = Date.now();
    const url = 'https://en.wikipedia.org/w/index.php?title=' + encodeURIComponent(title.replace(/ /g, '_')) + '&action=raw';
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (r.status === 404) return null;
    if (!r.ok) throw new Error(`${r.status} fetching ${title}`);
    text = await r.text();
    fs.writeFileSync(f, text);
    console.error('fetched', title, text.length);
  }
  const red = text.match(/^\s*#REDIRECT\s*\[\[([^\]|#]+)/i);
  if (red && depth < 3) { const x = await raw(red[1].trim(), depth + 1); return x && { ...x, redirectedFrom: title }; }
  return { title, text };
}

// ---------- wikitext helpers ----------
const stripComments = s => s.replace(/<!--[\s\S]*?(-->|$)/g, '');
const stripRefs = s => s.replace(/<ref[^>/]*\/>/gi, '').replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '');
const clean = s => s.replace(/\{\{(?:efn|refn|sfn|nbsp|-)[^{}]*\}\}/gi, '').replace(/&nbsp;/g, ' ').replace(/<br\s*\/?>/gi, ' ').replace(/<\/?(?:small|span|b|i|s)[^>]*>/gi, '').replace(/\s+/g, ' ').trim();

// parse "[[A|B]]" -> {wiki:A, text:B}; plain text -> {wiki:null,text}
function nameOf(s) {
  s = clean(stripRefs(s || ''));
  s = s.replace(/\{\{(?:sortname)\|([^|}]*)\|([^|}]*)(?:\|([^}]*))?\}\}/gi, (_, a, b, c) => {
    const dab = c && (c.match(/dab=([^|}]*)/) || [])[1];
    const link = c && !/=/.test(c.split('|')[0]) && c.split('|')[0] !== 'nolink' ? c.split('|')[0] : null;
    const full = (a.trim() + ' ' + b.trim()).trim();
    if (c && /nolink/.test(c)) return full;
    return `[[${link || (dab ? `${full} (${dab})` : full)}|${full}]]`;
  });
  const m = s.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
  let wiki = null, text;
  if (m) { wiki = m[1].trim(); text = (m[2] || m[1]).trim(); }
  else text = s;
  text = text.replace(/'''?/g, '').replace(/\{\{[^{}]*\}\}/g, '').replace(/\((?:incumbent|inc\.?)\)/i, '').replace(/\s*\((?:[^)]*)\)\s*$/, '').replace(/[†*‡:]+$/, '').replace(/\s+/g, ' ').trim();
  if (wiki && /^(?:File|Image|Category):/i.test(wiki)) wiki = null;
  if (wiki) wiki = wiki.replace(/_/g, ' ').replace(/#.*$/, '');
  return { text, wiki: wiki || null };
}

function normParty(p) {
  if (!p) return null;
  p = clean(p).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').trim();
  const P = p.toLowerCase();
  if (!P) return null;
  if (/working families/.test(P)) return 'Working Families';
  if (/vermont progressive|^progressive/.test(P)) return 'Progressive (Vermont)';
  if (/independent democrat/.test(P)) return 'Independent Democrat';
  if (/independent republican/.test(P)) return 'Independent Republican';
  if (/alaska independence/.test(P)) return 'Alaskan Independence';
  if (/democratic.farmer|dfl|democratic.npl|democratic.nonpartisan|^dem\b|^dem\.|democrat/.test(P)) return 'Democratic';
  if (/republican|^rep\b|^rep\.|^gop/.test(P)) return 'Republican';
  if (/libertarian|^lib\b/.test(P)) return 'Libertarian';
  if (/green/.test(P)) return 'Green';
  if (/conservative party of new york|^conservative/.test(P)) return 'Conservative';
  if (/forward/.test(P)) return 'Forward';
  if (/constitution/.test(P)) return 'Constitution';
  if (/nonpartisan/.test(P)) return 'Nonpartisan';
  if (/independen|^ind\b|^ind\.|unaffiliated|no party|^npa\b/.test(P)) return 'Independent';
  return p.replace(/\s*\((?:US|United States)\)\s*$/i, '').replace(/ Party$/i, '').trim();
}

// heading-aware sectioning
function sections(text) {
  const out = []; const stack = [];
  let cur = { path: [], body: '' };
  for (const line of text.split('\n')) {
    const h = line.match(/^(={2,6})\s*(.*?)\s*\1\s*$/);
    if (h) {
      out.push(cur);
      const lvl = h[1].length;
      while (stack.length && stack[stack.length - 1].lvl >= lvl) stack.pop();
      stack.push({ lvl, t: clean(stripRefs(h[2])).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1') });
      cur = { path: stack.map(x => x.t), body: '' };
    } else cur.body += line + '\n';
  }
  out.push(cur);
  return out;
}
const SKIP_SECTION = /special|retir|predict|poll|endorse|fundrais|background|campaign|declin|withdr|disqualif|incumbents defeated|open seats|seats that|party switch|resign|vacan|primar|runoff|nominee|eliminat|candidates|filed|declared|ratings|forecast|see also|references|notes|external|leadership|aftermath|redistrict|by.?county|outgoing|appoint|potential|publicly|lost renom|expressed|caucus|convention/i;

function skipSection(p) {
  return p.some(e => /primar|runoff|special|recall/i.test(e) || (!/result|overview|summary|district|general|incumbents and candidates|members|composition/i.test(e) && SKIP_SECTION.test(e)));
}
// district normalisation: "1st" -> "1", "07" -> "7", "District 12" -> "12"
function normDistrict(d) {
  if (!d) return null;
  d = clean(stripRefs(d)).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').replace(/'''?/g, '').replace(/\{\{[^{}]*\}\}/g, '').trim();
  d = d.replace(/^(?:(?:state\s+)?(?:senate|house|assembly|legislative|delegate)\s+)?district\s*(?:no\.\s*)?/i, '');
  d = d.replace(/\s+(?:general\s+)?election.*$/i, '').replace(/\s*(?:results?)$/i, '').trim();
  d = d.replace(/^0+(\d)/, '$1').replace(/^(\d+)(?:st|nd|rd|th)$/i, '$1');
  return d || null;
}
function districtFromTitle(t) {
  if (!t) return null;
  t = clean(stripRefs(t)).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
  let pos = (t.match(/position\s*(\w+)/i) || [])[1] || (t.match(/\bseat\s*([AB12])\b/i) || [])[1];
  let m = t.match(/district\s*(?:no\.\s*)?([0-9]+[A-Z]?(?:-[0-9]+)?)\b/i) || t.match(/\b([0-9]+[A-Z]?)(?:st|nd|rd|th)?\s+(?:[\w.-]+\s+){0,4}district/i);
  if (!m) return null;
  return { d: normDistrict(m[1]), pos: pos || null };
}

// ---------- election boxes ----------
function templateArgs(t) { // t: inner text of {{...}} (no nested templates assumed except simple ones)
  const args = {}; let depth = 0, buf = '', parts = [];
  for (let i = 0; i < t.length; i++) {
    const c = t[i], n = t[i + 1];
    if ((c === '{' && n === '{') || (c === '[' && n === '[')) { depth++; buf += c + n; i++; continue; }
    if ((c === '}' && n === '}') || (c === ']' && n === ']')) { depth--; buf += c + n; i++; continue; }
    if (c === '|' && depth === 0) { parts.push(buf); buf = ''; continue; }
    buf += c;
  }
  parts.push(buf);
  const name = parts.shift().trim();
  parts.forEach((p, i) => { const m = p.match(/^\s*([\w ]+?)\s*=([\s\S]*)$/); if (m) args[m[1].toLowerCase()] = m[2].trim(); else args[i + 1] = p.trim(); });
  return { name, args };
}
// all top-level {{...}} occurrences in s, with offsets
function topTemplates(s) {
  const out = []; let depth = 0, start = -1;
  for (let i = 0; i < s.length - 1; i++) {
    if (s[i] === '{' && s[i + 1] === '{') { if (depth === 0) start = i; depth++; i++; }
    else if (s[i] === '}' && s[i + 1] === '}') { depth--; i++; if (depth === 0 && start >= 0) { out.push({ at: start, src: s.slice(start + 2, i - 1) }); start = -1; } if (depth < 0) depth = 0; }
  }
  return out;
}
const num = v => { if (v == null) return null; const x = parseFloat(String(v).replace(/[,%\s]/g, '')); return Number.isFinite(x) ? x : null; };

function parseBoxes(sec, chamberCtx) {
  const res = [];
  const tpls = topTemplates(sec.body);
  let box = null;
  for (const t of tpls) {
    const { name, args } = templateArgs(t.src);
    const n = name.toLowerCase().replace(/\s+/g, ' ');
    if (!n.startsWith('election box')) continue;
    if (/begin/.test(n)) {
      box = { kind: n, title: args.title || '', rawTitle: t.src, cands: [], hold: false, generalSplit: false, inline: /inline/.test(n) };
      continue;
    }
    if (!box) continue;
    if (/open primary general election/.test(n)) { box.generalSplit = true; box.cands = []; continue; }
    if (/\bend\b/.test(n)) { if (box.cur) res.push(box.cur); res.push(box); box = null; continue; }
    if (/hold|gain/.test(n)) { box.hold = true; continue; }
    if (box.inline && /inline incumbent/.test(n)) {
      if (box.cur) res.push(box.cur);
      box.cur = { kind: 'inline', title: 'District ' + normDistrict(nameOf(args.race || '').text), rawTitle: '', cands: [], hold: false, generalSplit: false, inline: false, inlineRace: true };
      continue;
    }
    if (box.inline && /candidate/.test(n) && box.cur) {
      const nm = nameOf(args.candidate || ''); if (!nm.text) continue;
      box.cur.cands.push({ name: nm.text, wiki: nm.wiki, party: normParty(args.party || ''), votes: num(args.votes), pct: num(args.percentage), win: /winning/.test(n), unopposed: false });
      continue;
    }
    if (/candidate|incumbent/.test(n) && !/write/.test(n)) {
      const nm = nameOf(args.candidate || args.name || '');
      if (!nm.text) continue;
      box.cands.push({ name: nm.text, wiki: nm.wiki, party: normParty(args.party || args['party link'] || ''), votes: num(args.votes), pct: num(args.percentage),
        win: /winning|unopposed/.test(n), unopposed: /unopposed/.test(n) });
    }
  }
  return res;
}

function classifyBox(box, sec) {
  const titleRaw = box.rawTitle || '';
  const hp = sec.path.join(' / ');
  if (box.inlineRace) return 'general';
  if (box.inline) return 'skip';
  if (/special|recall/i.test(box.title) || /special/i.test(hp)) return 'skip';
  if (/open primary begin/.test(box.kind)) return box.generalSplit ? 'general' : 'skip';
  if (/primary|runoff|convention|caucus|nominat|endorsement vote/i.test(box.title)) return 'skip';
  if (/general|november/i.test(box.title)) return 'general';
  if (/primar|runoff|nominat/i.test(sec.path[sec.path.length - 1] || '')) return 'skip';
  if (/general/i.test(sec.path[sec.path.length - 1] || '')) return 'general';
  if (/primary/i.test(titleRaw.replace(box.title, ''))) return 'skip';
  // no explicit label: accept only boxes that look like a general election (hold/gain line, or
  // candidates of several parties with no party repeated, which a partisan primary cannot have)
  const parties = box.cands.map(c => c.party).filter(Boolean);
  const multi = new Set(parties).size >= 2 && new Set(parties).size === parties.length;
  if (box.hold && box.cands.length) return 'general';
  if (multi) return 'general-inferred';
  return 'skip';
}

// ---------- results tables ----------
function tablesIn(body) {
  const out = []; const lines = body.split('\n'); let depth = 0, cur = null;
  for (const l of lines) {
    if (/^\s*\{\|/.test(l)) { depth++; if (depth === 1) { cur = []; } }
    if (cur) cur.push(l);
    if (/^\s*\|\}/.test(l)) { depth--; if (depth === 0 && cur) { out.push(cur.join('\n')); cur = null; } }
  }
  return out;
}
// split s on a 2-char separator at nesting depth 0
function splitTop(s, sep) {
  const out = []; let depth = 0, buf = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i], n = s[i + 1];
    if ((c === '{' && n === '{') || (c === '[' && n === '[')) { depth++; buf += c + n; i++; continue; }
    if ((c === '}' && n === '}') || (c === ']' && n === ']')) { depth = Math.max(0, depth - 1); buf += c + n; i++; continue; }
    if (depth === 0 && s.startsWith(sep, i)) { out.push(buf); buf = ''; i += sep.length - 1; continue; }
    buf += c;
  }
  out.push(buf); return out;
}
// one cell's "attrs | content"
function splitCell(c) {
  const parts = splitTop(c, '|');
  if (parts.length < 2) return { attrs: '', content: c.trim() };
  const a = parts[0];
  if (/\[\[/.test(a) || /'''/.test(a)) return { attrs: '', content: c.trim() };
  if (/=/.test(a) || /^\s*\{\{[^{}]*\}\}\s*$/.test(a)) return { attrs: a, content: parts.slice(1).join('|').trim() };
  return { attrs: '', content: c.trim() };
}
// wikitable -> array of rows of {h, attrs, content}, with rowspan/colspan expanded
function grid(tbl) {
  const rowsSrc = ('\n' + tbl.replace(/^\s*\{\|[^\n]*\n/, '')).replace(/\n\s*\|\}\s*$/, '').split(/\n\s*\|-[^\n]*/);
  const rows = []; const carry = []; // carry[col] = {cell, left}
  for (const rs of rowsSrc) {
    const cells = [];
    for (const line of rs.split('\n')) {
      if (/^\s*\|\+/.test(line)) continue;
      const m = line.match(/^\s*([|!])(.*)$/);
      if (m) {
        const h = m[1] === '!';
        for (const part of splitTop(m[2], h ? '!!' : '||').flatMap(p => h ? splitTop(p, '||') : [p])) cells.push({ h, ...splitCell(part) });
      } else if (cells.length) cells[cells.length - 1].content += '\n' + line;
    }
    if (!cells.length && !carry.some(Boolean)) continue;
    const row = []; let ci = 0, col = 0;
    const place = () => { while (carry[col] && carry[col].left > 0) { row[col] = carry[col].cell; carry[col].left--; col++; } };
    place();
    for (const c of cells) {
      place();
      const cs = +((c.attrs.match(/colspan\s*=\s*"?(\d+)/i) || [])[1] || 1);
      const rsn = +((c.attrs.match(/rowspan\s*=\s*"?(\d+)/i) || [])[1] || 1);
      for (let k = 0; k < cs; k++) { row[col] = c; if (rsn > 1) carry[col] = { cell: c, left: rsn - 1 }; else carry[col] = null; col++; }
    }
    place();
    if (row.length) rows.push(row);
  }
  return rows;
}
const PARTY_FROM_ATTR = a => (a.match(/party (?:color(?: cell)?|shading|name with color|stripe)\s*[|/]\s*([^}|]+)/i) || [])[1];
const KNOWN = new Set(['Democratic','Republican','Independent','Libertarian','Green','Working Families','Progressive (Vermont)','Independent Democrat','Independent Republican','Alaskan Independence','Conservative','Forward','Constitution','Nonpartisan']);
const strictParty = s => { const p = normParty(s); return p && KNOWN.has(p) ? p : null; };
const partyOfCell = c => c ? (strictParty(PARTY_FROM_ATTR(c.attrs) || '') || strictParty(PARTY_FROM_ATTR(c.content) || '') || strictParty(clean(c.content).replace(/\s*(?:hold|gain|pickup|flip)\b.*$/i, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1'))) : null;
function parseTable(tbl) {
  const g = grid(tbl);
  if (g.length < 2) return [];
  const hdrIdx = g.findIndex(r => r.some(c => c.h && /elect|winner|candidates|results?$/i.test(c.content)));
  const header = hdrIdx >= 0 ? g[hdrIdx].map(c => (c && c.h ? clean(stripRefs(c.content)).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1') : '')) : [];
  let electCol = header.findIndex(h => !/first elected|elected in|since/i.test(h) && /elected|winner|member.elect|new member|representative.elect|senator.elect|delegate.elect/i.test(h));
  const incCol = header.findIndex(h => /incumbent/i.test(h));
  // candidate-per-row format: a "Candidates" group header over Name | Party | Votes | %; winner in bold
  const hdrRows = g.filter(r => r.every(c => !c || c.h));
  const ht = c => c ? clean(stripRefs(c.content)).replace(/'''/g, '') : '';
  let vi = -1;
  if (hdrRows.some(r => r.some(c => /^Candidates?$/i.test(ht(c))))) for (const r of hdrRows) r.forEach((c, i) => { if (vi < 0 && /^Votes$/i.test(ht(c))) vi = i; });
  if (vi >= 2) { electCol = -1; }
  const out = new Map();
  for (const row of g.slice(hdrIdx + 1)) {
    if (!row[0]) continue;
    // district: first cell
    const first = row[0].content.replace(/\[https?:[^\s\]]+\s+([^\]]+)\]/g, '$1');
    let d = null;
    const link = first.match(/\[\[([^\]|]*(?:district|House of Representatives, District|Senate, District)[^\]|]*)(?:\|([^\]]+))?\]\]/i);
    if (link) d = normDistrict(link[2] || link[1].replace(/^.*?'s\s+/, '').replace(/^.*, District /, ''));
    else { const t = clean(stripRefs(first)).replace(/'''/g, '').replace(/\{\{[^{}]*\}\}/g, '').trim(); if (/^(?:district\s*)?\d+[A-Z]?(?:st|nd|rd|th)?$/i.test(t)) d = normDistrict(t); }
    if (!d) continue;
    if (row[1] && row[1] !== row[0] && /^\s*[A-C]\s*$/.test(row[1].content)) d += row[1].content.trim();
    const r = out.get(d) || { district: d, cands: [], nSeats: 0, rowsSeen: new Set() };
    out.set(d, r);
    // bullet candidates anywhere in the row (each distinct cell once)
    const seen = new Set();
    let gotBullets = false;
    for (const cell of row) {
      if (!cell || seen.has(cell) || r.rowsSeen.has(cell)) continue; seen.add(cell);
      if (!/^\s*\*/m.test(cell.content)) continue;
      let stop = false;
      for (const l of cell.content.split('\n')) {
        if (/primary|eliminated|runoff|collapsible|special/i.test(l) && !/^\s*\*+\s*\{\{party stripe/i.test(l)) { if (r.cands.length) stop = true; }
        if (stop) break;
        const b = l.match(/^\s*\*+\s*(.*)$/); if (!b) continue;
        let s = b[1];
        const win = /\{\{\s*(?:aye|yes|tick|check mark)\s*\}\}/i.test(s);
        const ps = s.match(/\{\{\s*party stripe\s*\|([^}|]*)/i);
        s = s.replace(/\{\{\s*party stripe[^}]*\}\}/gi, '').replace(/\{\{\s*(?:aye|nay|yes|no|tick|check mark)\s*\}\}/gi, '');
        const ptext = (s.match(/\(([^)]*)\)\s*(?:[-–—:].*)?$/) || [])[1];
        const pctm = s.match(/(\d+(?:\.\d+)?)\s*%/);
        const nm = nameOf(s.replace(/\s*[-–—:]\s*[\d,.]+\s*%?.*$/, '').replace(/\s*\([^)]*\)\s*$/, ''));
        if (!nm.text || /^(?:tbd|tba|none|vacant)$/i.test(nm.text)) continue;
        r.cands.push({ name: nm.text, wiki: nm.wiki, party: normParty(ps ? ps[1] : ptext), pct: pctm ? +pctm[1] : null, votes: null, win });
        gotBullets = true;
      }
    }
    if (vi >= 2) {
      const nc = row[vi - 2], pc = row[vi - 1];
      if (nc && !r.rowsSeen.has(nc) && nc !== row[0]) {
        const nm = nameOf(nc.content);
        if (nm.text && !/^(?:tbd|tba)$/i.test(nm.text)) r.cands.push({ name: nm.text, wiki: nm.wiki, party: partyOfCell(pc), votes: num(clean(row[vi].content).replace(/'''/g, '')), pct: num(clean((row[vi + 1] || {}).content || '').replace(/'''/g, '')), win: /'''/.test(nc.content) });
        r.nSeats = 1;
      }
    } else if (!gotBullets && electCol >= 0 && !row[electCol]) r.nSeats++;
    else if (!gotBullets && electCol >= 0 && row[electCol]) {
      r.nSeats++;
      let ec = row[electCol];
      const looksOutcome = c => !c || /\b(?:hold|gain|pickup|flip)\b/i.test(c.content) || !!partyOfCell(c) && !/\[\[[^\]]*\]\]|sortname/i.test(c.content.replace(/\[\[[^\]|]*(?:Party|party)[^\]]*\]\]/g, ''));
      if (looksOutcome(ec) && electCol - 1 !== incCol && row[electCol - 1] && !looksOutcome(row[electCol - 1])) ec = row[electCol - 1];
      const nm = nameOf(ec.content);
      const ecTxt = (nm.text || '').trim();
      if (ecTxt && !looksOutcome(ec) && !/^(?:tbd|tba|tbc|vacant|pending|n\/?a|-|—|–|\?)$/i.test(ecTxt) && !/to be determined|undecided|uncalled|too close|^\d{4}/i.test(ecTxt)) {
        let party = null;
        const ei = row.indexOf(ec);
        for (let k = ei + 1; k < Math.min(row.length, ei + 4) && !party; k++) { const c = row[k]; if (!c || c === ec) continue; party = partyOfCell(c); }
        if (!party) party = strictParty(PARTY_FROM_ATTR(ec.attrs) || '');
        r.cands.push({ name: nm.text, wiki: nm.wiki, party, pct: null, votes: null, win: true });
      }
    } else if (gotBullets) r.nSeats = Math.max(r.nSeats, 1);
    for (const c of row) if (c) r.rowsSeen.add(c);
  }
  return [...out.values()].filter(r => r.cands.length || r.nSeats).map(({ rowsSeen, ...r }) => r);
}

// ---------- per-chamber ----------
function chamberResults(text) {
  text = stripComments(text);
  const secs = sections(text);
  const byBox = new Map(), byTable = new Map(), notes = [];
  let inferred = 0;
  for (const sec of secs) {
    const top = sec.path[0] || '';
    if (sec.path.some(p => /special/i.test(p))) continue;
    // boxes
    for (const box of parseBoxes(sec)) {
      const cls = classifyBox(box, sec);
      if (cls === 'skip' || !box.cands.length) continue;
      if (cls === 'general-inferred') inferred++;
      let dd = districtFromTitle(box.title);
      if (!dd) for (let i = sec.path.length - 1; i >= 0 && !dd; i--) dd = districtFromTitle(sec.path[i]) || (/^(?:district|position|\d)/i.test(sec.path[i]) ? null : null);
      if (!dd) { // headings like "Belknap 1", "1st Middlesex", "Addison-1", "District 1A" — take the nearest non-generic heading
        const h = [...sec.path].reverse().find(p => !/^(?:results?|general(?: election)?|candidates|election|districts?|results by district|.*(?:senate|house|assembly) elections?)$/i.test(p));
        if (h) dd = { d: normDistrict(h), pos: null };
      }
      if (!dd || !dd.d) continue;
      const pos = dd.pos || ((sec.path.join(' ').match(/position\s*(\w+)/i) || [])[1]) || null;
      const key = dd.d + (pos ? '|' + pos : '');
      if (!byBox.has(key)) byBox.set(key, { district: dd.d, seat: pos ? 'Position ' + pos : null, cands: box.cands, nSeats: Math.max(1, box.cands.filter(c => c.win).length) });
      else if (box.cands.some(c => c.win) && !byBox.get(key).cands.some(c => c.win)) Object.assign(byBox.get(key), { cands: box.cands, nSeats: Math.max(1, box.cands.filter(c => c.win).length) });
    }
    // tables
    if (skipSection(sec.path)) continue;
    for (const tbl of tablesIn(sec.body)) {
      for (const r of parseTable(tbl)) {
        if (!byTable.has(r.district) || (r.cands.some(c => c.win) && !byTable.get(r.district).cands.some(c => c.win))) byTable.set(r.district, r);
      }
    }
  }
  return { byBox, byTable, inferred };
}

const validName = n => !!n && !/[=}{|]|https?:/.test(n) && /[A-Za-z]{2}/.test(n);
function toMembers(race) {
  race.cands = race.cands.map(c => ({ ...c, name: (c.name || '').replace(/^[\[\]\s]+|[\[\]\s]+$/g, '') })).filter(c => validName(c.name));
  const winners = race.cands.filter(c => c.win);
  const base = { district: race.district };
  if (race.seat) base.seat = race.seat;
  const out = winners.map(w => ({ ...base, name: w.name, wiki: w.wiki, party: w.party, called: true, ...(w.unopposed ? { unopposed: true } : {}) }));
  const open = Math.max((race.nSeats || 1) - winners.length, 0);
  if (!open) return out;
  const rest = race.cands.filter(c => !c.win);
  const ranked = [...rest].sort((a, b) => (b.votes ?? b.pct ?? -1) - (a.votes ?? a.pct ?? -1));
  const hasCounts = ranked.some(c => (c.votes ?? c.pct) != null);
  for (let i = 0; i < open; i++) {
    const lead = hasCounts ? ranked[i] : null;
    const m = { ...base, name: lead ? lead.name : null, wiki: lead ? lead.wiki : null, party: lead ? lead.party : null, called: false,
      leaders: hasCounts ? ranked.slice(i, i + 2).map(c => ({ name: c.name, wiki: c.wiki, party: c.party, pct: c.pct })) : [] };
    if (!hasCounts && rest.length) m.candidates = rest.map(c => ({ name: c.name, wiki: c.wiki, party: c.party }));
    out.push(m);
  }
  return out;
}

// party-level results table in a chamber article ("Seats: Before | Up | Won | After")
function articleSeats(text) {
  text = stripComments(text);
  for (const tbl of tablesIn(text)) {
    const g = grid(tbl);
    const txt = c => c ? clean(stripRefs(c.content)).replace(/'''/g, '').replace(/\{\{[^{}]*\}\}/g, '').replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1').trim() : '';
    const hdrRows = g.filter(r => r.every(c => !c || c.h)).slice(0, 3);
    let ai = -1, wi = -1;
    for (const r of hdrRows) r.forEach((c, i) => { const t = txt(c); if (/^After/i.test(t) && ai < 0) ai = i; if (/^(?:Won|Elected)$/i.test(t) && wi < 0) wi = i; });
    if (ai < 0 && wi < 0) continue;
    const res = { after: {}, won: {}, afterBlank: false, wonBlank: false, n: 0 };
    for (const row of g) {
      if (row.every(c => !c || c.h)) continue;
      if (row.some(c => c && /Total/i.test(c.content))) continue;
      const pc = row.slice(0, 3).find(c => c && /\[\[[^\]]*\]\]|Independent|Nonpartisan/i.test(c.content) && !/party color/i.test(c.content));
      const p = pc && strictParty(nameOf(pc.content).text);
      if (!p) continue;
      res.n++;
      const v = i => { if (i < 0) return undefined; const t = txt(row[i]); return /^\d+$/.test(t) ? +t : null; };
      const a = v(ai), w = v(wi);
      if (ai >= 0) { if (a == null) res.afterBlank = true; else res.after[p] = (res.after[p] || 0) + a; }
      if (wi >= 0) { if (w == null) res.wonBlank = true; else res.won[p] = (res.won[p] || 0) + w; }
    }
    if (!res.n) continue;
    const pos = o => Object.fromEntries(Object.entries(o).filter(([, x]) => x > 0));
    if (ai >= 0 && !res.afterBlank && Object.keys(res.after).length) return { seats: pos(res.after), meaning: 'composition' };
    if (wi >= 0 && !res.wonBlank && Object.keys(res.won).length) return { seats: pos(res.won), meaning: 'won-in-2026' };
  }
  return null;
}

// ---------- summary page ----------
function summaryInfo(text) {
  text = stripComments(text);
  const info = {}; // state -> {SS:{up,total}, SH:{up,total}}
  const st = text.slice(text.indexOf('==Summary tables=='), text.indexOf('===Territories==='));
  for (const row of st.split(/\n\|-\s*/)) {
    const m0 = row.match(/scope="row"\s*\|\s*\[\[([^\]]+)\]\]/);
    const m = m0 && [null, m0[1].split('|').pop()];
    if (!m || !STATES[m[1].trim()]) continue;
    const cells = row.split('\n').slice(1).filter(l => /^\s*\|/.test(l)).map(l => clean(l.replace(/^\s*\|/, '').replace(/\{\{efn[^}]*\}\}/g, '')));
    const n = c => (c && /^\d+/.test(c) ? parseInt(c) : null);
    const s = STATES[m[1].trim()];
    info[s] = { SS: { up: n(cells[0]), total: n(cells[1]) }, SH: /unicameral/.test(row) ? null : { up: n(cells[4]), total: n(cells[5]) }, rawCells: cells };
  }
  // composition tables in "State summaries"
  const comp = {}; // caption -> {party: after} (null if after blank)
  const ss = text.slice(text.indexOf('== State summaries =='), text.indexOf('==Territorial'));
  for (const tbl of tablesIn(ss)) {
    const cap = (tbl.match(/\|\+[^|\n]*\|\s*([^\n]+)/) || tbl.match(/\|\+\s*([^\n]+)/) || [])[1];
    if (!cap) continue;
    const caption = clean(cap).replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1');
    const parties = {}; let anyAfter = false, total = null;
    const g = grid(tbl);
    const txt = c => c ? clean(stripRefs(c.content)).replace(/'''/g, '').replace(/\{\{[^{}]*\}\}/g, '').trim() : '';
    const hdr = g.find(r => r.some(c => c && c.h && /^Before/i.test(txt(c))));
    if (!hdr) continue;
    const bi = hdr.findIndex(c => c && /^Before/i.test(txt(c))), ai = hdr.findIndex(c => c && /^After/i.test(txt(c)));
    for (const row of g.slice(g.indexOf(hdr) + 1)) {
      const val = i => { const t = txt(row[i]); return /^\d+$/.test(t) ? +t : null; };
      if (row.some(c => c && /Total/.test(c.content))) { total = { before: val(bi), after: val(ai) }; continue; }
      const pname = normParty(nameOf(row[1] ? row[1].content : '').text);
      if (!pname || ai < 0) continue;
      const after = val(ai);
      if (after != null) anyAfter = true;
      const prev = parties[pname];
      parties[pname] = { before: (prev?.before ?? 0) + (val(bi) ?? 0), after: (prev?.after ?? 0) + (after ?? 0), afterBlank: (prev?.afterBlank || false) || after == null };
    }
    comp[caption] = { parties, anyAfter, total };
  }
  // chamber articles from {{main|...}}
  const titles = [...ss.matchAll(/\{\{[Mm]ain\|([^}]*)\}\}/g)].flatMap(m => m[1].split('|').map(s => s.trim())).filter(t => /^2026 .* election$/.test(t) && !/special/i.test(t));
  return { info, comp, titles };
}

function chamberOf(title) {
  const m = title.match(/^2026 (.+?) (State Senate|Senate|Legislature|House of Representatives|House of Delegates|State Assembly|Assembly) election$/);
  if (!m) return null;
  const stName = m[1];
  if (!STATES[stName]) return null;
  return { st: STATES[stName], stName, b: /Senate|Legislature/.test(m[2]) ? 'SS' : 'SH', chamberName: `${stName} ${m[2]}` };
}

// ---------- main ----------
const notes = [];
const sum = await raw(SUMMARY);
const S = summaryInfo(sum.text);
const chambers = [];
for (const title of S.titles) {
  const c = chamberOf(title);
  if (!c) { notes.push(`skipped unrecognised chamber article title: ${title}`); continue; }
  const page = await raw(title);
  if (!page) { notes.push(`${c.st} ${c.b}: article "${title}" not found`); continue; }
  const { byBox, byTable, inferred } = chamberResults(page.text);
  // merge: box results first; table fills districts the boxes lack, or supplies a winner the box lacks
  const races = new Map();
  for (const [k, r] of byBox) races.set(k, { ...r, src: 'box' });
  const boxDistricts = new Set([...byBox.values()].map(r => r.district));
  let conflicts = 0;
  for (const [d, r] of byTable) {
    const boxes = [...races.values()].filter(x => x.district === d);
    if (!boxes.length) { races.set(d, { ...r, src: 'table' }); continue; }
    const tw = r.cands.filter(c => c.win);
    if (boxes.length === 1 && !boxes[0].seat) {
      const bw = boxes[0].cands.filter(c => c.win);
      if (r.nSeats > 1) boxes[0].nSeats = r.nSeats;
      if (!bw.length && tw.length) races.set([...races.entries()].find(([, v]) => v === boxes[0])[0], { ...r, src: 'table' });
      else if (bw.length && tw.length && bw.map(x => x.name.split(' ').pop().toLowerCase()).sort().join() !== tw.map(x => x.name.split(' ').pop().toLowerCase()).sort().join()) { conflicts++; notes.push(`${c.st} ${c.b} district ${d}: election box winner ${bw.map(x => x.name).join('/')} vs table {{aye}} ${tw.map(x => x.name).join('/')} — box kept`); }
    }
  }
  const sortKey = d => { const m = String(d).match(/(\d+)/); return [m ? +m[1] : 1e9, String(d)]; };
  const members = [...races.values()].sort((a, b) => { const [x, xs] = sortKey(a.district), [y, ys] = sortKey(b.district); return x - y || xs.localeCompare(ys) || String(a.seat).localeCompare(String(b.seat)); }).flatMap(toMembers);
  // composition
  const comp = S.comp[c.chamberName] || S.comp[c.chamberName.replace('State ', '')] || Object.entries(S.comp).find(([k]) => k.replace(/^the /i, '') === c.chamberName || (c.st === 'NE' && /Nebraska/.test(k)))?.[1];
  let seats = null, seatsMeaning = null;
  if (comp && comp.anyAfter) {
    const tot = comp.total && comp.total.after;
    const filled = {}; for (const [p, v] of Object.entries(comp.parties)) if (!v.afterBlank) filled[p] = v.after;
    const sumAfter = Object.values(filled).reduce((a, b) => a + b, 0);
    const blanks = Object.entries(comp.parties).filter(([, v]) => v.afterBlank).map(([p]) => p);
    if (!blanks.length && (!tot || sumAfter === tot)) { seats = Object.fromEntries(Object.entries(filled).filter(([, v]) => v > 0)); seatsMeaning = 'composition'; }
    else notes.push(`${c.st} ${c.b}: summary-page composition table only partly filled in (after: ${JSON.stringify(filled)}; blank: ${blanks.join(', ') || '-'}; total ${tot ?? '?'}) — seats left null`);
  }
  if (!seats) { const a = articleSeats(page.text); if (a && Object.values(a.seats).reduce((x, y) => x + y, 0) > 0) { seats = a.seats; seatsMeaning = a.meaning; notes.push(`${c.st} ${c.b}: seats taken from the chamber article's party results table (${a.meaning})`); } }
  const inf = S.info[c.st] && S.info[c.st][c.b];
  if (!comp) notes.push(`${c.st} ${c.b}: no composition table found on the summary page for "${c.chamberName}"`);
  const called = members.filter(m => m.called).length;
  if (inferred) notes.push(`${c.st} ${c.b}: ${inferred} unlabelled election box(es) treated as general elections because their candidates were of different parties`);
  if (conflicts) notes.push(`${c.st} ${c.b}: ${conflicts} box/table winner conflicts`);
  chambers.push({ st: c.st, b: c.b, source: page.title, ...(page.redirectedFrom ? { linkedAs: page.redirectedFrom } : {}),
    members, seats, seatsMeaning, upIn2026: inf ? inf.up : null, chamberSize: inf ? inf.total : null,
    _stats: { races: races.size, members: members.length, called, uncalled: members.filter(m => !m.called).length, fromBoxes: [...races.values()].filter(r => r.src === 'box').length, fromTables: [...races.values()].filter(r => r.src === 'table').length } });
}

// chambers with no 2026 regular election
const have = new Set(chambers.map(c => c.st + c.b));
for (const [name, st] of Object.entries(STATES)) {
  const inf = S.info[st];
  for (const b of st === 'NE' ? ['SS'] : ['SS', 'SH']) {
    if (have.has(st + b)) continue;
    const i = inf && inf[b];
    if (!inf) notes.push(`${st} ${b}: no 2026 regular election (state absent from the summary table — odd-year elections)`);
    else if (i && i.up === 0 || (i && i.up == null)) notes.push(`${st} ${b}: no 2026 regular election per the summary table (seats up: ${inf.rawCells[b === 'SS' ? 0 : 4] || 'n/a'})`);
    else notes.push(`${st} ${b}: summary table says ${i.up} seats up, but no chamber article was linked/parsed`);
  }
}

for (const c of chambers) if (!c.members.length) notes.push(`${c.st} ${c.b}: no district list parsed from "${c.source}" (article has no results table / election boxes in a recognised form)${c.seats ? '; seats only' : ''}`);
notes.push('Uncalled races with no vote counts carry name:null, leaders:[] and (when the article lists them) candidates:[...]. Multi-member districts emit one entry per seat; "seat" is set for Washington-style positions.');
notes.push('A winner is taken only from an "Election box winning candidate" line in a general-election box, an {{aye}}-marked bullet, a bolded name in a candidate-per-row table, or a filled "Elected ..." column. Unlabelled election boxes are treated as general elections only when they have a hold/gain line or candidates of distinct parties.');
const out = { fetched: new Date().toISOString(), source: SUMMARY, chambers: chambers.map(({ _stats, ...c }) => c), notes };
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
// console report
console.log('st b   size up  races memb called uncalled box tbl  seats');
for (const c of chambers) console.log([c.st, c.b, String(c.chamberSize ?? '-').padStart(4), String(c.upIn2026 ?? '-').padStart(4), String(c._stats.races).padStart(5), String(c._stats.members).padStart(4), String(c._stats.called).padStart(6), String(c._stats.uncalled).padStart(8), String(c._stats.fromBoxes).padStart(3), String(c._stats.fromTables).padStart(3), c.seats ? JSON.stringify(c.seats) : '-'].join(' '));
const tot = chambers.reduce((a, c) => [a[0] + c._stats.members, a[1] + c._stats.called], [0, 0]);
console.log(`chambers ${chambers.length}, members ${tot[0]}, called ${tot[1]}; notes ${notes.length}; wrote ${OUT}`);
