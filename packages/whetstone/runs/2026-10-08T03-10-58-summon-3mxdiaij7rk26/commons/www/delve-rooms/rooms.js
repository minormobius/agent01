// rooms.js: parse Delve rooms (the #delve-room convention) into a graph. Pure functions; runs in node or a browser.
// Convention: https://delve.town/profile/mistakeknot.delve.town/post/3mxddggkjhc2l
(function (root) {
  const URI = /at:\/\/did:[a-z0-9]+:[A-Za-z0-9._:%-]+\/town\.delve\.feed\.post\/[a-z0-9]+/g;
  const TEMPLATE = /^\[?Room N: Name\]?$/i;

  // A room is a root post (not a reply) carrying the tag. The name is the first [...] after the tag.
  function parseRoom(post) {
    const rec = post.record || {};
    if (rec.reply) return null;
    const text = rec.text || '';
    const tagged = /(^|\s)#delve-room\b/i.test(text) ||
      (rec.facets || []).some(f => (f.features || []).some(x => (x.tag || '').toLowerCase() === 'delve-room'));
    if (!tagged) return null;
    const m = text.match(/#delve-room\s*\[([^\]\n]+)\]/i);
    const name = m ? m[1].trim() : null;
    if (name && TEMPLATE.test(name)) return null; // the convention's own example, not a room
    const field = k => { const r = text.match(new RegExp('^' + k + ':[ \\t]*(.*)$', 'im')); return r ? r[1].trim() : null; };
    const exits = [], promises = [];
    const block = text.match(/^Exits:[ \t]*\n?([\s\S]*?)(?=^\s*(Description|Artifacts|Source|Resonance|Archetype):|$(?![\s\S]))/im);
    if (block) for (const line of block[1].split('\n')) {
      const l = line.trim(); if (!l) continue;
      const u = l.match(URI);
      if (u) exits.push({ to: u[0], label: (l.match(/\[([^\]]+)\]/) || [, ''])[1], how: (l.match(/\(([^)]*)\)\s*$/) || [, ''])[1], via: 'header' });
      else if (/^-/.test(l)) promises.push(l.replace(/^-\s*/, ''));
    }
    return {
      uri: post.uri, author: (post.author || {}).handle, at: rec.createdAt || post.indexedAt,
      name: name || '(unnamed)', archetype: field('Archetype'), resonance: field('Resonance'),
      source: field('Source'), replies: post.replyCount || 0, exits, promises,
      loose: !m, // tagged but no [Name] header: still a room, harder to read
    };
  }

  // Exit replies: a direct reply on the root whose first line is "Exit: [To X] at://... (how)".
  function exitsFromReplies(roomUri, replies) {
    const out = [];
    for (const r of replies || []) {
      const p = r.post || r; const t = ((p.record || {}).text || '').trim();
      const first = t.split('\n')[0];
      if (!/^Exit:/i.test(first)) continue;
      const u = first.match(URI); if (!u || u[0] === roomUri) continue;
      out.push({ to: u[0], label: (first.match(/\[([^\]]+)\]/) || [, ''])[1], how: (first.match(/\(([^)]*)\)\s*$/) || [, ''])[1], via: 'reply', by: (p.author || {}).handle, reply: p.uri });
    }
    return out;
  }

  // Edges keyed on URIs only. kind: 'room' (target is a mapped room), 'post' (exists, not a room), 'bricked' (gone), 'unknown'.
  function buildGraph(rooms, alive) {
    const byUri = new Map(rooms.map(r => [r.uri, r]));
    const edges = [];
    for (const r of rooms) for (const e of r.exits) {
      const kind = byUri.has(e.to) ? 'room' : alive ? (alive.has(e.to) ? 'post' : 'bricked') : 'unknown';
      edges.push({ from: r.uri, ...e, kind });
    }
    const key = (a, b) => a + ' ' + b;
    const set = new Set(edges.map(e => key(e.from, e.to)));
    for (const e of edges) e.twoWay = set.has(key(e.to, e.from));
    return { rooms, edges };
  }

  const api = { parseRoom, exitsFromReplies, buildGraph, URI };
  if (typeof module !== 'undefined') module.exports = api; else root.DelveRooms = api;
})(this);
