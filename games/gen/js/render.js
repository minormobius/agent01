/* The Ludographer — the reader. Turns a generated spec into a rulebook page:
   title block, the board diagram, component manifest, mechanic tags, the rules
   proper, turn flow, scoring, and the designer's "what we shook loose" note —
   plus endless nav (prev / next / random / go-to). Pure DOM, no deps.
   Attaches to LUDO.render. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var L = NS.LUDO = NS.LUDO || {};

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  // turn *emphasis* into <em> in the generated prose, then escape the rest.
  function md(s) { return esc(s).replace(/\*([^*]+)\*/g, "<em>$1</em>"); }

  var ICON = {
    meeple: "♟", board: "▦", cube: "◼", disc: "⬤", tile: "◳", card: "▭", token: "◆",
    bag: "👝", pawn: "♙", coin: "◉", block: "▮", die: "⚄", bar: "▬", stone: "⬤", book: "📖"
  };

  function complexityDots(c) {
    var full = Math.round(c), s = "";
    for (var i = 1; i <= 5; i++) s += '<span class="dot ' + (i <= full ? "on" : "") + '"></span>';
    return s;
  }

  function familyTag(f) { return f === "core" ? "core engine" : f === "economy" ? "economy" : "modifier"; }

  L.render = function (g, mount) {
    mount.innerHTML = "";
    var pal = g.theme.pal;
    document.documentElement.style.setProperty("--accent", pal.accent);
    document.documentElement.style.setProperty("--accent2", pal.accent2);
    document.documentElement.style.setProperty("--board", pal.board);
    document.title = g.title + " — The Ludographer";

    var page = el("article", "rulebook");

    // ── masthead ──
    var head = el("header", "masthead");
    head.appendChild(el("div", "seedno", "Catalogue №&nbsp;" + g.seed));
    head.appendChild(el("h1", "game-title", esc(g.title)));
    head.appendChild(el("div", "subtitle", esc(g.subtitle)));
    var meta = el("div", "metaline");
    meta.innerHTML =
      '<span>' + g.players.min + "–" + g.players.max + ' players</span>' +
      '<span>best at ' + g.players.best + '</span>' +
      '<span>~' + g.playtime + ' min</span>' +
      '<span class="cx">weight ' + g.complexity + ' ' + complexityDots(g.complexity) + '</span>';
    head.appendChild(meta);
    head.appendChild(el("p", "tagline", md(g.tagline)));
    head.appendChild(el("div", "byline", "designed by " + esc(g.designer.person) + " · " + esc(g.designer.studio) + " · " + g.designer.year));
    page.appendChild(head);

    // ── board diagram ──
    var fig = el("figure", "board-fig");
    fig.innerHTML = L.board(g);
    fig.appendChild(el("figcaption", null, esc(g.topology.name) + " — " + esc(g.topology.blurb)));
    page.appendChild(fig);

    // ── mechanic chips ──
    var chips = el("div", "chips");
    g.mechanics.forEach(function (m) {
      chips.appendChild(el("span", "chip chip-" + m.family, esc(m.name) + '<small>' + familyTag(m.family) + '</small>'));
    });
    chips.appendChild(el("span", "chip chip-theme", esc(g.theme.name)));
    chips.appendChild(el("span", "chip chip-win", esc(g.win.name)));
    page.appendChild(chips);

    // ── components manifest ──
    page.appendChild(section("Components", function (body) {
      var grid = el("div", "comp-grid");
      g.components.forEach(function (c) {
        var card = el("div", "comp");
        card.innerHTML = '<span class="comp-ico">' + (ICON[c.icon] || "◆") + '</span>' +
          '<span class="comp-name">' + esc(c.name) + '</span>' +
          (c.qty > 1 ? '<span class="comp-qty">×' + c.qty + '</span>' : '');
        grid.appendChild(card);
      });
      body.appendChild(grid);
      body.appendChild(el("p", "econ", "Economy: " + g.resources.map(esc).join(" · ")));
    }));

    // ── setup ──
    page.appendChild(section("Setup", function (body) {
      var ol = el("ol", "steps");
      g.setup.forEach(function (s) { ol.appendChild(el("li", null, md(s))); });
      body.appendChild(ol);
    }));

    // ── on your turn ──
    page.appendChild(section("On your turn", function (body) {
      body.appendChild(el("p", "turn-text", md(g.turn.text)));
      var ul = el("ul", "actions");
      g.actions.forEach(function (a) {
        ul.appendChild(el("li", null, "<strong>" + esc(a.name) + ".</strong> " + md(a.body)));
      });
      body.appendChild(ul);
    }));

    // ── how it works (the mechanic rules) ──
    page.appendChild(section("How it works", function (body) {
      g.mechanics.forEach(function (m) {
        var blk = el("div", "mech");
        blk.appendChild(el("h4", null, esc(m.name) + ' <span class="mfam">' + familyTag(m.family) + "</span>"));
        blk.appendChild(el("p", null, md(m.rule)));
        body.appendChild(blk);
      });
    }));

    // ── winning ──
    page.appendChild(section("Winning the game", function (body) {
      body.appendChild(el("p", "win-text", "<strong>" + esc(g.win.name) + ".</strong> " + md(g.win.describe)));
    }));

    // ── the twist ──
    var twist = section("Designer's note — what we shook loose", function (body) {
      body.appendChild(el("p", "twist-text", md(g.twist)));
    });
    twist.classList.add("twist-section");
    page.appendChild(twist);

    page.appendChild(el("footer", "colophon",
      'Generated, not authored. Catalogue №&nbsp;' + g.seed + ' resolves to this exact game on any machine, for ever. ' +
      'Part of <a href="/">games.mino.mobi</a> · the engine is <a href="/gen/">The Ludographer</a>.'));

    mount.appendChild(page);
    mount.scrollTop = 0;
    window.scrollTo(0, 0);
  };

  function section(title, fill) {
    var s = el("section", "block");
    s.appendChild(el("h3", null, esc(title)));
    var body = el("div", "block-body");
    fill(body);
    s.appendChild(body);
    return s;
  }

  // ── nav wiring (used by game.html) ──
  L.mountReader = function () {
    var mount = document.getElementById("app");
    function curN() { var u = new URL(location.href); return Math.max(1, parseInt(u.searchParams.get("n") || location.hash.replace("#", "") || "1", 10) || 1); }
    function go(n, push) {
      n = Math.max(1, Math.floor(n));
      if (push) history.pushState({ n: n }, "", "?n=" + n);
      L.render(L.generate(n), mount);
      var nb = document.getElementById("seedbox"); if (nb) nb.value = n;
    }
    document.getElementById("prev").onclick = function () { go(curN() - 1, true); };
    document.getElementById("next").onclick = function () { go(curN() + 1, true); };
    document.getElementById("rand").onclick = function () { go(1 + Math.floor(Math.random() * 9e6), true); };
    var form = document.getElementById("goform");
    if (form) form.onsubmit = function (e) { e.preventDefault(); go(parseInt(document.getElementById("seedbox").value, 10) || 1, true); };
    window.onpopstate = function () { go(curN(), false); };
    go(curN(), false);
  };
})();
