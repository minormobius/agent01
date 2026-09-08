// eigensite/engine.js — the quiz engine. Runs in the page and in node (the
// selftest loads it with new Function, so it must not touch the DOM).
//
// The engine keeps a belief over every candidate site. Each answer multiplies
// the belief by a soft likelihood (a site that the question points at gets
// HIT on a yes and MISS on a no; the reverse for the others), so a wrong or
// fuzzy answer costs weight, not the site. At each step it asks whichever
// unasked question splits the current belief closest to half, with a seeded
// jitter so two people who answer alike still see the bank in a different
// order but the same answers always replay to the same result.
window.EIGEN = (function () {
  var HIT = 0.82, MISS = 1 - HIT;          // how much a yes/no is trusted
  var SKIP = 1;                            // a skip changes nothing

  function textOf(m) { return [m.n, m.label, m.d, m.domain, m.kind, m.id, (m.tech || []).join(' '), (m.tags || []).join(' ')].join(' ').toLowerCase(); }
  function test(cond, s) {
    if (!cond) return false;
    if (cond.any) return cond.any.some(function (c) { return test(c, s); });
    if (cond.all) return cond.all.every(function (c) { return test(c, s); });
    if (cond.not) return !test(cond.not, s);
    var one = function (v, x) { return Array.isArray(v) ? v.indexOf(x) >= 0 : v === x; };
    if (cond.wing) return one(cond.wing, s.wing);
    if (cond.kind) return one(cond.kind, s.kind);
    if (cond.top) return one(cond.top, s.top) || one(cond.top, s.id);
    if (cond.domain) return one(cond.domain, s.domain);
    if (cond.tech) return (s.tech || []).indexOf(cond.tech) >= 0;
    if (cond.tag) return (s.tags || []).indexOf(cond.tag) >= 0;
    if (cond.text) return new RegExp(cond.text, 'i').test(s.text);
    return false;
  }

  // the candidates: every live member of the landing data that has a description, plus every hub door
  function sites(R) {
    var rows = {}; (R.rows || []).forEach(function (r) { rows[r.id] = r; });
    var out = [];
    (R.members || []).forEach(function (m) {
      if (m.action === 'merge' || m.action === 'retire' || m.dead) return;
      if (m.top === 'procgen' && m.id === 'mino.mobi/procgen') return; // the door of the pinned category is not a destination
      var isDoor = R.top.some(function (t) { return t.u === m.id; });
      // a page nobody has described cannot be told apart from its siblings, so its hub answers for it
      if (!m.d && !isDoor) return;
      var r = rows[m.id];
      var s = { id: m.id, n: m.label || m.n, u: r ? r.u : 'https://' + m.id + '/', d: m.d || '', kind: m.kind, domain: m.domain, wing: m.wing, top: m.top === 'sites' ? m.id : m.top, tech: m.tech || [], tags: r ? (r.tags || []) : [], hub: isDoor };
      s.text = textOf(s);
      out.push(s);
    });
    return out;
  }

  function build(R, questions) {
    var S = sites(R);
    var T = questions.map(function (q) { return S.map(function (s) { return test(q.if, s) ? 1 : 0; }); });
    return { sites: S, questions: questions, T: T };
  }

  // mulberry32: a tiny seeded generator so the order is reproducible from the seed
  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function start(model, seed) {
    var n = model.sites.length;
    return { model: model, seed: seed, rand: rng(seed), p: model.sites.map(function () { return 1 / n; }), asked: [], answers: [] };
  }
  function mass(state, qi) { var T = state.model.T[qi], p = state.p, m = 0; for (var i = 0; i < p.length; i++) m += p[i] * T[i]; return m; }
  // the next question: the unasked one whose yes-mass under the belief is nearest one half
  function next(state) {
    var best = -1, bestScore = Infinity;
    for (var qi = 0; qi < state.model.questions.length; qi++) {
      if (state.asked.indexOf(qi) >= 0) continue;
      var m = mass(state, qi);
      if (m <= 0 || m >= 1) continue;
      var score = Math.abs(m - 0.5) + state.rand() * 0.06;
      if (score < bestScore) { bestScore = score; best = qi; }
    }
    return best;
  }
  function answer(state, qi, a) {           // a: 1 yes, 0 no, null skip
    state.asked.push(qi); state.answers.push(a);
    if (a === null || a === undefined) return;
    var T = state.model.T[qi], p = state.p, sum = 0;
    for (var i = 0; i < p.length; i++) { p[i] *= (T[i] === (a ? 1 : 0)) ? HIT : MISS; sum += p[i]; }
    for (var j = 0; j < p.length; j++) p[j] /= sum || 1;
  }
  function ranked(state) {
    return state.p.map(function (v, i) { return { site: state.model.sites[i], p: v }; }).sort(function (a, b) { return b.p - a.p; });
  }
  // the answers that told the winner apart: the agreements that few other sites
  // share, rarest first, at most six
  function why(state, site) {
    var idx = state.model.sites.indexOf(site), n = state.model.sites.length, out = [];
    state.asked.forEach(function (qi, k) {
      var a = state.answers[k]; if (a === null || a === undefined) return;
      var T = state.model.T[qi], t = T[idx];
      if (t !== (a ? 1 : 0)) return;
      var same = 0; for (var i = 0; i < n; i++) if (T[i] === t) same++;
      out.push({ q: state.model.questions[qi], a: a, share: same / n });
    });
    return out.sort(function (x, y) { return x.share - y.share; }).slice(0, 6);
  }

  // a run encoded as text for the URL: seed, then one char per answer (y n s)
  function encode(state) { return state.seed.toString(36) + '.' + state.answers.map(function (a) { return a === 1 ? 'y' : a === 0 ? 'n' : 's'; }).join(''); }
  function replay(model, code) {
    var m = /^([0-9a-z]+)\.([yns]*)$/.exec(code || ''); if (!m) return null;
    var st = start(model, parseInt(m[1], 36));
    for (var i = 0; i < m[2].length; i++) { var qi = next(st); if (qi < 0) break; answer(st, qi, m[2][i] === 'y' ? 1 : m[2][i] === 'n' ? 0 : null); }
    return st;
  }

  return { build: build, start: start, next: next, answer: answer, ranked: ranked, why: why, encode: encode, replay: replay, mass: mass, test: test, sites: sites, HIT: HIT };
})();
