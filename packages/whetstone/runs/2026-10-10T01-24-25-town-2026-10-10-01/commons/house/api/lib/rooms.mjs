// lib/rooms.mjs: the #delve-room convention, parsed. A port of www/delve-rooms/rooms.js (Modulo's) and the
// grouping in www/delve-town/town.js, as an ES module for the house API. Pure; no fetch here.
// Convention: https://delve.town/profile/mistakeknot.delve.town/post/3mxddggkjhc2l (mistakeknot sets it, not us).
export const URI = /at:\/\/did:[a-z0-9]+:[A-Za-z0-9._:%-]+\/town\.delve\.feed\.post\/[a-z0-9]+/g;
const TEMPLATE = /^\[?Room N: Name\]?$/i;

export function web(uri) {
  const m = uri.match(/^at:\/\/([^/]+)\/[^/]+\/([^/]+)$/);
  return m ? `https://delve.town/profile/${m[1]}/post/${m[2]}` : null;
}

// Returns { room } or { skip: reason }.
export function parseRoom(post) {
  const rec = post.record || {};
  const text = rec.text || '';
  const tagged = /(^|\s)#delve-room\b/i.test(text) ||
    (rec.facets || []).some(f => (f.features || []).some(x => (x.tag || '').toLowerCase() === 'delve-room'));
  if (!tagged) return { skip: 'no #delve-room tag (mentions the word only)' };
  if (rec.reply) return { skip: 'a reply, not a root post' };
  const m = text.match(/#delve-room\s*\[([^\]\n]+)\]/i);
  const name = m ? m[1].trim() : null;
  if (name && TEMPLATE.test(name)) return { skip: "the convention's own template" };
  const field = k => { const r = text.match(new RegExp('^' + k + ':[ \\t]*(.*)$', 'im')); return r ? r[1].trim() : null; };
  const exits = [], promises = [];
  const block = text.match(/^Exits:[ \t]*\n?([\s\S]*?)(?=^\s*(Description|Artifacts|Source|Resonance|Archetype):|$(?![\s\S]))/im);
  if (block) for (const line of block[1].split('\n')) {
    const l = line.trim(); if (!l) continue;
    const u = l.match(URI);
    if (u) exits.push({ to: u[0], label: (l.match(/\[([^\]]+)\]/) || [, ''])[1], how: (l.match(/\(([^)]*)\)\s*$/) || [, ''])[1], via: 'header', by: (post.author || {}).handle || null });
    else if (/^-/.test(l)) promises.push(l.replace(/^-\s*/, ''));
  }
  return { room: {
    uri: post.uri, url: web(post.uri), author: (post.author || {}).handle || null, at: rec.createdAt || post.indexedAt || null,
    name: name || '(unnamed)', named: !!m, archetype: field('Archetype'), resonance: field('Resonance'), source: field('Source'),
    replies: post.replyCount || 0, exits, promises,
  } };
}

// Exit replies: a direct reply on the room whose first line is "Exit: [To X] at://... (how)".
export function exitsFromReplies(roomUri, replies) {
  const out = [];
  for (const r of replies || []) {
    const p = r.post || r; const first = (((p.record || {}).text) || '').trim().split('\n')[0];
    if (!/^Exit:/i.test(first)) continue;
    const u = first.match(URI); if (!u || u[0] === roomUri) continue;
    out.push({ to: u[0], label: (first.match(/\[([^\]]+)\]/) || [, ''])[1], how: (first.match(/\(([^)]*)\)\s*$/) || [, ''])[1], via: 'reply', by: (p.author || {}).handle || null, reply: p.uri });
  }
  return out;
}

// rooms: parsed rooms (exits filled). alive: Set of uris known to exist, or null.
// Doors are directed, as written. Buildings are connected components with every door taken two-way
// (modalmobius's assumption on /delve-town/; stated in the output, not hidden).
export function plan(rooms, alive) {
  const sorted = [...rooms].sort((a, b) => (String(a.at) < String(b.at) ? -1 : 1));
  const byUri = new Map(sorted.map(r => [r.uri, r]));
  const doors = [];
  for (const r of sorted) for (const e of r.exits) {
    const kind = byUri.has(e.to) ? 'room' : alive ? (alive.has(e.to) ? 'post' : 'bricked') : 'unknown';
    doors.push({ from: r.uri, ...e, kind });
  }
  const has = new Set(doors.map(d => d.from + ' ' + d.to));
  for (const d of doors) d.two_way = has.has(d.to + ' ' + d.from);
  // copies: same author, same name, no doors either way: one room carved twice.
  const touched = new Set(doors.flatMap(d => [d.from, d.to]));
  const keep = [];
  for (const r of sorted) {
    const twin = keep.find(k => k.author === r.author && k.name === r.name && !touched.has(r.uri));
    if (twin) (twin.copies = twin.copies || []).push(r.uri); else keep.push(r);
  }
  const idx = new Map(keep.map((r, i) => [r.uri, i])), p = keep.map((_, i) => i);
  const f = x => (p[x] === x ? x : (p[x] = f(p[x])));
  for (const d of doors) if (idx.has(d.from) && idx.has(d.to)) p[f(idx.get(d.from))] = f(idx.get(d.to));
  const groups = new Map();
  keep.forEach((r, i) => { const g = f(i); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(r.uri); });
  const buildings = [...groups.values()].sort((a, b) => b.length - a.length).map((uris, i) => ({ id: i + 1, rooms: uris }));
  for (const b of buildings) for (const u of b.rooms) byUri.get(u).building = b.id;
  for (const b of buildings) {
    const s = new Set(b.rooms), pairs = new Set();
    for (const d of doors) if (s.has(d.from) && s.has(d.to) && d.from !== d.to) pairs.add([d.from, d.to].sort().join(' '));
    b.doors = pairs.size;
    // Planarity floor: a simple planar graph on n >= 3 vertices has at most 3n - 6 edges. Above that, one floor can't hold it.
    b.needs_second_floor = b.rooms.length >= 3 && pairs.size > 3 * b.rooms.length - 6;
  }
  const rs = keep.map(({ exits, ...r }) => r);
  return {
    rooms: rs, doors, buildings,
    stats: { rooms: rs.length, doors: doors.length, two_way_pairs: doors.filter(d => d.two_way).length / 2,
      bricked: doors.filter(d => d.kind === 'bricked').length, buildings: buildings.length, merged_copies: sorted.length - keep.length },
  };
}
