/* borges — THE READER. Mounts a generated tale into the seven-tab apparatus.

   The graph machinery (pan/zoom, the Propp spine, the motif index, the
   character web, and the force-directed mythograph) is ported straight from
   the annotated tales on read.mino.mobi — the apparatus the user pointed at —
   and pointed at a generated tale instead of a hand-annotated one. Added on
   top: the prose Telling, the Tabard spec sheet (the blueprint the robot posts
   before it speaks), per-teller theming, and the endless Prev / Random / Next.

   Reads BORGES.tale (set by boot() from the page number in the URL). */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var B = NS.BORGES = NS.BORGES || {};
  var T = null; // the current tale

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (tag, cls, html) { var n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  var NSVG = "http://www.w3.org/2000/svg";
  var svgEl = function (tag, attrs) { var n = document.createElementNS(NSVG, tag); if (attrs) for (var k in attrs) n.setAttribute(k, attrs[k]); return n; };
  var escapeHtml = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };
  function toRoman(n) { var m = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"]; return m[n] || ("" + n); }

  /* ───────────── pan/zoom (shared by the SVG diagrams) ───────────── */
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var zoomers = {};
  function attachZoom(svg, layer, content, host) {
    var k = 1, tx = 0, ty = 0; var MIN = 0.2, MAX = 9;
    var apply = function () { layer.setAttribute("transform", "translate(" + tx + " " + ty + ") scale(" + k + ")"); };
    function fit() {
      var cw = host.clientWidth || 800, ch = host.clientHeight || 600;
      if (typeof content === "function") {
        var b = content(), m = 50;
        k = clamp(Math.min(cw / (b.w + m * 2), ch / (b.h + m * 2)), MIN, 1.4);
        tx = (cw - b.w * k) / 2 - b.x * k; ty = (ch - b.h * k) / 2 - b.y * k;
      } else { k = Math.min(1.4, cw / content); tx = Math.max(0, (cw - content * k) / 2); ty = 6; }
      apply();
    }
    function zoomAt(mx, my, f) { var nk = clamp(k * f, MIN, MAX); tx = mx - (mx - tx) * (nk / k); ty = my - (my - ty) * (nk / k); k = nk; apply(); }
    svg.addEventListener("wheel", function (e) { e.preventDefault(); var r = svg.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
    var pts = new Map(), pinch = null;
    svg.addEventListener("pointerdown", function (e) { pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { svg.setPointerCapture(e.pointerId); } catch (_) {} });
    svg.addEventListener("pointermove", function (e) {
      if (!pts.has(e.pointerId)) return;
      var prev = pts.get(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      var arr = Array.from(pts.values());
      if (arr.length === 1) { tx += e.clientX - prev.x; ty += e.clientY - prev.y; apply(); }
      else if (arr.length >= 2) {
        var r = svg.getBoundingClientRect(), a = arr[0], b = arr[1];
        var dist = Math.hypot(a.x - b.x, a.y - b.y);
        var midx = (a.x + b.x) / 2 - r.left, midy = (a.y + b.y) / 2 - r.top;
        if (pinch) { zoomAt(midx, midy, dist / pinch.dist); tx += midx - pinch.midx; ty += midy - pinch.midy; apply(); }
        pinch = { dist: dist, midx: midx, midy: midy };
      }
    });
    var release = function (e) { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; };
    svg.addEventListener("pointerup", release); svg.addEventListener("pointercancel", release);
    var ctr = el("div", "zoom-controls");
    var mk = function (txt, fn) { var b = el("button", "zbtn", txt); b.type = "button"; b.onclick = fn; ctr.appendChild(b); return b; };
    var center = function (f) { zoomAt(host.clientWidth / 2, host.clientHeight / 2, f); };
    mk("+", function () { center(1.35); }); mk("−", function () { center(1 / 1.35); }); mk("⤢", function () { fit(); });
    host.appendChild(ctr); fit();
    return { fit: fit };
  }

  /* ───────────── THE FRAME (interstitial, aboard the Tabard) ───────────── */
  function renderInterstitial() {
    var host = $("#interstitial"); if (!host) return;
    if (!B.interstitial) { host.style.display = "none"; return; }
    var it = B.interstitial(T.n);
    var nibble = it.frameBeat ? ('<div class="inter-nibble">The wheel’s own beat tonight: <span class="nb-sym">' + escapeHtml(it.frameBeat.sym) + '</span> ' + escapeHtml(it.frameBeat.name) + ' — ' + escapeHtml(it.frameBeat.meaning) + ' <a href="/#frame-mytho">the frame’s mythograph →</a></div>') : "";
    var foot = it.tellerInPair
      ? "And so, from inside it, " + escapeHtml(T.teller.name) + " " + T.teller.glyph + " took up the watch and began."
      : "And " + escapeHtml(T.teller.name) + " " + T.teller.glyph + " took up the watch, and began.";
    host.innerHTML =
      '<div class="inter-head"><span class="inter-sig">⟜</span> Aboard the <em>Tabard</em> · watch ' + T.n + ' · ' + it.phaseName + ' moon' + (it.tellerInPair ? ' · <span class="inter-stake">the teller is in it</span>' : '') + '</div>' +
      '<div class="inter-body">' + it.text + '</div>' +
      nibble +
      '<div class="inter-foot">' + foot + ' <a href="/#argument">the Argument of the voyage →</a></div>';
  }

  /* ───────────── THE LIVE TELLING (optional inference render, cached on atproto) ─────────────
     The procedural telling is canonical and always rendered first. If a live render
     exists (a com.minomobi.borges.telling record), we swap it in; otherwise the
     reader can summon one. Any failure stays silently on the procedural draft. */
  var proceduralHTML = "";
  // the service account whose repo holds the frozen tellings (resolved once, public).
  // Reads are unauthed and CORS-open, so the book pulls its own records directly.
  var TELLING = "com.minomobi.borges.telling", BANTER = "com.minomobi.borges.banter";
  var SERVICE = { did: "did:plc:yivyyp54vddf7qf2lpsikhe4", pds: "https://chalciporus.us-west.host.bsky.network" };
  function apiCall(path, opts) {
    return fetch(path, opts).then(function (r) { return r.json().then(function (j) { return { status: r.status, json: j }; }); });
  }
  function pullRecord(collection, n) {
    if (typeof fetch === "undefined") return Promise.resolve(null);
    var u = SERVICE.pds + "/xrpc/com.atproto.repo.getRecord?repo=" + encodeURIComponent(SERVICE.did) + "&collection=" + collection + "&rkey=" + n;
    return fetch(u).then(function (r) { return r.status === 200 ? r.json().then(function (j) { return j.value || null; }) : null; }).catch(function () { return null; });
  }
  function setupLive() {
    var bar = $("#live-bar"); if (!bar) return;
    bar.innerHTML = ""; proceduralHTML = $("#telling").innerHTML;
    if (typeof fetch === "undefined") { if (T.n === 1 && B.exemplar) renderLive(B.exemplar); return; }
    pullRecord(TELLING, T.n).then(function (rec) {
      if (rec && rec.movements && rec.movements.length) renderLive(rec);   // the book reads its own atproto record
      else if (T.n === 1 && B.exemplar) renderLive(B.exemplar);            // hand-authored fallback before seeding
      else showSummon();                                                   // offer to summon (worker → Gemini → atproto)
    });
  }
  function showSummon() {
    var bar = $("#live-bar"); bar.innerHTML = "";
    var wrap = el("div", "live-summon");
    wrap.appendChild(el("span", "live-note", "This telling is still " + escapeHtml(T.teller.name) + "’s rough draft. "));
    var btn = el("button", "nav-btn", "✦ Let " + escapeHtml(T.teller.name) + " " + T.teller.glyph + " tell it live");
    btn.onclick = function () { summon(btn); };
    wrap.appendChild(btn); bar.appendChild(wrap);
  }
  function summon(btn) {
    btn.disabled = true; btn.textContent = T.teller.name + " is telling…";
    var pr = B.promptFor ? B.promptFor(T, B.interstitial ? B.interstitial(T.n) : null) : null;
    if (!pr) { btn.textContent = "— cannot build the prompt"; return; }
    apiCall("/api/telling", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pr) })
      .then(function (res) {
        if (res.json && res.json.record && res.json.record.movements && res.json.record.movements.length) renderLive(res.json.record);
        else { btn.disabled = false; btn.textContent = (res.json && res.json.error) ? ("— " + res.json.error) : "— the telling did not come; try again"; }
      }).catch(function () { btn.disabled = false; btn.textContent = "— the telling did not come; try again"; });
  }
  function renderLive(telling) {
    var host = $("#telling"); host.innerHTML = "";
    (telling.movements || []).forEach(function (mv, i) {
      host.appendChild(el("h2", "mvt-title", escapeHtml(mv.title || ("Movement " + (i + 1)))));
      String(mv.body || "").split(/\n\n+/).forEach(function (para, j) {
        var pp = el("p", (i === 0 && j === 0) ? "lead-para" : null);
        pp.innerHTML = (j === 0) ? dropCap(escapeHtml(para)) : escapeHtml(para);
        host.appendChild(pp);
      });
    });
    var bar = $("#live-bar"); bar.innerHTML = "";
    var badge = el("div", "live-badge");
    badge.innerHTML = "✦ told live by " + escapeHtml(telling.teller || T.teller.name) + " " + T.teller.glyph +
      ' <span class="live-model">' + escapeHtml(telling.model || "") + "</span> · <a class=\"live-toggle\">show the procedural draft</a>";
    bar.appendChild(badge);
    var tg = $(".live-toggle", badge); if (tg) tg.onclick = function () { showProcedural(); };
    window.scrollTo({ top: 0 });
  }
  function showProcedural() {
    $("#telling").innerHTML = proceduralHTML;
    var bar = $("#live-bar"); bar.innerHTML = "";
    var note = el("div", "live-badge", "the procedural draft · <a class=\"live-toggle\">show the live telling</a>");
    bar.appendChild(note);
    var tg = $(".live-toggle", note); if (tg) tg.onclick = function () {
      apiCall("/api/telling/" + T.n).then(function (res) { if (res.json && res.json.record) renderLive(res.json.record); else showSummon(); });
    };
  }

  /* ───────────── THE BANTER (second inference pass: the crew before the telling) ─────────────
     Turns the interstitial's description of the tension into a short live scene —
     the teller and the two in tension trading lines, cached as a
     com.minomobi.borges.banter record. Optional; degrades to nothing. */
  function glyphFor(name) { var t = (B.tellers && B.tellers.list || []).filter(function (x) { return x.name === name; })[0]; return t ? t.glyph : ""; }
  function colorFor(name) { var t = (B.tellers && B.tellers.list || []).filter(function (x) { return x.name === name; })[0]; return t ? t.color : "var(--ink-faint)"; }
  function setupBanter() {
    var bar = $("#banter-bar"); if (!bar || typeof fetch === "undefined" || !B.promptForBanter) return;
    bar.innerHTML = "";
    pullRecord(BANTER, T.n).then(function (rec) {
      if (rec && rec.lines && rec.lines.length) renderBanter(rec); // pulled from atproto
      else showBanterSummon();
    });
  }
  function showBanterSummon() {
    var bar = $("#banter-bar"); bar.innerHTML = "";
    var s = el("div", "banter-summon");
    var btn = el("a", "banter-cue", "✦ let them speak first");
    btn.onclick = function () { summonBanter(btn); };
    s.appendChild(btn); bar.appendChild(s);
  }
  function summonBanter(btn) {
    btn.textContent = "…";
    var pr = B.promptForBanter(T, B.interstitial ? B.interstitial(T.n) : null);
    if (!pr) { btn.remove(); return; }
    apiCall("/api/banter", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(pr) })
      .then(function (res) { if (res.json && res.json.record && res.json.record.lines && res.json.record.lines.length) renderBanter(res.json.record); else btn.textContent = "✦ let them speak first"; })
      .catch(function () { btn.textContent = "✦ let them speak first"; });
  }
  function renderBanter(banter) {
    var bar = $("#banter-bar"); bar.innerHTML = "";
    var scene = el("div", "banter-scene");
    scene.appendChild(el("div", "banter-head", "Before the telling, at the long table"));
    (banter.lines || []).forEach(function (l) {
      var row = el("div", "banter-line");
      row.innerHTML = '<span class="banter-who" style="color:' + colorFor(l.speaker) + '">' + escapeHtml(l.speaker) + " " + glyphFor(l.speaker) + '</span><span class="banter-said">' + escapeHtml(l.line) + "</span>";
      scene.appendChild(row);
    });
    bar.appendChild(scene);
  }

  /* ───────────── THE TELLING (prose reader) ───────────── */
  function dropCap(t) { return String(t).replace(/^((?:<[^>]+>)*\s*[“"'(]?\s*)(\S)/, function (m, a, b) { return a + '<span class="dropcap">' + b + '</span>'; }); }
  function renderTelling() {
    var meta = $("#tale-meta"); meta.innerHTML = "";
    meta.appendChild(el("div", "tale-blurb", T.tale.meta.blurb));
    var host = $("#telling"); host.innerHTML = "";
    T.tale.passages.forEach(function (pass, pi) {
      var h = el("h2", "mvt-title", pass.title + (pass.act ? ' <span class="mvt-tag">' + escapeHtml(actLabel(pass.act)) + "</span>" : ""));
      h.id = "mvt-" + (pi + 1); host.appendChild(h);
      pass.segments.forEach(function (seg, si) {
        var p = el("p", (pi === 0 && si === 0) ? "lead-para" : null);
        p.innerHTML = (si === 0) ? dropCap(seg.e) : seg.e;
        host.appendChild(p);
      });
    });
  }
  function actLabel(act) { var a = T.propp.acts.filter(function (x) { return x.id === act; })[0]; return a ? a.label : act; }

  /* ───────────── THE TABARD (the spec posted before the telling) ───────────── */
  function renderTabard() {
    var host = $("#tabard"); host.innerHTML = "";
    host.appendChild(el("div", "tabard-note",
      "A robot is a structured thing, and likes to publish its blueprint first. Before " + escapeHtml(T.teller.name) +
      " spoke a word of tale № " + T.n + ", it posted this mythograph to the ship's Tabard, at the permalink below. The telling came after."));

    var grid = el("div", "spec-grid");
    function cell(k, v) { var c = el("div", "spec-cell"); c.appendChild(el("div", "k", k)); c.appendChild(el("div", "v", v)); grid.appendChild(c); }
    cell("Teller", T.teller.glyph + " " + escapeHtml(T.teller.name) + " <small>" + escapeHtml(T.teller.planet) + " · " + escapeHtml(T.teller.metal) + "</small>");
    cell("Pattern", escapeHtml(T.frame.label));
    cell("Furniture", escapeHtml(T.cultureLabel) + (T.secondaryCultureLabel ? " <small>× " + escapeHtml(T.secondaryCultureLabel) + "</small>" : ""));
    cell("Movements", "" + T.movementCount);
    cell("Cast", "" + T.characters.cast.length + " <small>roles</small>");
    cell("Shaken loose", T.remixes.length ? T.remixes.length + ' <small>see Story-graph</small>' : "0 <small>told straight</small>");
    host.appendChild(grid);

    var perma = el("div", "spec-perma");
    perma.innerHTML = "Intranet permalink: <code>borges.mino.mobi/t/" + T.n + "</code> &nbsp;·&nbsp; seed <code>" + escapeHtml(T.seed) + "</code>";
    host.appendChild(perma);

    host.appendChild(el("div", "k", '<span style="font-family:var(--sans);font-size:10.5px;letter-spacing:.07em;color:var(--ink-faint);text-transform:uppercase">The Propp skeleton</span>'));
    var skel = el("div", "skel");
    T.propp.moves.forEach(function (m, i) {
      var chip = el("span", "skel-beat" + (m.inverted ? " inv" : ""));
      chip.innerHTML = '<span class="sy">' + escapeHtml(m.sym) + "</span> " + escapeHtml(m.name) + (m.inverted ? " ↻" : "");
      chip.title = m.gloss; chip.style.cursor = "pointer";
      chip.onclick = function () { switchView("propp"); setTimeout(function () { var c = $("#propp-move-" + i); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 50); };
      skel.appendChild(chip);
    });
    host.appendChild(skel);

    if (T.themes && T.themes.length) {
      host.appendChild(el("div", "k", '<span style="font-family:var(--sans);font-size:10.5px;letter-spacing:.07em;color:var(--ink-faint);text-transform:uppercase">Oral set-pieces to expand</span>'));
      var ths = el("div", "skel");
      T.themes.forEach(function (th) { var c = el("span", "skel-beat"); c.innerHTML = escapeHtml(th.label); c.title = th.note; ths.appendChild(c); });
      host.appendChild(ths);
    }
    if (T.actant) {
      var dz = el("p", "spec-desire");
      dz.innerHTML = "<strong>" + escapeHtml(T.actant.subject) + "</strong> desires <strong>" + escapeHtml(T.actant.object) + "</strong> — beneath the plot, <em>" + escapeHtml(T.actant.value) + "</em>. <a class=\"desire-link\">the axis of desire →</a>";
      host.appendChild(dz);
      var dl = $(".desire-link", dz); if (dl) dl.onclick = function () { switchView("desire"); };
    }
    host.appendChild(el("p", "tree-hint", "Each beat is a Propp function; violet beats marked ↻ are the ones " + escapeHtml(T.teller.name) + " ran backwards for the joke of it. The full apparatus — story-graph, motif index, cast, character web, the axis of desire, and the synergistic mythograph — is what this blueprint expands into across the other tabs."));
  }

  /* ───────────── DESIRE (Greimas actantial model) ───────────── */
  function renderDesire() {
    var A = T.actant; if (!A) return;
    $("#desire-intro").innerHTML = "Beneath the morphology runs the engine the morphology brackets out: <strong>desire</strong>. Greimas read every tale as six actants on three axes — a Subject who wants an Object, a Sender who sets it moving toward a Receiver, and a Helper and an Opponent who aid and block the wanting. Here is tonight's, read off the cast.";
    var W = 760, H = 380, NW = 188, NH = 62;
    var pos = {
      sender: { x: 130, y: 78 }, object: { x: 380, y: 78 }, receiver: { x: 630, y: 78 },
      helper: { x: 130, y: 300 }, subject: { x: 380, y: 300 }, opponent: { x: 630, y: 300 }
    };
    var label = {
      sender: ["Sender", A.sender], object: ["Object", A.object], receiver: ["Receiver", A.receiver],
      helper: ["Helper", A.helpers.length ? A.helpers.join(", ") : "(none on the road)"], subject: ["Subject", A.subject], opponent: ["Opponent", A.opponent]
    };
    var svg = svgEl("svg", { class: "desire", viewBox: "0 0 " + W + " " + H, preserveAspectRatio: "xMidYMid meet" });
    var defs = svgEl("defs"); var mk = svgEl("marker", { id: "dar", viewBox: "0 0 10 10", refX: 9, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    mk.appendChild(svgEl("path", { d: "M0 0 L10 5 L0 10 z", fill: "#8a7f6b" })); defs.appendChild(mk); svg.appendChild(defs);
    function edge(a, b, dashed) {
      var A1 = pos[a], B1 = pos[b]; var x1 = A1.x, y1 = A1.y, x2 = B1.x, y2 = B1.y;
      if (y1 === y2) { var d = x2 > x1 ? 1 : -1; x1 += d * NW / 2; x2 -= d * NW / 2; }
      else { var dy = y2 > y1 ? 1 : -1; y1 += dy * NH / 2; y2 -= dy * NH / 2; }
      svg.appendChild(svgEl("line", { x1: x1, y1: y1, x2: x2, y2: y2, stroke: "#8a7f6b", "stroke-width": 1.6, "stroke-dasharray": dashed ? "6 5" : "0", "marker-end": "url(#dar)" }));
    }
    edge("sender", "object"); edge("object", "receiver");
    edge("helper", "subject"); edge("opponent", "subject");
    edge("subject", "object", A.unreachable); // the desire arrow — dashed when it cannot reach
    // axis labels
    svg.appendChild(txt(W / 2, 30, "the axis of transmission", "desire-axis"));
    svg.appendChild(txt(W - 150, H / 2, A.unreachable ? "desire (it cannot reach)" : "the axis of desire", "desire-axis"));
    svg.appendChild(txt(W / 2, H - 14, "the axis of power", "desire-axis"));
    Object.keys(pos).forEach(function (k) {
      var p = pos[k], col = k === "subject" ? "#d6a93f" : k === "object" ? "#c98aa6" : k === "opponent" ? "#c25b4a" : "#6fa8c9";
      var g = svgEl("g");
      g.appendChild(svgEl("rect", { x: p.x - NW / 2, y: p.y - NH / 2, width: NW, height: NH, rx: 9, fill: col, "fill-opacity": 0.14, stroke: col, "stroke-width": 1.5 }));
      g.appendChild(txt(p.x, p.y - 11, label[k][0].toUpperCase(), "desire-role", col));
      var nm = label[k][1]; if (nm.length > 26) nm = nm.slice(0, 25).replace(/\s\S*$/, "") + "…";
      g.appendChild(txt(p.x, p.y + 10, nm, "desire-name"));
      svg.appendChild(g);
    });
    var host = $("#desire-host"); host.innerHTML = ""; host.appendChild(svg);
    var pr = $("#desire-prose");
    var s = "<strong>" + escapeHtml(A.subject) + "</strong> desires <strong>" + escapeHtml(A.object) + "</strong> — which is, beneath the plot, <em>" + escapeHtml(A.value) + "</em>. " +
      "It is set in motion by <strong>" + escapeHtml(A.sender) + "</strong>, for <strong>" + escapeHtml(A.receiver) + "</strong>. " +
      (A.helpers.length ? "<strong>" + escapeHtml(A.helpers.join(" and ")) + "</strong> aid the wanting; " : "No helper aids the wanting; ") +
      "<strong>" + escapeHtml(A.opponent) + "</strong> stands against it.";
    if (A.unreachable) s += " And here is the tragic shape, written in the actants: the Object <em>is</em> escape from the Opponent — so the arrow of desire points at the one thing it can never reach. A wheel, not an arc; the want with no liquidation.";
    pr.innerHTML = s;
  }
  function txt(x, y, s, cls, fill) { var t = svgEl("text", { x: x, y: y, "text-anchor": "middle", class: cls }); if (fill) t.setAttribute("fill", fill); t.textContent = s; return t; }

  /* ───────────── CHARACTERS ───────────── */
  function renderCharacters() {
    var ch = T.characters;
    $("#char-intro").innerHTML = ch.intro;
    var roleColor = {}, present = {};
    ch.cast.forEach(function (c) { present[c.role] = true; });
    ch.roles.forEach(function (r) { roleColor[r.id] = r.color; });
    var leg = $("#char-legend"); leg.innerHTML = "";
    ch.roles.forEach(function (r) { if (present[r.id]) leg.appendChild(el("span", "li", '<span class="dot" style="background:' + r.color + '"></span>' + r.label)); });
    var byId = {}; ch.cast.forEach(function (c) { byId[c.id] = c; });
    var host = $("#char-groups"); host.innerHTML = "";
    ch.roles.forEach(function (role) {
      var members = ch.cast.filter(function (c) { return c.role === role.id; });
      if (!members.length) return;
      host.appendChild(el("div", "char-rolehead", role.label));
      var grid = el("div", "char-grid");
      members.forEach(function (c) {
        var col = roleColor[c.role] || "#c9a24a";
        var card = el("div", "char-card"); card.id = "char-" + c.id; card.style.borderLeftColor = col;
        var head = "<h3>" + escapeHtml(c.name) + "</h3>";
        if (c.epithet) head += '<div class="char-sub">' + escapeHtml(c.epithet) + "</div>";
        card.innerHTML = head + '<div class="char-blurb">' + c.blurb + "</div>";
        if (c.appears && c.appears.length) {
          var ap = el("div", "char-appears", "Appears in: ");
          c.appears.forEach(function (n, i) { var a = el("a", null, "Mvt " + toRoman(n)); a.setAttribute("data-passage", n); ap.appendChild(a); if (i < c.appears.length - 1) ap.appendChild(document.createTextNode(" · ")); });
          card.appendChild(ap);
        }
        if (c.rel && c.rel.length) {
          var rl = el("div", "char-rels");
          c.rel.forEach(function (r) { var target = byId[r.to]; if (!target) return; var chip = el("a", "char-rel"); chip.setAttribute("data-char", r.to); chip.innerHTML = '<span class="rel-label">' + escapeHtml(r.label) + "</span> " + escapeHtml(target.name); rl.appendChild(chip); });
          card.appendChild(rl);
        }
        grid.appendChild(card);
      });
      host.appendChild(grid);
    });
  }

  /* ───────────── CHARACTER WEB ───────────── */
  function webRadius(role) { return (role === "hero" || role === "heroine") ? 13 : (role === "villain" || role === "elder") ? 10 : 9; }
  function renderWeb() {
    var ch = T.characters;
    var roleColor = {}; ch.roles.forEach(function (r) { roleColor[r.id] = r.color; });
    var leg = $("#web-legend"); leg.innerHTML = "";
    var present = {}; ch.cast.forEach(function (c) { present[c.role] = true; });
    ch.roles.forEach(function (r) { if (present[r.id]) leg.appendChild(el("span", "li", '<span class="dot" style="background:' + r.color + '"></span>' + r.label)); });

    var nodes = ch.cast.map(function (c) { return { id: c.id, name: c.name, role: c.role, color: roleColor[c.role] || "#c9a24a" }; });
    var idx = {}; nodes.forEach(function (n, i) { idx[n.id] = i; });
    var seen = {}, edges = [];
    ch.cast.forEach(function (c) { (c.rel || []).forEach(function (r) { if (idx[r.to] == null) return; var key = [c.id, r.to].sort().join("|"); if (seen[key]) return; seen[key] = 1; edges.push({ a: idx[c.id], b: idx[r.to], label: r.label }); }); });

    var W = 1000, H = 720, k = Math.sqrt((W * H) / Math.max(1, nodes.length)) * 0.72;
    nodes.forEach(function (n, i) { var a = 2 * Math.PI * i / nodes.length; n.x = W / 2 + Math.cos(a) * W * 0.32; n.y = H / 2 + Math.sin(a) * H * 0.32; });
    var temp = W * 0.1;
    for (var it = 0; it < 320; it++) {
      nodes.forEach(function (n) { n.dx = 0; n.dy = 0; });
      for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++) {
        var dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        var f = k * k / d, ux = dx / d, uy = dy / d;
        nodes[i].dx += ux * f; nodes[i].dy += uy * f; nodes[j].dx -= ux * f; nodes[j].dy -= uy * f;
      }
      edges.forEach(function (e) { var A = nodes[e.a], B = nodes[e.b]; var dx = A.x - B.x, dy = A.y - B.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01; var f = d * d / k, ux = dx / d, uy = dy / d; A.dx -= ux * f; A.dy -= uy * f; B.dx += ux * f; B.dy += uy * f; });
      nodes.forEach(function (n) { n.dx += (W / 2 - n.x) * 0.02; n.dy += (H / 2 - n.y) * 0.02; });
      nodes.forEach(function (n) { var d = Math.sqrt(n.dx * n.dx + n.dy * n.dy) || 0.01, m = Math.min(d, temp); n.x += n.dx / d * m; n.y += n.dy / d * m; });
      temp *= 0.97;
    }
    var minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    nodes.forEach(function (n) { minx = Math.min(minx, n.x); miny = Math.min(miny, n.y); maxx = Math.max(maxx, n.x); maxy = Math.max(maxy, n.y); });
    var pad = 46; nodes.forEach(function (n) { n.x = n.x - minx + pad; n.y = n.y - miny + pad; });
    var contentW = maxx - minx + pad * 2;

    var svg = svgEl("svg", { class: "web" }), layer = svgEl("g", { class: "zl" }); svg.appendChild(layer);
    var edgeEls = [], adj = {};
    edges.forEach(function (e, ei) {
      var A = nodes[e.a], Bn = nodes[e.b];
      var line = svgEl("line", { class: "web-edge", x1: A.x, y1: A.y, x2: Bn.x, y2: Bn.y });
      var t = svgEl("title"); t.textContent = A.name + " — " + e.label + " — " + Bn.name; line.appendChild(t);
      layer.appendChild(line); edgeEls.push(line);
      (adj[e.a] = adj[e.a] || []).push(ei); (adj[e.b] = adj[e.b] || []).push(ei);
    });
    var nodeEls = [];
    nodes.forEach(function (n, i) {
      var r = webRadius(n.role);
      var g = svgEl("g", { class: "web-node" });
      g.appendChild(svgEl("circle", { cx: n.x, cy: n.y, r: r, fill: n.color, "fill-opacity": 0.85, stroke: "#0c0d12", "stroke-width": 1.5 }));
      var label = svgEl("text", { class: "web-label", x: n.x, y: n.y + r + 12, "text-anchor": "middle", "font-size": 11 }); label.textContent = n.name; g.appendChild(label);
      g.addEventListener("mouseenter", function () { hi(i, true); });
      g.addEventListener("mouseleave", function () { hi(i, false); });
      g.addEventListener("click", function () { switchView("characters"); var c = $("#char-" + n.id); if (c) setTimeout(function () { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }, 30); });
      layer.appendChild(g); nodeEls.push(g);
    });
    function hi(i, on) {
      if (!on) { edgeEls.forEach(function (l) { l.classList.remove("hot"); }); nodeEls.forEach(function (g) { g.classList.remove("dim"); }); return; }
      var keep = new Set([i]); (adj[i] || []).forEach(function (ei) { keep.add(edges[ei].a); keep.add(edges[ei].b); });
      edgeEls.forEach(function (l, ei) { if (edges[ei].a === i || edges[ei].b === i) l.classList.add("hot"); });
      nodeEls.forEach(function (g, gi) { if (!keep.has(gi)) g.classList.add("dim"); });
    }
    var host = $("#web-host"); host.innerHTML = ""; host.appendChild(svg);
    zoomers.web = attachZoom(svg, layer, contentW, host);
  }

  /* ───────────── STORY GRAPH (Propp) ───────────── */
  function renderPropp() {
    var PR = T.propp;
    $("#propp-intro").innerHTML = PR.intro;
    var actColor = {}; PR.acts.forEach(function (a) { actColor[a.id] = a.color; });
    var leg = $("#propp-legend"); leg.innerHTML = "";
    PR.acts.forEach(function (a) { leg.appendChild(el("span", "li", '<span class="dot" style="background:' + a.color + '"></span>' + a.label)); });

    var moves = PR.moves, n = moves.length;
    var NW = 104, NH = 40, SX = 124, padX = 20, padTop = 38;
    var contentW = padX * 2 + (n - 1) * SX + NW;
    var cx = function (i) { return padX + NW / 2 + i * SX; }, cy = padTop + NH / 2;
    var svg = svgEl("svg", { class: "propp" }), layer = svgEl("g", { class: "zl" }); svg.appendChild(layer);
    for (var i = 0; i < n - 1; i++) layer.appendChild(svgEl("path", { class: "propp-arrow", d: "M " + (cx(i) + NW / 2) + " " + cy + " L " + (cx(i + 1) - NW / 2) + " " + cy, "marker-end": "url(#parr)" }));
    var defs = svgEl("defs"); var mk = svgEl("marker", { id: "parr", viewBox: "0 0 10 10", refX: 8, refY: 5, markerWidth: 7, markerHeight: 7, orient: "auto-start-reverse" });
    mk.appendChild(svgEl("path", { d: "M0 0 L10 5 L0 10 z", fill: "#7d7a6c" })); defs.appendChild(mk); layer.appendChild(defs);
    moves.forEach(function (m, i) {
      var col = m.inverted ? "#9a86c4" : (actColor[m.act] || "#c9a24a");
      var g = svgEl("g", { class: "propp-node" });
      g.appendChild(svgEl("rect", { x: cx(i) - NW / 2, y: cy - NH / 2, width: NW, height: NH, rx: 8, fill: col, "fill-opacity": 0.16, stroke: col, "stroke-dasharray": m.inverted ? "4 3" : "0" }));
      var sym = svgEl("text", { x: cx(i) - NW / 2 + 17, y: cy + 6, "text-anchor": "middle", "font-size": 15, fill: col, "font-style": "italic" }); sym.textContent = m.sym; g.appendChild(sym);
      var lbl = svgEl("text", { x: cx(i) + 8, y: cy + 5, "text-anchor": "middle", "font-size": 11.5, fill: "#e6e2d6" }); lbl.textContent = m.node; g.appendChild(lbl);
      var ttl = svgEl("title"); ttl.textContent = m.sym + " — " + m.name + (m.inverted ? " (inverted)" : ""); g.appendChild(ttl);
      g.addEventListener("click", function () { var c = $("#propp-move-" + i); if (c) { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); } });
      layer.appendChild(g);
    });
    var host = $("#propp-spine"); host.innerHTML = ""; host.appendChild(svg);
    zoomers.propp = attachZoom(svg, layer, contentW, host);

    var cards = $("#propp-cards"); cards.innerHTML = ""; var lastAct = null;
    moves.forEach(function (m, i) {
      if (m.act !== lastAct) { var a = PR.acts.filter(function (x) { return x.id === m.act; })[0]; cards.appendChild(el("div", "propp-act", a ? a.label : m.act)); lastAct = m.act; }
      var col = m.inverted ? "#9a86c4" : (actColor[m.act] || "#c9a24a");
      var card = el("div", "propp-move"); card.id = "propp-move-" + i;
      var badge = el("div", "propp-badge", m.sym); badge.style.color = col; badge.style.borderColor = col; card.appendChild(badge);
      var main = el("div");
      main.appendChild(el("div", "propp-name", escapeHtml(m.name) + ' <span class="propp-sym">' + escapeHtml(m.sym) + "</span>" + (m.inverted ? ' <span class="inv-tag">inverted ↻</span>' : "")));
      main.appendChild(el("div", "propp-gloss", m.gloss));
      main.appendChild(el("div", "propp-realized", m.realized));
      var j = el("div", "propp-jump"); var a2 = el("a", null, "→ Movement " + toRoman(m.passage)); a2.setAttribute("data-passage", m.passage); j.appendChild(a2); main.appendChild(j);
      card.appendChild(main); cards.appendChild(card);
    });

    var ab = $("#propp-absent"); ab.innerHTML = "";
    ab.appendChild(el("h3", null, "What " + escapeHtml(T.teller.name) + " shook loose"));
    ab.appendChild(el("p", "propp-abnote", PR.absent.note));
    PR.absent.groups.forEach(function (gp) { var row = el("div", "propp-abgroup"); row.innerHTML = '<span class="propp-absyms">' + escapeHtml(gp.syms) + "</span> <strong>" + escapeHtml(gp.label) + "</strong> — " + gp.text; ab.appendChild(row); });
    ab.appendChild(el("p", "propp-verdict", PR.absent.verdict));
  }

  /* ───────────── MOTIF INDEX ───────────── */
  function confLabel(c) { return c === "high" ? "well-attested" : c === "med" ? "interpretive" : "speculative"; }
  function renderMotifs() {
    var M = T.motifs;
    $("#motif-intro").innerHTML = M.intro;
    var tt = $("#motif-taletypes"); tt.innerHTML = "";
    M.taletypes.forEach(function (t) {
      var card = el("div", "tt-card");
      card.innerHTML = '<div class="tt-head"><span class="tt-code">' + escapeHtml(t.code) + '</span><span class="conf conf-' + t.conf + '">' + confLabel(t.conf) + '</span></div><div class="tt-name">' + escapeHtml(t.name) + '</div><div class="tt-gloss">' + t.gloss + "</div>";
      tt.appendChild(card);
    });
    var host = $("#motif-groups"); host.innerHTML = "";
    M.classOrder.forEach(function (cl) {
      var items = M.list.filter(function (m) { return m.cls === cl; }); if (!items.length) return;
      host.appendChild(el("div", "motif-classhead", '<span class="motif-clsletter">' + cl + "</span> " + (M.classes[cl] || "")));
      items.forEach(function (m) {
        var row = el("div", "motif-row");
        row.appendChild(el("div", "motif-badge", escapeHtml(m.code || m.cls)));
        var main = el("div");
        main.appendChild(el("div", "motif-name", escapeHtml(m.name) + ' <span class="conf conf-' + m.conf + '">' + confLabel(m.conf) + "</span>"));
        main.appendChild(el("div", "motif-gloss", m.gloss));
        if (m.passages && m.passages.length) {
          var ap = el("div", "motif-ex", "Exhibited in: ");
          m.passages.forEach(function (n, i) { var a = el("a", null, "Mvt " + toRoman(n)); a.setAttribute("data-passage", n); ap.appendChild(a); if (i < m.passages.length - 1) ap.appendChild(document.createTextNode(" · ")); });
          main.appendChild(ap);
        }
        row.appendChild(main); host.appendChild(row);
      });
    });
  }

  /* ───────────── THE MYTHOGRAPH ───────────── */
  function buildMythograph() {
    var nodes = [], edges = [], id2i = {};
    var add = function (id, full, label, type, link, preview) { id2i[id] = nodes.length; nodes.push({ id: id, full: full, label: label, type: type, link: link, preview: preview }); };
    T.tale.passages.forEach(function (p, i) { var n = i + 1; add("mv-" + n, p.title.replace(/^[IVX]+\.\s*/, ""), toRoman(n), "movement", { passage: n }, (p.segments[p.segments.length > 1 ? 1 : 0] || {}).e || ""); });
    T.characters.cast.forEach(function (c) { add("ch-" + c.id, c.name, c.name, "character", { char: c.id }, c.blurb || ""); });
    T.motifs.list.forEach(function (m, i) { add("mo-" + i, (m.code || m.cls) + " — " + m.name, m.code || m.cls, "motif", { tab: "motifs" }, m.gloss || ""); });
    T.propp.moves.forEach(function (mv, i) { add("pp-" + i, mv.sym + " · " + mv.name, mv.sym, "propp", { tab: "propp", anchor: "propp-move-" + i }, mv.realized || ""); });
    var edge = function (a, b, type) { if (id2i[a] == null || id2i[b] == null) return; edges.push({ a: id2i[a], b: id2i[b], type: type }); };
    T.characters.cast.forEach(function (c) { (c.appears || []).forEach(function (n) { edge("ch-" + c.id, "mv-" + n, "appears"); }); });
    var seen = {}; T.characters.cast.forEach(function (c) { (c.rel || []).forEach(function (r) { var k = [c.id, r.to].sort().join("|"); if (seen[k]) return; seen[k] = 1; edge("ch-" + c.id, "ch-" + r.to, "relates"); }); });
    T.motifs.list.forEach(function (m, i) { (m.passages || []).forEach(function (n) { edge("mo-" + i, "mv-" + n, "exhibits"); }); });
    T.propp.moves.forEach(function (mv, i) { edge("pp-" + i, "mv-" + mv.passage, "realizes"); });
    for (var i = 1; i < T.tale.passages.length; i++) edge("mv-" + i, "mv-" + (i + 1), "spine");
    return { nodes: nodes, edges: edges };
  }
  var MYTH_TYPE = {
    movement: { color: "#c9a24a", label: "Movements", r: 17 },
    character: { color: "#6fa8c9", label: "Characters", r: 9 },
    motif: { color: "#c97f9a", label: "Motifs", r: 6 },
    propp: { color: "#7fb37f", label: "Functions", r: 6 }
  };
  var MYTH_EDGE = { spine: "#d8b24a", appears: "#6fa8c9", relates: "#9a8fd0", exhibits: "#c97f9a", realizes: "#7fb37f" };

  function renderMythograph() {
    var g = buildMythograph(), nodes = g.nodes, edges = g.edges;
    var active = { movement: true, character: true, motif: true, propp: true };
    var mobile = (window.innerWidth || 900) < 640;
    var R = function (n) { return MYTH_TYPE[n.type].r; };
    var selected = null, selGroup = null, grown = [];
    var alpha = 1, running = false, simReady = false;
    var sim = { L: 90, charge: -1000 };

    var fhost = $("#myth-filters"); fhost.innerHTML = "";
    Object.keys(MYTH_TYPE).forEach(function (t) {
      var b = el("button", "myth-filter active", '<span class="dot" style="background:' + MYTH_TYPE[t].color + '"></span>' + MYTH_TYPE[t].label);
      b.onclick = function () { active[t] = !active[t]; b.classList.toggle("active", active[t]); applyVis(); };
      fhost.appendChild(b);
    });
    var sliders = el("div", "myth-sliders");
    function addSlider(labelTxt, min, max, val, onIn) {
      var wrap = el("div", "myth-slider"); wrap.appendChild(el("label", null, labelTxt));
      var inp = document.createElement("input"); inp.type = "range"; inp.min = min; inp.max = max; inp.value = val;
      var out = el("span", "myth-slval", "");
      inp.addEventListener("input", function () { onIn(+inp.value, out); reheat(); });
      wrap.appendChild(inp); wrap.appendChild(out); onIn(+inp.value, out); sliders.appendChild(wrap);
    }
    addSlider("Link length", 0, 100, 32, function (v, out) { sim.L = 24 + v * 2.4; out.textContent = Math.round(sim.L); });
    addSlider("Repulsion", 0, 100, 46, function (v, out) { sim.charge = -(60 + v * 26); out.textContent = v; });
    fhost.appendChild(sliders);

    var leg = $("#myth-legend"); leg.innerHTML = "";
    [["spine", "narrative spine (I → " + toRoman(T.movementCount) + ")"], ["appears", "character → movement"], ["relates", "character ↔ character"], ["exhibits", "motif → movement"], ["realizes", "function → movement"]]
      .forEach(function (pair) { leg.appendChild(el("span", "li", '<span class="edgekey' + (pair[0] === "spine" ? " edgekey-spine" : "") + '" style="background:' + MYTH_EDGE[pair[0]] + '"></span>' + pair[1])); });

    nodes.forEach(function (n, i) { var a = 2 * Math.PI * i / nodes.length; n.x = Math.cos(a) * 160; n.y = Math.sin(a) * 160; n.vx = 0; n.vy = 0; });
    var svg = svgEl("svg", { class: "myth" }), layer = svgEl("g", { class: "zl" }); svg.appendChild(layer);
    var edgeObjs = [], adj = {};
    edges.forEach(function (e, ei) {
      var sp = e.type === "spine";
      var line = svgEl("line", { class: sp ? "myth-spine" : "", stroke: MYTH_EDGE[e.type], "stroke-opacity": sp ? 0.72 : 0.22, "stroke-width": sp ? 2.6 : 1 });
      layer.appendChild(line); edgeObjs.push(line);
      (adj[e.a] = adj[e.a] || []).push(ei); (adj[e.b] = adj[e.b] || []).push(ei);
    });
    var nodeObjs = [], shapes = [];
    nodes.forEach(function (n, i) {
      var TY = MYTH_TYPE[n.type];
      var grp = svgEl("g", { class: "myth-node", transform: "translate(" + n.x + " " + n.y + ")" });
      var shapeEl, tag;
      if (n.type === "movement") {
        shapeEl = svgEl("rect", { x: -TY.r, y: -TY.r, width: TY.r * 2, height: TY.r * 2, rx: 5, fill: TY.color, "fill-opacity": 0.9, stroke: "#0c0d12", "stroke-width": 1.5 });
        grp.appendChild(shapeEl); tag = "rect";
        var lab = svgEl("text", { x: 0, y: 5, "text-anchor": "middle", "font-size": 13, fill: "#0c0d12", "font-weight": "700" }); lab.textContent = n.label; grp.appendChild(lab);
      } else {
        shapeEl = svgEl("circle", { cx: 0, cy: 0, r: TY.r, fill: TY.color, "fill-opacity": 0.85, stroke: "#0c0d12", "stroke-width": 1.2 });
        grp.appendChild(shapeEl); tag = "circle";
      }
      shapes.push({ el: shapeEl, tag: tag, r: TY.r });
      var ttl = svgEl("title"); ttl.textContent = n.full; grp.appendChild(ttl);
      grp.addEventListener("mouseenter", function () { highlight(i); });
      grp.addEventListener("mouseleave", function () { selected != null ? highlight(selected) : clearHi(); });
      grp.addEventListener("click", function () { select(i); });
      layer.appendChild(grp); nodeObjs.push(grp);
    });

    function highlight(i) {
      var keep = new Set([i]), inc = new Set();
      (adj[i] || []).forEach(function (ei) { inc.add(ei); keep.add(edges[ei].a); keep.add(edges[ei].b); });
      edgeObjs.forEach(function (l, ei) { l.classList.toggle("hot", inc.has(ei)); });
      nodeObjs.forEach(function (gp, ni) { gp.classList.toggle("dim", active[nodes[ni].type] && !keep.has(ni)); });
    }
    function clearHi() { edgeObjs.forEach(function (l) { l.classList.remove("hot"); }); nodeObjs.forEach(function (gp) { gp.classList.remove("dim"); }); }
    function applyVis() {
      nodeObjs.forEach(function (gp, ni) { gp.style.display = active[nodes[ni].type] ? "" : "none"; });
      edgeObjs.forEach(function (l, ei) { l.style.display = (active[nodes[edges[ei].a].type] && active[nodes[edges[ei].b].type]) ? "" : "none"; });
    }
    var stripTags = function (s) { return String(s || "").replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&mdash;/g, "—").replace(/&[a-z]+;/g, " ").trim(); };
    var truncate = function (s, n) { return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s; };
    function wrapText(s, max) { var w = s.split(/\s+/), lines = [], cur = ""; w.forEach(function (word) { if ((cur + " " + word).trim().length > max) { if (cur) lines.push(cur); cur = word; } else cur = (cur + " " + word).trim(); }); if (cur) lines.push(cur); return lines; }
    function growNode(i) { var s = shapes[i], f = 1.8; if (s.tag === "circle") s.el.setAttribute("r", s.r * f); else { s.el.setAttribute("x", -s.r * f); s.el.setAttribute("y", -s.r * f); s.el.setAttribute("width", s.r * 2 * f); s.el.setAttribute("height", s.r * 2 * f); } grown.push(i); }
    function resetGrown() { grown.forEach(function (i) { var s = shapes[i]; if (s.tag === "circle") s.el.setAttribute("r", s.r); else { s.el.setAttribute("x", -s.r); s.el.setAttribute("y", -s.r); s.el.setAttribute("width", s.r * 2); s.el.setAttribute("height", s.r * 2); } }); grown = []; }
    function neighborLabel(n) { var t = svgEl("text", { class: "myth-label", x: n.x, y: n.y - R(n) * 1.8 - 6, "text-anchor": "middle", "font-size": 11 }); t.textContent = truncate(stripTags(n.full), 26); return t; }
    function previewCard(n) {
      var g2 = svgEl("g"), lh = 15, padc = 9, cw = 214;
      var titleLines = wrapText(stripTags(n.full), 30), bodyLines = wrapText(truncate(stripTags(n.preview), 190), 33);
      var th = titleLines.length * 15, h = padc * 2 + th + 6 + bodyLines.length * lh;
      var bx = n.x + R(n) * 1.8 + 12, by = n.y - h / 2;
      g2.appendChild(svgEl("rect", { x: bx, y: by, width: cw, height: h, rx: 8, fill: "#14151d", stroke: "#c9a24a", "stroke-width": 1.2 }));
      var tt = svgEl("text", { "font-size": 12.5, fill: "#e0c178", "font-weight": "700" });
      titleLines.forEach(function (ln, idx) { var ts = svgEl("tspan", { x: bx + padc, y: by + padc + 12 + idx * 15 }); ts.textContent = ln; tt.appendChild(ts); });
      g2.appendChild(tt);
      var bt = svgEl("text", { class: "myth-pvbody", "font-size": 11.5, fill: "#aca896" });
      bodyLines.forEach(function (ln, idx) { var ts = svgEl("tspan", { x: bx + padc, y: by + padc + th + 18 + idx * lh }); ts.textContent = ln; bt.appendChild(ts); });
      g2.appendChild(bt);
      return g2;
    }
    function clearSel() { if (selGroup) { selGroup.remove(); selGroup = null; } resetGrown(); }
    function select(i) {
      running = false; alpha = 0; clearSel(); selected = i; highlight(i); fillDetail(i);
      selGroup = svgEl("g", { class: "myth-sel" }); layer.appendChild(selGroup);
      var nb = []; (adj[i] || []).forEach(function (ei) { var e = edges[ei], o = e.a === i ? e.b : e.a; if (active[nodes[o].type] && nb.indexOf(o) < 0) nb.push(o); });
      nb.forEach(function (o) { growNode(o); selGroup.appendChild(neighborLabel(nodes[o])); });
      growNode(i); selGroup.appendChild(previewCard(nodes[i]));
    }
    function fillDetail(i) {
      var n = nodes[i], d = $("#myth-detail"); d.innerHTML = "";
      d.appendChild(el("div", "md-type", MYTH_TYPE[n.type].label.replace(/s$/, "")));
      d.appendChild(el("h3", "md-title", escapeHtml(n.full)));
      var open = el("div", "md-open");
      if (n.link.passage) { var a = el("a", null, "→ Read this movement"); a.setAttribute("data-passage", n.link.passage); open.appendChild(a); }
      else if (n.link.char) { var a2 = el("a", null, "→ Character card"); a2.setAttribute("data-char", n.link.char); open.appendChild(a2); }
      else if (n.link.tab === "motifs") { var a3 = el("a", null, "→ In the motif index"); a3.onclick = function () { switchView("motifs"); }; open.appendChild(a3); }
      else if (n.link.tab === "propp") { var a4 = el("a", null, "→ In the story graph"); a4.onclick = function () { switchView("propp"); if (n.link.anchor) setTimeout(function () { var c = $("#" + n.link.anchor); if (c) c.scrollIntoView({ behavior: "smooth", block: "center" }); }, 40); }; open.appendChild(a4); }
      d.appendChild(open);
      var groups = {};
      (adj[i] || []).forEach(function (ei) { var e = edges[ei], other = e.a === i ? e.b : e.a; (groups[e.type] = groups[e.type] || []).push(other); });
      var GLAB = { spine: "In sequence", appears: "Appears in", relates: "Related to", exhibits: "Exhibits", realizes: "Realizes" };
      var order = n.type === "movement" ? ["spine", "appears", "exhibits", "realizes", "relates"] : ["appears", "relates", "exhibits", "realizes", "spine"];
      order.forEach(function (t) {
        if (!groups[t]) return;
        var sec = el("div", "md-group"); sec.appendChild(el("span", "md-glabel", GLAB[t] + ": "));
        groups[t].forEach(function (oi, idx) { var chip = el("a", "md-chip"); chip.innerHTML = escapeHtml(nodes[oi].full); chip.onclick = function () { select(oi); }; sec.appendChild(chip); if (idx < groups[t].length - 1) sec.appendChild(document.createTextNode(" ")); });
        d.appendChild(sec);
      });
    }

    var stiffness = 0.34, velDecay = 0.62, alphaDecay = 0.028, alphaMin = 0.004;
    var cstrX = mobile ? 0.13 : 0.04, cstrY = 0.04;
    var clampv = function (v) { return v > 40 ? 40 : (v < -40 ? -40 : v); };
    var raf = (window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function (fn) { return setTimeout(fn, 16); });
    function step() {
      var a = alpha;
      for (var i = 0; i < nodes.length; i++) for (var j = i + 1; j < nodes.length; j++) {
        var dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y, d2 = dx * dx + dy * dy; if (d2 < 25) d2 = 25;
        var w = sim.charge * a / d2, fx = dx * w, fy = dy * w;
        nodes[i].vx += fx; nodes[i].vy += fy; nodes[j].vx -= fx; nodes[j].vy -= fy;
      }
      edges.forEach(function (e) { var A = nodes[e.a], Bn = nodes[e.b]; var dx = Bn.x - A.x, dy = Bn.y - A.y, d = Math.sqrt(dx * dx + dy * dy) || 0.01; var sp = e.type === "spine"; var L = sp ? Math.max(sim.L * 1.5, 130) : sim.L, st = sp ? 0.62 : stiffness; var l = (d - L) / d * a * st, fx = dx * l * 0.5, fy = dy * l * 0.5; A.vx += fx; A.vy += fy; Bn.vx -= fx; Bn.vy -= fy; });
      for (var i2 = 0; i2 < nodes.length; i2++) for (var j2 = i2 + 1; j2 < nodes.length; j2++) {
        var dx2 = nodes[i2].x - nodes[j2].x, dy2 = nodes[i2].y - nodes[j2].y, d3 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 0.01;
        var min = R(nodes[i2]) + R(nodes[j2]) + 6;
        if (d3 < min) { var p = (min - d3) / d3 * a, fx2 = dx2 * p, fy2 = dy2 * p; nodes[i2].vx += fx2; nodes[i2].vy += fy2; nodes[j2].vx -= fx2; nodes[j2].vy -= fy2; }
      }
      nodes.forEach(function (n) { n.vx += (-n.x) * cstrX * a; n.vy += (-n.y) * cstrY * a; n.x += clampv(n.vx); n.y += clampv(n.vy); n.vx *= velDecay; n.vy *= velDecay; });
      alpha += (0 - alpha) * alphaDecay;
    }
    function paint() {
      for (var i = 0; i < nodeObjs.length; i++) nodeObjs[i].setAttribute("transform", "translate(" + nodes[i].x.toFixed(1) + " " + nodes[i].y.toFixed(1) + ")");
      for (var ei = 0; ei < edgeObjs.length; ei++) { var e = edges[ei], l = edgeObjs[ei]; l.setAttribute("x1", nodes[e.a].x.toFixed(1)); l.setAttribute("y1", nodes[e.a].y.toFixed(1)); l.setAttribute("x2", nodes[e.b].x.toFixed(1)); l.setAttribute("y2", nodes[e.b].y.toFixed(1)); }
    }
    function bounds() { var a = 1e9, b = 1e9, c = -1e9, d = -1e9; nodes.forEach(function (n) { if (n.x < a) a = n.x; if (n.y < b) b = n.y; if (n.x > c) c = n.x; if (n.y > d) d = n.y; }); return { x: a, y: b, w: (c - a) || 1, h: (d - b) || 1 }; }
    function frame() { step(); paint(); if (alpha > 0.12 && zoomers.myth) zoomers.myth.fit(); if (alpha > alphaMin && running) raf(frame); else running = false; }
    function reheat() { if (!simReady) return; if (selected != null) { clearSel(); selected = null; clearHi(); } alpha = Math.max(alpha, 0.7); if (!running) { running = true; raf(frame); } }

    for (var w = 0; w < 30; w++) step();
    var host = $("#myth-host"); host.innerHTML = ""; host.appendChild(svg); paint();
    zoomers.myth = attachZoom(svg, layer, bounds, host);
    $("#myth-detail").innerHTML = '<div class="md-hint">A live force simulation — tune <em>link length</em> and <em>repulsion</em> above. Hover a node to light its threads; click any node to freeze the layout and preview what it touches.</div>';
    simReady = true; running = true; raf(frame);
  }

  /* ───────────── VIEW SWITCHING ───────────── */
  var VIEWS = ["telling", "tabard", "desire", "characters", "web", "propp", "motifs", "myth"];
  var drawn = {};
  var current = "telling";
  function switchView(v) {
    if (VIEWS.indexOf(v) < 0) v = "telling";
    current = v;
    VIEWS.forEach(function (x) { var n = $("#view-" + x); if (n) n.classList.toggle("active", x === v); });
    Array.prototype.forEach.call($("#tabs").children, function (b) { b.classList.toggle("active", b.dataset.view === v); });
    if (v === "tabard" && !drawn.tabard) { renderTabard(); drawn.tabard = true; }
    if (v === "desire" && !drawn.desire) { renderDesire(); drawn.desire = true; }
    if (v === "characters" && !drawn.characters) { renderCharacters(); drawn.characters = true; }
    if (v === "web" && !drawn.web) { renderWeb(); drawn.web = true; }
    if (v === "propp" && !drawn.propp) { renderPropp(); drawn.propp = true; }
    if (v === "motifs" && !drawn.motifs) { renderMotifs(); drawn.motifs = true; }
    if (v === "myth" && !drawn.myth) { renderMythograph(); drawn.myth = true; }
    if (location.hash.slice(1) !== v) history.replaceState(history.state, "", "#" + v);
    window.scrollTo({ top: 0 });
  }

  /* ───────────── jump handlers ───────────── */
  // tab clicks → switch view (delegated, so it works regardless of when boot runs)
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest(".tab[data-view]");
    if (b) { ev.preventDefault(); switchView(b.getAttribute("data-view")); }
  });
  // deep-link / back-forward to a specific tab via the hash
  window.addEventListener("hashchange", function () {
    var v = location.hash.slice(1);
    if (VIEWS.indexOf(v) >= 0 && v !== current) switchView(v);
  });
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[data-passage]");
    if (a) { ev.preventDefault(); switchView("telling"); var h = document.getElementById("mvt-" + a.getAttribute("data-passage")); if (h) setTimeout(function () { h.scrollIntoView({ behavior: "smooth", block: "start" }); }, 30); }
  });
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest("a[data-char]");
    if (a) { ev.preventDefault(); switchView("characters"); var c = document.getElementById("char-" + a.getAttribute("data-char")); if (c) setTimeout(function () { c.scrollIntoView({ behavior: "smooth", block: "center" }); c.classList.remove("flash"); void c.offsetWidth; c.classList.add("flash"); }, 30); }
  });

  /* ───────────── teller theming + nav ───────────── */
  function applyTheme(teller) {
    var r = document.documentElement.style;
    r.setProperty("--teller", teller.color);
    r.setProperty("--teller-soft", teller.accent2 || teller.color);
  }
  function readN() {
    var m = location.pathname.match(/\/t\/(\d+)/);
    if (m) return parseInt(m[1], 10);
    var q = new URLSearchParams(location.search).get("n");
    if (q && /^\d+$/.test(q)) return parseInt(q, 10);
    return 1;
  }
  function go(n) { n = Math.max(1, Math.floor(n)); history.pushState({}, "", "/t/" + n); load(n); window.scrollTo({ top: 0 }); }
  function randomN() { return 1 + Math.floor(Math.random() * 1000000); }
  function buildNav(host) {
    host.innerHTML = "";
    var prev = el("button", "nav-btn", "‹ Tale " + (T.n - 1 >= 1 ? T.n - 1 : "—")); prev.disabled = T.n <= 1; prev.onclick = function () { go(T.n - 1); };
    var rnd = el("button", "nav-btn primary", "↻ A tale at random"); rnd.onclick = function () { go(randomN()); };
    var next = el("button", "nav-btn", "Tale " + (T.n + 1) + " ›"); next.onclick = function () { go(T.n + 1); };
    var goto = el("div", "nav-goto");
    goto.appendChild(document.createTextNode("turn to № "));
    var inp = document.createElement("input"); inp.type = "number"; inp.min = "1"; inp.value = T.n; inp.setAttribute("aria-label", "Go to tale number");
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter") { var v = parseInt(inp.value, 10); if (v >= 1) go(v); } });
    goto.appendChild(inp);
    host.appendChild(prev); host.appendChild(rnd); host.appendChild(next); host.appendChild(goto);
  }
  function renderNav() { ["#nav", "#nav-bottom"].forEach(function (sel) { var h = $(sel); if (h) buildNav(h); }); }

  function load(n) {
    T = B.generate(n); B.tale = T;
    applyTheme(T.teller);
    document.title = T.title + " — № " + n + " · the Book of Sand";
    var sig = $("#brand-sigil"); if (sig) sig.textContent = T.teller.glyph;
    var brand = $("#brand-title"); if (brand) brand.textContent = "Book of Sand";
    var h1 = $("#tale-h1"); if (h1) h1.textContent = T.title;
    var sub = $("#tale-sub"); if (sub) sub.innerHTML = "Tale № " + n + " · " + escapeHtml(T.kicker);
    // teller strip
    var strip = $("#teller-strip");
    if (strip) {
      strip.innerHTML = '<div class="glyph">' + T.teller.glyph + '</div><div class="who"><h3>' + escapeHtml(T.teller.name) + ' — ' + escapeHtml(T.teller.planet) + '</h3><div class="sub">' + escapeHtml(T.teller.office) + ' · ' + escapeHtml(T.teller.metal) + ' · ' + escapeHtml(T.teller.humour) + '</div></div>';
      strip.style.borderLeftColor = T.teller.color;
    }
    drawn = {}; // reset per-tale render caches
    renderInterstitial();
    setupBanter();
    renderTelling();
    setupLive();
    renderNav();
    var hash = location.hash.slice(1);
    switchView(VIEWS.indexOf(hash) >= 0 ? hash : "telling");
  }

  window.addEventListener("popstate", function () { load(readN()); });

  B.bootTale = function () { load(readN()); };
  B.switchView = switchView;
})();
