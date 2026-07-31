/* Telegraph — the board view and animation layer.
 *
 * The first version of this UI rebuilt the whole board's innerHTML on every
 * render, which is fine for a turn-based game right up until you want anything
 * to *move*: a piece that is destroyed and recreated every frame can never
 * slide anywhere. So the DOM is split into three layers:
 *
 *   #tiles   36 buttons, built once per encounter and then only reclassed.
 *            These own all input and all accessibility text.
 *   #pieces  one persistent element per entity id, positioned by transform.
 *            Changing the transform is the whole movement animation.
 *   #fx      short-lived effect elements, added and self-removed.
 *
 * Each piece is two nested elements on purpose: the outer one owns the
 * positioning transform, the inner one owns lunges, flashes and death — so an
 * attack wiggle can never fight with where the piece actually is.
 *
 * Everything here honours prefers-reduced-motion by collapsing every duration
 * to zero, so the game stays fully playable with no motion at all.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var T = NS.TELEGRAPH = NS.TELEGRAPH || {};

  var GAP = 4;   // must match the grid-gap in css/telegraph.css

  var DUR = {
    move: 190,       // a piece walking to an adjacent-ish tile
    lunge: 130,      // the wind-up of an attack
    shot: 190,       // a projectile crossing to its impact tile
    strike: 220,     // the impact ring
    death: 240,      // fading a downed body out
    advance: 220,    // the horde closing in after resolution
    beat: 110,       // a pause so two things don't read as one
  };

  function createBoardView(root) {
    var reduced = NS.matchMedia && NS.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var tilesEl = root.querySelector("#tiles");
    var piecesEl = root.querySelector("#pieces");
    var fxEl = root.querySelector("#fx");

    var tiles = [];         // index -> button
    var pieces = {};        // entity id -> outer element
    var dims = { w: 6, h: 6, cell: 50 };
    var onTileTap = null;

    function d(key) { return reduced ? 0 : DUR[key]; }

    function wait(ms) {
      if (!ms) return Promise.resolve();
      return new Promise(function (r) { setTimeout(r, ms); });
    }

    function measure() {
      var rect = tilesEl.getBoundingClientRect();
      dims.cell = (rect.width - GAP * (dims.w - 1)) / dims.w;
    }

    function px(col) { return col * (dims.cell + GAP); }
    function centre(col) { return px(col) + dims.cell / 2; }

    /* ------------------------------------------------------------- tiles -- */

    /* Build the grid. Called once per encounter, because terrain is the only
       thing on a tile that never changes mid-encounter. */
    function mount(state, tapHandler) {
      dims.w = state.w; dims.h = state.h;
      onTileTap = tapHandler || onTileTap;
      tilesEl.innerHTML = "";
      piecesEl.innerHTML = "";
      fxEl.innerHTML = "";
      tiles = [];
      pieces = {};

      for (var y = 0; y < state.h; y++) {
        for (var x = 0; x < state.w; x++) {
          (function (cx, cy) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "tile";
            b.setAttribute("data-x", cx);
            b.setAttribute("data-y", cy);
            b.addEventListener("click", function () { if (onTileTap) onTileTap(cx, cy); });
            tilesEl.appendChild(b);
            tiles.push(b);
          })(x, y);
        }
      }
      measure();
      sync(state, false);
      return dims;
    }

    /* Reclass the tiles. No innerHTML anywhere — the badge element is reused so
       the browser never has to rebuild the grid. */
    function paint(state, ui) {
      ui = ui || {};
      var threats = threatMap(state);
      for (var y = 0; y < state.h; y++) {
        for (var x = 0; x < state.w; x++) {
          var i = y * state.w + x, b = tiles[i];
          if (!b) continue;
          var key = x + "," + y;
          var terrain = state.tiles[i];
          var th = threats[key];
          var cls = "tile " + terrain;
          if (th) cls += " threat threat-" + th.kind;
          if (ui.moveSet && ui.moveSet[key]) cls += " hl-move";
          if (ui.targetSet && ui.targetSet[key]) cls += " hl-target";
          var occ = T.entityAt(state, x, y);
          if (occ && T.isUnit(occ)) {
            cls += " has-unit";
            if (occ.alive && !occ.acted) cls += " actor";
            if (ui.selected === occ.id) cls += " selected";
          }
          b.className = cls;

          var badge = b.firstElementChild;
          if (th && th.kind !== "none") {
            if (!badge) { badge = document.createElement("span"); badge.className = "threat-count"; b.appendChild(badge); }
            badge.textContent = th.dmg;
            badge.hidden = false;
          } else if (badge) {
            badge.hidden = true;
          }
          b.setAttribute("aria-label", describe(state, x, y, th, ui));
        }
      }
    }

    /* Tiles carry the whole description because pieces are aria-hidden — one
       voice per cell, not two. */
    function describe(state, x, y, th, ui) {
      var terrain = state.tiles[y * state.w + x];
      var parts = [(x + 1) + "," + (y + 1), terrain === "node" ? "node" : terrain === "rock" ? "rock" : "floor"];
      var ent = T.entityAt(state, x, y);
      if (ent) {
        var spec = T.isUnit(ent) ? T.UNITS[ent.kind] : T.ENEMIES[ent.kind];
        parts.push(spec.name + ", " + ent.hp + " of " + ent.maxHp + " health");
        if (!T.isUnit(ent)) parts.push("facing " + T.DIR_NAME[ent.dir]);
      }
      if (th) {
        parts.push(th.kind === "none" ? "incoming, hits nothing"
          : "incoming " + th.dmg + " damage to " +
            (th.kind === "node" ? "a node" : th.kind === "unit" ? "your unit" : "an enemy"));
      }
      var key = x + "," + y;
      if (ui.moveSet && ui.moveSet[key]) parts.push("move here");
      if (ui.targetSet && ui.targetSet[key]) parts.push("target here");
      return parts.join(", ");
    }

    function threatMap(state) {
      var f = T.forecast(state), m = {};
      for (var i = 0; i < f.length; i++) {
        var k = f[i].x + "," + f[i].y;
        if (!m[k]) m[k] = { n: 0, dmg: 0, kind: "none" };
        m[k].n++;
        m[k].dmg += f[i].dmg;
        if (f[i].hitsNode) m[k].kind = "node";
        else if (f[i].hitsUnit && m[k].kind !== "node") m[k].kind = "unit";
        else if (f[i].hitsEnemy && m[k].kind === "none") m[k].kind = "enemy";
      }
      return m;
    }

    /* ------------------------------------------------------------ pieces -- */

    function makePiece(ent) {
      var isUnit = T.isUnit(ent);
      var spec = isUnit ? T.UNITS[ent.kind] : T.ENEMIES[ent.kind];
      var outer = document.createElement("div");
      outer.className = "piece " + (isUnit ? "unit " : "enemy ") + ent.kind + " spawning";
      outer.setAttribute("aria-hidden", "true");

      var inner = document.createElement("div");
      inner.className = "piece-inner";

      var g = document.createElement("span");
      g.className = "glyph";
      g.textContent = spec.glyph;
      inner.appendChild(g);

      var pips = document.createElement("span");
      pips.className = "pips";
      inner.appendChild(pips);

      if (!isUnit) {
        var arrow = document.createElement("span");
        arrow.className = "facing";
        inner.appendChild(arrow);
      }
      outer.appendChild(inner);
      piecesEl.appendChild(outer);
      // Let the spawn-in play, then drop the class so it can't replay.
      setTimeout(function () { outer.classList.remove("spawning"); }, DUR.death);
      return outer;
    }

    function refreshPiece(el, ent) {
      var isUnit = T.isUnit(ent);
      var inner = el.firstElementChild;
      var pips = inner.querySelector(".pips");
      if (pips.childElementCount !== ent.maxHp) {
        pips.innerHTML = "";
        for (var i = 0; i < ent.maxHp; i++) {
          var dot = document.createElement("span");
          dot.className = "pip";
          pips.appendChild(dot);
        }
      }
      for (var j = 0; j < pips.children.length; j++) {
        pips.children[j].className = "pip" + (j < ent.hp ? "" : " gone");
      }
      if (!isUnit) {
        var arrow = inner.querySelector(".facing");
        arrow.className = "facing " + T.DIR_NAME[ent.dir];
        arrow.textContent = ["▲", "▶", "▼", "◀"][ent.dir];
      }
      el.classList.toggle("spent", isUnit && ent.acted);
    }

    /* Position every live entity. With animate=true the CSS transition on
       transform does the moving; with false we suppress it for resizes and
       fresh boards, where sliding in from a stale position would be a lie. */
    function sync(state, animate) {
      if (!animate) root.classList.add("no-anim");
      var all = state.units.concat(state.enemies);
      for (var i = 0; i < all.length; i++) {
        var ent = all[i];
        if (!ent.alive) continue;
        var el = pieces[ent.id];
        if (!el) { el = pieces[ent.id] = makePiece(ent); }
        el.style.width = dims.cell + "px";
        el.style.height = dims.cell + "px";
        el.style.transform = "translate(" + px(ent.x) + "px," + px(ent.y) + "px)";
        refreshPiece(el, ent);
      }
      if (!animate) { void root.offsetWidth; root.classList.remove("no-anim"); }
    }

    /* Drop pieces for anything no longer on the board. Kept separate from sync
       so a death can be animated before the element disappears. */
    function prune(state) {
      var live = {};
      state.units.concat(state.enemies).forEach(function (e) { if (e.alive) live[e.id] = true; });
      Object.keys(pieces).forEach(function (id) {
        if (!live[id]) {
          if (pieces[id].parentNode) pieces[id].parentNode.removeChild(pieces[id]);
          delete pieces[id];
        }
      });
    }

    /* ----------------------------------------------------------- effects -- */

    function flash(ids) {
      if (reduced) return;
      (ids || []).forEach(function (id) {
        var el = pieces[id];
        if (!el) return;
        var inner = el.firstElementChild;
        inner.classList.remove("hit");
        void inner.offsetWidth;      // restart the keyframe
        inner.classList.add("hit");
      });
    }

    function markDying(ids) {
      (ids || []).forEach(function (id) {
        if (pieces[id]) pieces[id].classList.add("dying");
      });
    }

    /* Lean toward the thing you are hitting, then settle back. Reads as intent
       without needing a real attack animation per unit type. */
    function lunge(id, dir) {
      if (reduced) return;
      var el = pieces[id];
      if (!el) return;
      var inner = el.firstElementChild;
      var off = dims.cell * 0.26;
      var dx = [0, off, 0, -off][dir], dy = [-off, 0, off, 0][dir];
      inner.style.transition = "transform " + DUR.lunge + "ms cubic-bezier(.3,1.6,.6,1)";
      inner.style.transform = "translate(" + dx + "px," + dy + "px)";
      setTimeout(function () { inner.style.transform = ""; }, DUR.lunge);
      setTimeout(function () { inner.style.transition = ""; }, DUR.lunge * 2);
    }

    function fx(kind, x, y) {
      if (reduced) return;
      var e = document.createElement("div");
      e.className = "fx fx-" + kind;
      var size = dims.cell;
      e.style.width = size + "px";
      e.style.height = size + "px";
      e.style.transform = "translate(" + px(x) + "px," + px(y) + "px)";
      fxEl.appendChild(e);
      setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 600);
    }

    /* A round travelling from the shooter to the tile it lands on. This is what
       makes a spitter legible — you can see the shot pass over the tile in
       between, which is exactly the rule that tile is teaching. */
    function shot(fromX, fromY, toX, toY, cls) {
      if (reduced) return;
      var e = document.createElement("div");
      e.className = "fx fx-shot " + (cls || "");
      var s = Math.max(6, dims.cell * 0.18);
      e.style.width = s + "px";
      e.style.height = s + "px";
      e.style.transform = "translate(" + (centre(fromX) - s / 2) + "px," + (centre(fromY) - s / 2) + "px)";
      fxEl.appendChild(e);
      requestAnimationFrame(function () {
        e.style.transition = "transform " + DUR.shot + "ms linear";
        e.style.transform = "translate(" + (centre(toX) - s / 2) + "px," + (centre(toY) - s / 2) + "px)";
      });
      setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, DUR.shot + 120);
    }

    function float(x, y, text, cls) {
      if (reduced) return;
      var e = document.createElement("div");
      e.className = "fx fx-float " + (cls || "");
      e.textContent = text;
      e.style.width = dims.cell + "px";
      e.style.transform = "translate(" + px(x) + "px," + px(y) + "px)";
      fxEl.appendChild(e);
      setTimeout(function () { if (e.parentNode) e.parentNode.removeChild(e); }, 900);
    }

    function shake() {
      if (reduced) return;
      root.classList.remove("shake");
      void root.offsetWidth;
      root.classList.add("shake");
      setTimeout(function () { root.classList.remove("shake"); }, 320);
    }

    return {
      mount: mount, paint: paint, sync: sync, prune: prune,
      flash: flash, markDying: markDying, lunge: lunge,
      fx: fx, shot: shot, float: float, shake: shake,
      measure: measure, wait: wait, d: d,
      reduced: reduced,
      metrics: function () { return { cell: dims.cell, gap: GAP }; },
      hasPiece: function (id) { return !!pieces[id]; },
    };
  }

  T.ANIM = DUR;
  T.createBoardView = createBoardView;
})();
