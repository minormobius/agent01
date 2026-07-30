/* Hold the Line — the renderer.
 *
 * Draws a run onto a canvas and owns every cosmetic effect: screen shake, kill
 * bursts, damage text, muzzle flash, the wave banner. It reads the run and
 * never writes to it, with one exception — it drains `run.events`, which is the
 * queue the sim leaves for exactly this purpose.
 *
 * Cosmetic randomness in here uses Math.random deliberately. The sim's seeded
 * generator must stay untouched by how many frames a phone managed to draw, so
 * sparks and shake offsets are explicitly *not* part of the reproducible run.
 *
 * Attaches to the shared namespace. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var H = NS.HORDE = NS.HORDE || {};
  var TAU = Math.PI * 2;

  /* Arc 0 points up, then clockwise. Both the renderer and the input handler
     use these two functions, so what you see and what you touch cannot drift
     apart. */
  var ARCS = 6;
  function angleOf(i) { return -Math.PI / 2 + i * (TAU / ARCS); }
  function arcOfAngle(ang) {
    var t = (ang + Math.PI / 2 + TAU / (ARCS * 2)) / (TAU / ARCS);
    return ((Math.floor(t) % ARCS) + ARCS) % ARCS;
  }
  H.arcGeom = { angleOf: angleOf, arcOfAngle: arcOfAngle, ARCS: ARCS };

  // Body size and colour per type. Bigger = slower and meaner, which is the
  // only legend the player should ever need.
  var LOOK = {
    walker: { r: 5.5, fill: "#7dd83f", ring: null },
    runner: { r: 4.5, fill: "#e8ff4d", ring: null },
    swarm:  { r: 2.8, fill: "#4e9e2c", ring: null },
    brute:  { r: 10,  fill: "#2f7d3a", ring: "#a8ff6a" },
  };

  function createRenderer(canvas) {
    var ctx = canvas.getContext("2d");
    var dpr = 1, W = 0, Hh = 0, cx = 0, cy = 0, R = 100, wallR = 20;

    var reduce = NS.matchMedia && NS.matchMedia("(prefers-reduced-motion: reduce)").matches;

    var floaters = [];   // text that rises and fades
    var sparks = [];     // small dots thrown off a kill
    var shake = 0;       // current shake magnitude in px
    var muzzle = 0;      // 0..1, decays; pumped every frame we are firing
    var bannerT = 0;     // seconds remaining on the wave banner
    var bannerText = "";
    var hurtFlash = 0;   // red vignette when the wall is hit
    var lastFocus = 0;
    var focusAnim = 0;   // smoothed focus angle so the turret swings

    function resize() {
      dpr = Math.min(2, NS.devicePixelRatio || 1);
      var rect = canvas.getBoundingClientRect();
      W = Math.max(1, Math.round(rect.width));
      Hh = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(Hh * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Leave room for the outermost bodies and the rim heat bar.
      R = Math.max(40, Math.min(W, Hh) / 2 - 12);
      // The canvas box is kept square by CSS (see #arena-wrap), so centring is
      // enough — the layout, not the renderer, decides where the dead air goes.
      cx = W / 2;
      cy = Hh / 2;
      wallR = R * 0.2;
    }

    /* Where a zombie sits on screen. r = 1 is the spawn edge, r = 0 is the wall,
       so the mapping runs inward. */
    function posOf(arc, r, spreadSeed) {
      // Spread bodies across the width of their arc so a clump reads as a mob
      // rather than a single blip. Derived from the zombie id, so it is stable
      // frame to frame without the sim having to store it.
      var spread = (((spreadSeed * 2654435761) % 1000) / 1000 - 0.5) * (TAU / ARCS) * 0.72;
      var ang = angleOf(arc) + spread;
      var rad = wallR + r * (R - wallR);
      return { x: cx + Math.cos(ang) * rad, y: cy + Math.sin(ang) * rad, ang: ang, rad: rad };
    }

    function addFloater(x, y, text, color, size) {
      floaters.push({ x: x, y: y, text: text, color: color, size: size || 14, life: 0.9, max: 0.9 });
      if (floaters.length > 40) floaters.shift();
    }

    function addSparks(x, y, color, n) {
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, s = 30 + Math.random() * 90;
        sparks.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.35, max: 0.35, color: color });
      }
      if (sparks.length > 300) sparks.splice(0, sparks.length - 300);
    }

    /* Turn the sim's event queue into effects. This is the only place the two
       layers meet. */
    function drainEvents(run) {
      for (var i = 0; i < run.events.length; i++) {
        var e = run.events[i];
        if (e.type === "kill") {
          var p = posOf(e.arc, e.r, 7);
          var look = LOOK[e.kind] || LOOK.walker;
          addSparks(p.x, p.y, look.fill, e.kind === "brute" ? 12 : 3);
          // Only a brute is worth interrupting the player's eye for.
          if (e.kind === "brute") { addFloater(p.x, p.y, "BRUTE DOWN", "#a8ff6a", 13); shake = Math.max(shake, 4); }
        } else if (e.type === "leak") {
          // Sit the number just outside the wall ring rather than on it, or a
          // bad wave buries the turret under its own damage text.
          var q = posOf(e.arc, 0.14, 3);
          addFloater(q.x, q.y, "−" + e.dmg, "#ff2e4d", 21);
          addSparks(q.x, q.y, "#ff2e4d", 14);
          shake = Math.max(shake, 9);
          hurtFlash = 1;
        } else if (e.type === "jam") {
          var j = posOf(e.arc, 0.42, 11);
          addFloater(j.x, j.y, "JAMMED", "#ff2e4d", 18);
          shake = Math.max(shake, 5);
        } else if (e.type === "grenade") {
          var g = posOf(e.arc, 0.5, 5);
          addFloater(g.x, g.y, "BOOM", "#ff6a3d", 24);
          addSparks(g.x, g.y, "#ff6a3d", 26);
          shake = Math.max(shake, 12);
        } else if (e.type === "wave") {
          bannerText = "WAVE " + e.wave;
          bannerT = 1.5;
        }
      }
      run.events.length = 0;
    }

    // ------------------------------------------------------------- drawing --

    function drawArcs(run) {
      var half = TAU / (ARCS * 2);
      for (var i = 0; i < ARCS; i++) {
        var a0 = angleOf(i) - half, a1 = angleOf(i) + half;
        var threat = H.arcThreat(run, i);
        var focused = i === run.focus;

        // Wedge: tinted by how close that direction is to hurting you.
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a1);
        ctx.closePath();
        // Ramp from a cool neutral slate to hot red. Starting the ramp at a
        // reddish base was the actual reason the whole arena looked alarmed
        // even when nothing was near — six wedges of faint salmon is a red
        // wash. A calm board has to genuinely look calm for a hot arc to mean
        // anything.
        var base = focused ? 0.13 : 0.045;
        ctx.fillStyle = "rgba(" +
          Math.round(90 + 165 * threat) + "," +
          Math.round(100 - 70 * threat) + "," +
          Math.round(120 - 100 * threat) + "," +
          (base + threat * 0.17).toFixed(3) + ")";
        ctx.fill();

        // Divider spokes, very faint — they define the six choices.
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
        ctx.strokeStyle = "rgba(255,255,255,0.055)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Rim: the heat bar for this arc's gun. Teal cold, orange warm, red at
        // the jam. This is the meter the whole game is about, so it lives at the
        // edge of the arena where it is visible without being looked at.
        var arc = run.arcs[i];
        var heat = arc.heat;
        var rimCol;
        if (arc.jam > 0) {
          rimCol = (Math.floor(run.t * 12) % 2) ? "#ff2e4d" : "#5a0f1a";
        } else {
          rimCol = "rgb(" + Math.round(94 + 161 * heat) + "," + Math.round(232 - 126 * heat) + "," +
            Math.round(193 - 132 * heat) + ")";
        }
        ctx.beginPath();
        ctx.arc(cx, cy, R + 5, a0 + 0.03, a1 - 0.03);
        ctx.strokeStyle = "rgba(255,255,255,0.07)";
        ctx.lineWidth = 5;
        ctx.stroke();
        if (heat > 0.01 || arc.jam > 0) {
          // Grow the fill outward from the middle of the arc. Filling from one
          // edge reads as a stray fragment; centred, it reads as a meter that
          // belongs to this direction.
          var mid = angleOf(i);
          var reach = (half - 0.03) * (arc.jam > 0 ? 1 : heat);
          ctx.beginPath();
          ctx.arc(cx, cy, R + 5, mid - reach, mid + reach);
          ctx.strokeStyle = rimCol;
          ctx.lineWidth = 5;
          ctx.stroke();
        }
      }
    }

    function drawWall(run) {
      var frac = Math.max(0, run.wall.hp / run.wall.max);
      // The wall itself: a ring that erodes. Full circle underneath, healthy
      // portion drawn over it, starting at the top and going clockwise.
      ctx.beginPath();
      ctx.arc(cx, cy, wallR, 0, TAU);
      ctx.strokeStyle = "rgba(255,46,77,0.35)";
      ctx.lineWidth = 7;
      ctx.stroke();

      if (frac > 0) {
        ctx.beginPath();
        ctx.arc(cx, cy, wallR, -Math.PI / 2, -Math.PI / 2 + TAU * frac);
        ctx.strokeStyle = frac < 0.34 ? "#ff2e4d" : "#5ee8c1";
        ctx.lineWidth = 7;
        ctx.stroke();
      }
    }

    function drawZombies(run) {
      for (var i = 0; i < run.zombies.length; i++) {
        var z = run.zombies[i];
        var look = LOOK[z.type] || LOOK.walker;
        var p = posOf(z.arc, z.r, z.id);
        var hpFrac = Math.max(0, Math.min(1, z.hp / z.maxHp));

        // Wounded bodies darken. Free, continuous damage feedback with no
        // health bars cluttering the arena.
        ctx.globalAlpha = 0.45 + 0.55 * hpFrac;
        ctx.beginPath();
        ctx.arc(p.x, p.y, look.r, 0, TAU);
        ctx.fillStyle = look.fill;
        ctx.fill();
        ctx.globalAlpha = 1;

        if (look.ring) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, look.r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * hpFrac);
          ctx.strokeStyle = look.ring;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        // Anything about to reach the wall gets a halo. Late waves are busy and
        // "which of these forty dots is about to hurt me" must stay answerable.
        if (z.r < 0.16) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, look.r + 4 + Math.sin(run.t * 14) * 1.5, 0, TAU);
          ctx.strokeStyle = "rgba(255,46,77,0.85)";
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      }
    }

    function drawGun(run, dtReal) {
      var firing = run.phase === "wave";
      var jammed = run.arcs[run.focus].jam > 0;
      var target = angleOf(run.focus);

      // Swing the turret the short way round rather than snapping.
      var diff = ((target - focusAnim + Math.PI * 3) % TAU) - Math.PI;
      focusAnim += diff * Math.min(1, dtReal * 18);

      if (firing) muzzle = Math.min(1, muzzle + dtReal * 40);
      muzzle = Math.max(0, muzzle - dtReal * 8);

      var half = TAU / (ARCS * 2);
      if (firing && !jammed) {
        // The firing cone. Its brightness tracks heat droop, so a hot gun
        // visibly stops working before it jams.
        var heat = run.arcs[run.focus].heat;
        var strength = (1 - run.mods.droop * heat);
        var grad = ctx.createRadialGradient(cx, cy, wallR, cx, cy, R);
        grad.addColorStop(0, "rgba(255,200,120," + (0.5 * strength).toFixed(3) + ")");
        grad.addColorStop(1, "rgba(255,106,61,0)");
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, focusAnim - half * 0.92, focusAnim + half * 0.92);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Tracers. Purely decorative, hence Math.random.
        for (var t = 0; t < 3; t++) {
          var a = focusAnim + (Math.random() - 0.5) * half * 1.3;
          var len = wallR + Math.random() * (R - wallR);
          ctx.beginPath();
          ctx.moveTo(cx + Math.cos(a) * (wallR + 4), cy + Math.sin(a) * (wallR + 4));
          ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len);
          ctx.strokeStyle = "rgba(255,230,170," + (0.16 + 0.3 * Math.random() * strength).toFixed(3) + ")";
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }

      // The turret. A wedge pointing where your fire is going.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(focusAnim);
      ctx.beginPath();
      ctx.moveTo(wallR * 0.92, 0);
      ctx.lineTo(-wallR * 0.42, -wallR * 0.5);
      ctx.lineTo(-wallR * 0.42, wallR * 0.5);
      ctx.closePath();
      ctx.fillStyle = jammed ? "#ff2e4d" : "#e6e6ee";
      ctx.fill();
      // Muzzle flare at the tip.
      if (firing && !jammed && muzzle > 0.1) {
        ctx.beginPath();
        ctx.arc(wallR * 1.05, 0, 3 + muzzle * 4, 0, TAU);
        ctx.fillStyle = "rgba(255,220,150," + (0.5 * muzzle).toFixed(3) + ")";
        ctx.fill();
      }
      ctx.restore();
    }

    function drawEffects(dtReal) {
      var i;
      for (i = sparks.length - 1; i >= 0; i--) {
        var s = sparks[i];
        s.life -= dtReal;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        s.x += s.vx * dtReal;
        s.y += s.vy * dtReal;
        ctx.globalAlpha = s.life / s.max;
        ctx.fillStyle = s.color;
        ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
      }
      ctx.globalAlpha = 1;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      for (i = floaters.length - 1; i >= 0; i--) {
        var f = floaters[i];
        f.life -= dtReal;
        if (f.life <= 0) { floaters.splice(i, 1); continue; }
        var k = f.life / f.max;
        f.y -= dtReal * 34;
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.font = "700 " + f.size + "px ui-monospace, Menlo, monospace";
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
    }

    function drawBanner(run, dtReal) {
      if (bannerT <= 0) return;
      bannerT -= dtReal;
      var k = Math.max(0, Math.min(1, bannerT / 1.5));
      // Slam in, hold, fade out.
      var scale = 1 + (1 - k) * 0.06;
      ctx.save();
      ctx.globalAlpha = k > 0.75 ? (1 - k) * 4 : Math.min(1, k * 2.2);
      ctx.translate(cx, cy - R * 0.52);
      ctx.scale(scale, scale);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "700 34px ui-monospace, Menlo, monospace";
      ctx.lineWidth = 5;
      ctx.strokeStyle = "rgba(0,0,0,0.85)";
      ctx.strokeText(bannerText, 0, 0);
      ctx.fillStyle = "#ff6a3d";
      ctx.fillText(bannerText, 0, 0);
      ctx.restore();
    }

    function drawVignette(dtReal) {
      if (hurtFlash > 0) {
        hurtFlash = Math.max(0, hurtFlash - dtReal * 2.6);
        var g = ctx.createRadialGradient(cx, cy, R * 0.35, cx, cy, R * 1.25);
        g.addColorStop(0, "rgba(255,46,77,0)");
        g.addColorStop(1, "rgba(255,46,77," + (0.5 * hurtFlash).toFixed(3) + ")");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, Hh);
      }
    }

    /* One frame. `dtReal` is wall-clock seconds since the last frame — effects
       animate on real time even though the sim runs on a fixed step. */
    function draw(run, dtReal) {
      dtReal = Math.min(0.05, Math.max(0, dtReal));
      drainEvents(run);

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, Hh);

      if (shake > 0.05) {
        shake = Math.max(0, shake - dtReal * 26);
        if (!reduce) {
          ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
        }
      }

      drawArcs(run);
      drawWall(run);
      drawZombies(run);
      drawGun(run, dtReal);
      drawEffects(dtReal);
      drawBanner(run, dtReal);
      drawVignette(dtReal);
      lastFocus = run.focus;
    }

    /* Screen-space point -> arc index. Taps near the dead centre are ignored so
       a thumb resting on the turret does not fling your aim around. */
    function arcAt(clientX, clientY) {
      var rect = canvas.getBoundingClientRect();
      var dx = (clientX - rect.left) - cx;
      var dy = (clientY - rect.top) - cy;
      if (Math.sqrt(dx * dx + dy * dy) < wallR * 0.6) return -1;
      return arcOfAngle(Math.atan2(dy, dx));
    }

    resize();
    return { draw: draw, resize: resize, arcAt: arcAt, kick: function (m) { shake = Math.max(shake, m); } };
  }

  H.createRenderer = createRenderer;
})();
