// rethink/space.js — the radial tree of every reachable endpoint. Shared by
// /rethink/ (the hero of the audit) and /next/ (the prototype landing).
// Draws into an <svg viewBox="0 0 1240 900"> from window.RETHINK and returns
// a small API the page uses for hover, click and dimming.
//
// Rings, from the centre: the wings (the landing's first level), then the hubs
// and standalone sites inside each wing, then the pages inside each hub, then
// content beneath those. Wings are labelled in the margins; hub names come on
// hover (pass hubLabels:true to draw them along the arcs).
//
//   var api = MINO_SPACE.draw(svgEl, window.RETHINK, { hideInternal: true });
//   api.nodes[id], api.wings, api.leaves(n), api.pathOf(n), api.focus(n), api.dim(fn), api.nodeAt(e)
window.MINO_SPACE = (function () {
  var LIGHT = { bluesky: '#3E9AC2', procgen: '#4E9C2E', oneill: '#237E7A', play: '#D64C77', study: '#C77F16', bench: '#7B5FD6', about: '#6B7280' };
  var DARK = { bluesky: '#6EC1E4', procgen: '#67C23A', oneill: '#4FC3BE', play: '#F56991', study: '#E6A23C', bench: '#A880FF', about: '#9AA0AE' };

  function draw(svg, R, opts) {
    opts = opts || {};
    var css = getComputedStyle(document.documentElement);
    function ink(v) { return css.getPropertyValue(v).trim(); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var WING = dark ? DARK : LIGHT;
    var INTERNAL = ink('--ink-3'), BAD = ink('--bad');
    var wingsDef = (R.wings || []).slice();
    var topById = {}; R.top.forEach(function (t) { topById[t.id] = t; });

    // ---- tree: landing -> wing -> hub | site -> page -> content
    var nodes = {}, rootNode = { id: 'landing', n: 'mino.mobi', u: 'https://mino.mobi/', children: [], depth: 0, fate: 'landing' };
    function add(n) { nodes[n.id] = n; n.children = n.children || []; return n; }
    var wings = wingsDef.map(function (w) { return add({ id: 'wing:' + w.id, wing: w.id, n: w.label, short: w.id, u: '', fate: 'wing', pinned: !!w.pinned, blurb: w.blurb || '', group: true }); });
    var internalWing = add({ id: 'wing:internal', wing: 'internal', n: 'served by accident', short: 'internal', u: '', fate: 'internal', group: true });
    var orphanWing = add({ id: 'wing:orphan', wing: 'orphan', n: 'unplaced', short: 'unplaced', u: '', fate: 'orphan', group: true });
    R.top.forEach(function (t) {
      if (t.id === 'sites') return;
      var h = add({ id: t.id, n: t.label, u: 'https://' + t.u + '/', kind: t.kind, wing: t.wing, fate: 'door', pinned: t.pinned, hub: true });
      var w = nodes['wing:' + t.wing] || orphanWing; h.parent = w; w.children.push(h);
    });
    var items = R.space.slice().sort(function (a, b) { return (a.fate === 'content' ? 1 : 0) - (b.fate === 'content' ? 1 : 0); });
    items.forEach(function (s) {
      if (s.fate === 'folded') return;
      if (opts.hideInternal && (s.fate === 'internal' || s.fate === 'orphan')) return;
      if (s.fate === 'door' && nodes[s.top]) { nodes[s.top].u = s.u; nodes[s.top].dead = s.dead || ''; return; }
      var n = add({ id: s.id, n: s.n, u: s.u, kind: s.kind, wing: s.wing, fate: s.fate, p: s.p, why: s.why, top: s.top, dead: s.dead || '' });
      var parent;
      if (s.fate === 'internal') parent = internalWing;
      else if (s.fate === 'orphan') parent = orphanWing;
      else if (s.fate === 'site') parent = nodes['wing:' + s.wing] || orphanWing;
      else parent = nodes[s.via] || nodes[s.top] || nodes['wing:' + s.wing] || orphanWing;
      if (parent === n) parent = nodes[s.top] || rootNode;
      n.parent = parent; parent.children.push(n);
    });
    function leaves(n) { if (n._l != null) return n._l; n._l = n.children.length ? n.children.reduce(function (a, c) { return a + leaves(c); }, 0) + 1 : 1; return n._l; }
    var allWings = wings.concat(internalWing, orphanWing).filter(function (w) { return w.children.length; });
    allWings.forEach(leaves);
    allWings.sort(function (a, b) {
      var rank = function (w) { return w.fate === 'internal' ? 3 : w.fate === 'orphan' ? 4 : w.pinned ? 0 : 1; };
      return rank(a) - rank(b) || wingsDef.findIndex(function (x) { return x.id === a.wing; }) - wingsDef.findIndex(function (x) { return x.id === b.wing; });
    });
    // inside a wing: hubs first, largest first, then the standalone sites
    allWings.forEach(function (w) { w.children.sort(function (a, b) { return (b.hub ? 1 : 0) - (a.hub ? 1 : 0) || leaves(b) - leaves(a); }); });
    rootNode.children = allWings; allWings.forEach(function (w) { w.parent = rootNode; });
    var total = allWings.reduce(function (a, w) { return a + leaves(w); }, 0);

    // ---- layout
    var cx = 620, cy = 450, R0 = 66;
    var RING = [0, 58, 150, 206, 240, 262, 278], MAXD = RING.length - 1;
    function assign(n, a0, a1, depth) {
      n.a0 = a0; n.a1 = a1; n.depth = depth;
      var a = a0, span = a1 - a0, L = leaves(n) - 1;
      n.children.forEach(function (c) { var w = span * leaves(c) / (L || 1); assign(c, a, a + w, depth + 1); a += w; });
    }
    assign(rootNode, -Math.PI / 2, Math.PI * 1.5, 0);
    function arc(r0, r1, a0, a1) {
      if (a1 - a0 >= Math.PI * 2 - 1e-6) a1 = a0 + Math.PI * 2 - 1e-4;
      var x0 = cx + r0 * Math.cos(a0), y0 = cy + r0 * Math.sin(a0), x1 = cx + r1 * Math.cos(a0), y1 = cy + r1 * Math.sin(a0);
      var x2 = cx + r1 * Math.cos(a1), y2 = cy + r1 * Math.sin(a1), x3 = cx + r0 * Math.cos(a1), y3 = cy + r0 * Math.sin(a1);
      var big = (a1 - a0) > Math.PI ? 1 : 0;
      return 'M' + x0.toFixed(1) + ',' + y0.toFixed(1) + 'L' + x1.toFixed(1) + ',' + y1.toFixed(1) + 'A' + r1 + ',' + r1 + ' 0 ' + big + ' 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1) + 'L' + x3.toFixed(1) + ',' + y3.toFixed(1) + 'A' + r0 + ',' + r0 + ' 0 ' + big + ' 0 ' + x0.toFixed(1) + ',' + y0.toFixed(1) + 'Z';
    }
    function wingOf(n) { var g = n; while (g.parent && g.parent !== rootNode) g = g.parent; return g; }
    function hubOf(n) { var g = n; while (g.parent && g.parent.parent && g.parent.parent !== rootNode) g = g.parent; return g; }
    function colorOf(n) {
      var w = wingOf(n);
      if (w.fate === 'internal') return INTERNAL; if (w.fate === 'orphan') return BAD;
      return WING[w.wing] || WING.about;
    }
    var out = [], all = [];
    (function drawNode(n) {
      if (n !== rootNode) {
        var d = Math.min(n.depth, MAXD), r0 = R0 + RING[d - 1] + (d > 1 ? 2 : 0), r1 = R0 + RING[d] - (d === 1 ? 0 : 1);
        var w = wingOf(n);
        // alternate the hubs inside a wing so neighbours separate; pages and content fade with depth
        var alt = d === 2 && n.parent ? (n.parent.children.indexOf(n) % 2 ? 0.66 : 0.86) : 1;
        var op = w.fate === 'internal' ? 0.22 : w.fate === 'orphan' ? 0.9 : d === 1 ? 0.95 : d === 2 ? alt : d === 3 ? 0.42 : 0.24;
        n.el = all.length; all.push(n);
        out.push('<path d="' + arc(r0, r1, n.a0, n.a1) + '" fill="' + (n.dead ? BAD : colorOf(n)) + '" fill-opacity="' + (n.dead ? 0.95 : op) + '" stroke="' + ink('--bg') + '" stroke-width="' + (d <= 2 ? 1.4 : 0.5) + '" data-i="' + n.el + '"/>');
      }
      n.children.forEach(drawNode);
    })(rootNode);

    // ---- hub names: along the arc when it is long enough, else radially when the
    // sector is wide enough at its inner edge; the rest are hover-only
    var mono = css.getPropertyValue('--mono'), display = css.getPropertyValue('--display');
    var arcLabels = [], defs = [];
    var rIn = R0 + RING[1] + 2, rOut = R0 + RING[2] - 1, rm = (rIn + rOut) / 2;
    allWings.forEach(function (w) {
      if (!opts.hubLabels) return; // off by default: the names are small at this size and the hover carries them
      if (w.fate === 'internal' || w.fate === 'orphan') return;
      w.children.forEach(function (h) {
        var span = h.a1 - h.a0, txt = h.n, mid = (h.a0 + h.a1) / 2;
        var wAlong = txt.length * 7.2 + 10, wRadial = txt.length * 6.6 + 8;
        if (span * rm >= wAlong) {
          var flip = Math.sin(mid) > 0;
          var a0 = flip ? h.a1 : h.a0, a1 = flip ? h.a0 : h.a1, sweep = flip ? 0 : 1, rr = flip ? rm + 4 : rm - 4;
          var x0 = cx + rr * Math.cos(a0), y0 = cy + rr * Math.sin(a0), x1 = cx + rr * Math.cos(a1), y1 = cy + rr * Math.sin(a1);
          var id = 'arc-' + h.el;
          defs.push('<path id="' + id + '" d="M' + x0.toFixed(1) + ',' + y0.toFixed(1) + 'A' + rr + ',' + rr + ' 0 ' + (span > Math.PI ? 1 : 0) + ' ' + sweep + ' ' + x1.toFixed(1) + ',' + y1.toFixed(1) + '" fill="none"/>');
          arcLabels.push('<text font-family="' + mono + '" font-size="12" font-weight="600" fill="' + ink('--bg') + '" fill-opacity="0.95" data-i="' + h.el + '"><textPath href="#' + id + '" startOffset="50%" text-anchor="middle" dominant-baseline="middle">' + esc(txt) + '</textPath></text>');
        } else if (span * rIn >= 12.5 && wRadial <= (rOut - rIn) - 6) {
          // radial: rotate the text to the sector's mid angle; on the left half turn it so it still reads outward
          var deg = mid * 180 / Math.PI, left = Math.cos(mid) < 0;
          var rx = cx + (left ? rOut - 4 : rIn + 4) * Math.cos(mid), ry = cy + (left ? rOut - 4 : rIn + 4) * Math.sin(mid);
          arcLabels.push('<text font-family="' + mono + '" font-size="11" font-weight="600" fill="' + ink('--bg') + '" fill-opacity="0.95" data-i="' + h.el + '" text-anchor="' + (left ? 'end' : 'start') + '" dominant-baseline="middle" transform="rotate(' + deg.toFixed(1) + ' ' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ')' + (left ? ' rotate(180 ' + rx.toFixed(1) + ' ' + ry.toFixed(1) + ')' : '') + '" x="' + rx.toFixed(1) + '" y="' + ry.toFixed(1) + '">' + esc(txt) + '</text>');
        }
      });
    });

    // ---- wing labels: a column each side, pushed apart, with leader lines
    var LR = R0 + RING[MAXD];
    var labs = allWings.map(function (w) {
      var a = (w.a0 + w.a1) / 2;
      return { w: w, right: Math.cos(a) >= 0, y: cy + (LR + 26) * Math.sin(a), x0: cx + (LR + 3) * Math.cos(a), y0: cy + (LR + 3) * Math.sin(a) };
    });
    [true, false].forEach(function (right) {
      var L = labs.filter(function (l) { return l.right === right; }).sort(function (a, b) { return a.y - b.y; });
      var gap = 40, y = 30;
      L.forEach(function (l) { l.y = Math.max(l.y, y); y = l.y + gap; });
      var yb = 900 - 30;
      for (var i = L.length - 1; i >= 0; i--) { L[i].y = Math.min(L[i].y, yb); yb = L[i].y - gap; }
    });
    var labels = labs.map(function (l) {
      var w = l.w, xt = l.right ? cx + LR + 40 : cx - LR - 40, xk = l.right ? cx + LR + 28 : cx - LR - 28;
      var col = w.fate === 'internal' ? INTERNAL : w.fate === 'orphan' ? BAD : WING[w.wing];
      var anchor = l.right ? 'start' : 'end';
      return '<polyline points="' + l.x0.toFixed(1) + ',' + l.y0.toFixed(1) + ' ' + xk + ',' + l.y.toFixed(1) + ' ' + (l.right ? xt - 6 : xt + 6) + ',' + l.y.toFixed(1) + '" fill="none" stroke="' + ink('--line') + '" stroke-width="1.2"/>'
        + '<text x="' + xt + '" y="' + (l.y - 4).toFixed(1) + '" text-anchor="' + anchor + '" dominant-baseline="auto" fill="' + ink('--ink') + '" font-family="' + display + '" font-size="17" font-weight="700" data-i="' + w.el + '">' + esc(w.n) + '</text>'
        + '<text x="' + xt + '" y="' + (l.y + 14).toFixed(1) + '" text-anchor="' + anchor + '" fill="' + col + '" font-family="' + mono + '" font-size="11" data-i="' + w.el + '">' + (leaves(w) - 1) + ' pages · ' + w.children.filter(function (c) { return c.hub; }).length + ' hubs</text>';
    }).join('');
    var centre = opts.centre || 'mino.mobi';
    svg.innerHTML = '<defs>' + defs.join('') + '</defs><g class="sun-arcs">' + out.join('') + '</g><g class="sun-arclabels">' + arcLabels.join('') + '</g><g class="sun-labels">' + labels + '</g>'
      + '<circle cx="' + cx + '" cy="' + cy + '" r="' + (R0 - 4) + '" fill="' + ink('--paper') + '" stroke="' + ink('--line') + '"/>'
      + '<text x="' + cx + '" y="' + (cy - 6) + '" text-anchor="middle" font-family="' + display + '" font-weight="700" font-size="16" fill="' + ink('--ink') + '">' + esc(centre) + '</text>'
      + '<text x="' + cx + '" y="' + (cy + 13) + '" text-anchor="middle" font-family="' + mono + '" font-size="10" fill="' + ink('--ink-3') + '">' + ((R.summary.space || {}).reachable || total) + ' pages</text>';

    var arcs = svg.querySelector('.sun-arcs');
    function pathOf(n) { var p = []; while (n && n !== rootNode) { p.unshift(n); n = n.parent; } return p; }
    function dim(keep) {
      Array.prototype.forEach.call(arcs.children, function (el) { el.style.opacity = keep && !keep(all[+el.dataset.i]) ? 0.14 : ''; });
    }
    function focus(n) {
      var keepSet = {};
      pathOf(n).forEach(function (x) { keepSet[x.el] = 1; });
      (function mark(x) { keepSet[x.el] = 1; x.children.forEach(mark); })(n);
      dim(function (x) { return keepSet[x.el]; });
    }
    function nodeAt(e) { var t = e.target.closest('[data-i]'); return t ? all[+t.dataset.i] : null; }
    // highlight(pred): the nodes pred() picks are outlined and kept bright, their
    // ancestors kept, everything else dimmed; highlight(null) clears
    var HALO = ink('--ink');
    function highlight(pred) {
      var keep = {}, hit = {};
      if (pred) all.forEach(function (n) { if (pred(n)) { hit[n.el] = 1; pathOf(n).forEach(function (x) { keep[x.el] = 1; }); } });
      Array.prototype.forEach.call(arcs.children, function (el) {
        var i = +el.dataset.i;
        el.style.opacity = pred && !keep[i] ? 0.12 : '';
        if (hit[i]) { el.setAttribute('stroke', HALO); el.setAttribute('stroke-width', '2'); el.style.fillOpacity = 1; el.parentNode.appendChild(el); }
        else { el.setAttribute('stroke', ink('--bg')); el.setAttribute('stroke-width', all[i].depth <= 2 ? '1.4' : '0.5'); el.style.fillOpacity = ''; }
      });
      return Object.keys(hit).length;
    }
    return { svg: svg, nodes: nodes, wings: allWings, all: all, rootNode: rootNode, leaves: leaves, pathOf: pathOf, dim: dim, focus: focus, highlight: highlight, nodeAt: nodeAt, WING: WING, wingOf: wingOf, hubOf: hubOf };
  }
  return { draw: draw, LIGHT: LIGHT, DARK: DARK };
})();
