/* idol — the renderer. Canvas 2D, layered, parameterized entirely by the
   genome; every animated quantity arrives in `st` from the puppet.

   Layer order (the grammar from the design memo — hair as components, eyes as
   layered 2D, the highlight on its own runtime layer so it can be killed):
     1. back hair component        6. sidelocks
     2. legs + shoes               7. face features (brows / EYES / nose / mouth)
     3. torso in outfit            8. bangs component
     4. arms + hands               9. ahoge + accessory
     5. head base

   Jank is the enemy: broken software reads as broken, not unsafe. Only the
   sanctioned slots (highlight kill, pupil, glitch ghost) may look wrong.

   Girl-space: x ∈ [-1,1], head center (0, -0.72), feet ~0.68. The caller
   sizes the canvas; render() sets its own transform. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var I = NS.IDOL = NS.IDOL || {};

  var TAU = Math.PI * 2;

  /* ── small path helpers ── */
  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, TAU);
  }
  function capsule(ctx, x1, y1, x2, y2, w) {
    ctx.beginPath();
    ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.lineWidth = w; ctx.lineCap = "round";
    ctx.stroke();
  }
  function fillCss(ctx, c) { ctx.fillStyle = I.genome.css(c); }
  function strokeCss(ctx, c) { ctx.strokeStyle = I.genome.css(c); }

  /* ══ HAIR — back components ══════════════════════════════════════════ */
  function drawBackHair(ctx, g, st) {
    var C = g.chroma, h = g.hair, sway = st.hairSway;
    fillCss(ctx, C.hairRgb);
    var tipX = sway.x, tipR = sway.r;

    function strand(sideX, topY, len, wob, w) {
      // a tapered lock: quad curves out then in, tip displaced by sway
      ctx.beginPath();
      ctx.moveTo(sideX - w, topY);
      ctx.quadraticCurveTo(sideX - w * 1.5 + tipX * 0.4, topY + len * 0.5, sideX + tipX + wob, topY + len);
      ctx.quadraticCurveTo(sideX + w * 1.5 + tipX * 0.4, topY + len * 0.5, sideX + w, topY);
      ctx.quadraticCurveTo(sideX, topY - w * 0.6, sideX - w, topY);
      ctx.fill();
    }

    switch (h.back) {
      case "long":
        ctx.beginPath();
        ctx.moveTo(-0.38, -0.95);
        ctx.quadraticCurveTo(-0.52 + tipX * 0.3, -0.3, -0.40 + tipX, 0.28);
        ctx.quadraticCurveTo(-0.2 + tipX, 0.36, 0 + tipX, 0.30);
        ctx.quadraticCurveTo(0.2 + tipX, 0.36, 0.40 + tipX, 0.28);
        ctx.quadraticCurveTo(0.52 + tipX * 0.3, -0.3, 0.38, -0.95);
        ctx.quadraticCurveTo(0, -1.18, -0.38, -0.95);
        ctx.fill();
        break;
      case "hime":
        ctx.beginPath();
        ctx.moveTo(-0.40, -0.95);
        ctx.lineTo(-0.42 + tipX, 0.22);
        ctx.lineTo(0.42 + tipX, 0.22);
        ctx.lineTo(0.40, -0.95);
        ctx.quadraticCurveTo(0, -1.18, -0.40, -0.95);
        ctx.fill();
        // blunt-cut shadow line at the hem
        strokeCss(ctx, C.hairShadow); ctx.lineWidth = 0.02;
        ctx.beginPath(); ctx.moveTo(-0.40 + tipX, 0.20); ctx.lineTo(0.40 + tipX, 0.20); ctx.stroke();
        break;
      case "bob":
        ctx.beginPath();
        ctx.moveTo(-0.40, -0.92);
        ctx.quadraticCurveTo(-0.55, -0.5, -0.42 + tipX * 0.5, -0.28);
        ctx.quadraticCurveTo(0, -0.12 + tipR * 0.1, 0.42 + tipX * 0.5, -0.28);
        ctx.quadraticCurveTo(0.55, -0.5, 0.40, -0.92);
        ctx.quadraticCurveTo(0, -1.16, -0.40, -0.92);
        ctx.fill();
        break;
      case "twintails":
        // head-cap plus two bunches
        ellipse(ctx, 0, -0.86, 0.42, 0.34); ctx.fill();
        strand(-0.42, -0.80, 1.05, -0.06, 0.13);
        strand(0.42, -0.80, 1.05, 0.06, 0.13);
        break;
      case "ponytail":
        ellipse(ctx, 0, -0.86, 0.42, 0.34); ctx.fill();
        strand(0.30, -1.02, 1.0, 0.05, 0.14);
        break;
      case "drills":
        ellipse(ctx, 0, -0.86, 0.42, 0.34); ctx.fill();
        for (var s = -1; s <= 1; s += 2) {
          for (var k = 0; k < 4; k++) {
            var dy = -0.55 + k * 0.24;
            var rw = 0.13 - k * 0.024;
            ellipse(ctx, s * (0.44 + k * 0.015) + tipX * (k / 4), dy, rw, 0.15);
            ctx.fill();
            if (k < 3) { fillCss(ctx, C.hairShadow); ellipse(ctx, s * (0.44 + k * 0.015) + tipX * (k / 4), dy + 0.10, rw * 0.92, 0.035); ctx.fill(); fillCss(ctx, C.hairRgb); }
          }
        }
        break;
      case "wavy":
        ctx.beginPath();
        ctx.moveTo(-0.38, -0.95);
        var steps = 8;
        for (var i2 = 0; i2 <= steps; i2++) {
          var yy = -0.95 + (1.25 * i2) / steps;
          var xx = -0.42 - Math.sin(i2 * 1.9) * 0.05 + tipX * (i2 / steps);
          ctx.lineTo(xx, yy);
        }
        for (var i3 = steps; i3 >= 0; i3--) {
          var yy2 = -0.95 + (1.25 * i3) / steps;
          var xx2 = 0.42 + Math.sin(i3 * 1.9) * 0.05 + tipX * (i3 / steps);
          ctx.lineTo(xx2, yy2);
        }
        ctx.quadraticCurveTo(0, -1.18, -0.38, -0.95);
        ctx.fill();
        break;
    }

    // ring highlight across the crown — the "angel band" anime sheen
    ctx.save();
    ctx.globalAlpha = 0.55;
    strokeCss(ctx, C.hairLight);
    ctx.lineWidth = 0.045; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(0, -0.88, 0.30, 0.22, 0, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  }

  /* ══ BODY ════════════════════════════════════════════════════════════ */
  function drawLegs(ctx, g, st) {
    var C = g.chroma;
    for (var s = -1; s <= 1; s += 2) {
      var ph = st.legPhase == null ? 0 : st.legPhase + (s < 0 ? 0 : Math.PI);
      var swing = st.legPhase == null ? s * 0.03 : Math.sin(ph) * 0.30;
      var lift = st.legPhase == null ? 0 : Math.max(0, Math.cos(ph)) * 0.06;
      var hx = s * 0.085, hy = 0.14;
      var ax = hx + Math.sin(swing) * 0.45, ay = 0.60 - lift;
      // stocking
      strokeCss(ctx, g.outfit === "miko" ? C.outfit2Rgb : C.outfit2Rgb);
      capsule(ctx, hx, hy, ax, ay, 0.075);
      // shoe
      fillCss(ctx, C.outfit1Shadow);
      ctx.save();
      ctx.translate(ax, ay + 0.055);
      ctx.rotate(swing * 0.5);
      ctx.beginPath();
      ctx.roundRect(-0.065, -0.035, 0.13, 0.07, 0.03);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawTorso(ctx, g, st) {
    var C = g.chroma;
    var sw = 0.27 * g.soma.shoulderW; // shoulder half-width
    // torso block: shoulders (-0.24) → waist (0.10)
    function torsoPath(wTop, wBot, yTop, yBot) {
      ctx.beginPath();
      ctx.moveTo(-wTop, yTop);
      ctx.quadraticCurveTo(-wTop * 0.9, (yTop + yBot) / 2, -wBot, yBot);
      ctx.lineTo(wBot, yBot);
      ctx.quadraticCurveTo(wTop * 0.9, (yTop + yBot) / 2, wTop, yTop);
      ctx.quadraticCurveTo(0, yTop - 0.06, -wTop, yTop);
      ctx.closePath();
    }
    function skirtPath(yTop, yBot, wTop, wBot, pleat) {
      ctx.beginPath();
      ctx.moveTo(-wTop, yTop);
      ctx.lineTo(-wBot, yBot);
      if (pleat) {
        var n = 5;
        for (var i = 0; i <= n; i++) {
          var x = -wBot + (2 * wBot * i) / n;
          ctx.lineTo(x, yBot + (i % 2 ? 0.035 : 0));
        }
      } else {
        ctx.quadraticCurveTo(0, yBot + 0.06, wBot, yBot);
      }
      ctx.lineTo(wTop, yTop);
      ctx.closePath();
    }

    switch (g.outfit) {
      case "sailor":
        fillCss(ctx, C.outfit1Rgb); torsoPath(sw, 0.17, -0.24, 0.12); ctx.fill();
        // collar
        fillCss(ctx, C.outfit2Rgb);
        ctx.beginPath();
        ctx.moveTo(-sw * 0.95, -0.22); ctx.lineTo(0, 0.02); ctx.lineTo(sw * 0.95, -0.22);
        ctx.lineTo(sw * 0.7, -0.26); ctx.lineTo(0, -0.10); ctx.lineTo(-sw * 0.7, -0.26);
        ctx.closePath(); ctx.fill();
        strokeCss(ctx, C.outfit1Rgb); ctx.lineWidth = 0.012;
        ctx.beginPath(); ctx.moveTo(-sw * 0.83, -0.225); ctx.lineTo(0, -0.005); ctx.lineTo(sw * 0.83, -0.225); ctx.stroke();
        // neckerchief
        fillCss(ctx, C.accentRgb);
        ctx.beginPath(); ctx.moveTo(-0.045, -0.05); ctx.lineTo(0.045, -0.05); ctx.lineTo(0.02, 0.06); ctx.lineTo(-0.02, 0.06); ctx.closePath(); ctx.fill();
        // skirt
        fillCss(ctx, C.outfit1Shadow); skirtPath(0.10, 0.34, 0.17, 0.30, true); ctx.fill();
        break;
      case "hoodie":
        // hood lump behind neck
        fillCss(ctx, C.outfit1Shadow);
        ellipse(ctx, 0, -0.28, 0.20, 0.10); ctx.fill();
        fillCss(ctx, C.outfit1Rgb); torsoPath(sw + 0.02, 0.20, -0.24, 0.16); ctx.fill();
        // pocket
        fillCss(ctx, C.outfit1Shadow);
        ctx.beginPath(); ctx.roundRect(-0.11, 0.04, 0.22, 0.10, 0.03); ctx.fill();
        // drawstrings
        strokeCss(ctx, C.outfit2Rgb); ctx.lineWidth = 0.014; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-0.035, -0.20); ctx.lineTo(-0.045, -0.08); ctx.moveTo(0.035, -0.20); ctx.lineTo(0.045, -0.08); ctx.stroke();
        // shorts
        fillCss(ctx, C.outfit1Shadow); skirtPath(0.14, 0.26, 0.19, 0.22, false); ctx.fill();
        break;
      case "dress":
        fillCss(ctx, C.outfit1Rgb);
        torsoPath(sw, 0.16, -0.24, 0.10); ctx.fill();
        skirtPath(0.08, 0.36, 0.16, 0.32, false); ctx.fill();
        // peter-pan collar + waist ribbon
        fillCss(ctx, C.outfit2Rgb);
        ellipse(ctx, -0.07, -0.225, 0.075, 0.045, 0.3); ctx.fill();
        ellipse(ctx, 0.07, -0.225, 0.075, 0.045, -0.3); ctx.fill();
        fillCss(ctx, C.accentRgb);
        ctx.beginPath(); ctx.roundRect(-0.16, 0.06, 0.32, 0.045, 0.02); ctx.fill();
        break;
      case "miko":
        // white kosode with wide sleeves (sleeves drawn in arms pass via flag)
        fillCss(ctx, C.outfit2Rgb); torsoPath(sw, 0.17, -0.24, 0.12); ctx.fill();
        // chest wrap lines
        strokeCss(ctx, C.outfit1Shadow); ctx.lineWidth = 0.012;
        ctx.beginPath(); ctx.moveTo(-0.10, -0.24); ctx.lineTo(0.06, -0.02); ctx.moveTo(0.10, -0.24); ctx.lineTo(-0.06, -0.02); ctx.stroke();
        // red hakama
        fillCss(ctx, C.accentRgb); skirtPath(0.08, 0.40, 0.17, 0.26, true); ctx.fill();
        fillCss(ctx, C.outfit1Shadow);
        ctx.beginPath(); ctx.roundRect(-0.17, 0.055, 0.34, 0.04, 0.015); ctx.fill();
        break;
      case "blazer":
        // shirt
        fillCss(ctx, C.outfit2Rgb);
        ctx.beginPath(); ctx.moveTo(-0.09, -0.24); ctx.lineTo(0.09, -0.24); ctx.lineTo(0.05, 0.06); ctx.lineTo(-0.05, 0.06); ctx.closePath(); ctx.fill();
        // jacket open
        fillCss(ctx, C.outfit1Rgb);
        ctx.beginPath();
        ctx.moveTo(-sw, -0.24); ctx.quadraticCurveTo(-sw, 0.0, -0.16, 0.14);
        ctx.lineTo(-0.055, 0.02); ctx.lineTo(-0.09, -0.24); ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sw, -0.24); ctx.quadraticCurveTo(sw, 0.0, 0.16, 0.14);
        ctx.lineTo(0.055, 0.02); ctx.lineTo(0.09, -0.24); ctx.closePath(); ctx.fill();
        // ribbon
        fillCss(ctx, C.accentRgb);
        ctx.beginPath(); ctx.moveTo(0, -0.16); ctx.lineTo(-0.06, -0.20); ctx.lineTo(-0.055, -0.11); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -0.16); ctx.lineTo(0.06, -0.20); ctx.lineTo(0.055, -0.11); ctx.closePath(); ctx.fill();
        ellipse(ctx, 0, -0.155, 0.022, 0.022); ctx.fill();
        // skirt
        fillCss(ctx, C.outfit1Shadow); skirtPath(0.10, 0.32, 0.17, 0.29, true); ctx.fill();
        break;
      case "stage":
        fillCss(ctx, C.outfit1Rgb); torsoPath(sw, 0.16, -0.24, 0.10); ctx.fill();
        // bodice bow
        fillCss(ctx, C.accentRgb);
        ctx.beginPath(); ctx.moveTo(0, -0.10); ctx.lineTo(-0.08, -0.15); ctx.lineTo(-0.07, -0.05); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, -0.10); ctx.lineTo(0.08, -0.15); ctx.lineTo(0.07, -0.05); ctx.closePath(); ctx.fill();
        ellipse(ctx, 0, -0.10, 0.025, 0.025); ctx.fill();
        // double frill skirt
        fillCss(ctx, C.outfit2Rgb); skirtPath(0.08, 0.26, 0.16, 0.30, true); ctx.fill();
        fillCss(ctx, C.outfit1Rgb); skirtPath(0.10, 0.36, 0.15, 0.34, true); ctx.fill();
        ctx.save(); ctx.globalAlpha = 0.8;
        strokeCss(ctx, C.accentRgb); ctx.lineWidth = 0.015;
        ctx.beginPath(); ctx.moveTo(-0.33, 0.365); ctx.quadraticCurveTo(0, 0.42, 0.33, 0.365); ctx.stroke();
        ctx.restore();
        break;
    }
  }

  function drawArms(ctx, g, st) {
    var C = g.chroma;
    var sw = 0.27 * g.soma.shoulderW;
    for (var s = -1; s <= 1; s += 2) {
      var ang = s < 0 ? st.armL : st.armR;      // radians from straight-down, + = outward raise
      var bend = s < 0 ? st.armBendL : st.armBendR;
      var sx = s * (sw - 0.02), sy = -0.20;
      var elx = sx + Math.sin(ang) * 0.22 * s, ely = sy + Math.cos(ang) * 0.22;
      // elbow offset perpendicular for bend
      var px = Math.cos(ang) * bend * 0.10 * s, py = Math.sin(ang) * bend * 0.10;
      var mx = (sx + elx) / 2 + px, my = (sy + ely) / 2 + py;
      var hx2 = elx + Math.sin(ang) * 0.16, hy2 = ely + Math.cos(ang) * 0.16;
      // sleeve (outfit-colored upper arm); miko gets wide sleeves
      strokeCss(ctx, g.outfit === "miko" ? C.outfit2Rgb : C.outfit1Rgb);
      ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(mx, my, elx, ely);
      ctx.lineWidth = g.outfit === "miko" ? 0.13 : 0.095; ctx.stroke();
      if (g.outfit === "stage") { // puff sleeve
        fillCss(ctx, C.outfit2Rgb); ellipse(ctx, sx + s * 0.02, sy + 0.03, 0.075, 0.065); ctx.fill();
      }
      // forearm skin
      strokeCss(ctx, C.skinRgb);
      ctx.beginPath(); ctx.moveTo(elx, ely); ctx.lineTo(hx2, hy2);
      ctx.lineWidth = 0.07; ctx.stroke();
      // hand
      fillCss(ctx, C.skinRgb); ellipse(ctx, hx2, hy2, 0.045, 0.045); ctx.fill();
    }
  }

  /* ══ HEAD + FACE ═════════════════════════════════════════════════════ */
  function drawHead(ctx, g) {
    var C = g.chroma;
    fillCss(ctx, C.skinRgb);
    // neck
    ctx.beginPath(); ctx.roundRect(-0.045, -0.38, 0.09, 0.16, 0.03); ctx.fill();
    // neck shadow
    ctx.save(); ctx.globalAlpha = 0.35; fillCss(ctx, C.skinShadow);
    ellipse(ctx, 0, -0.345, 0.05, 0.035); ctx.fill(); ctx.restore();
    // face
    ellipse(ctx, 0, -0.72, 0.40 * g.soma.headW, 0.38 * g.soma.headH); ctx.fill();
  }

  function drawSidelocks(ctx, g, st) {
    var C = g.chroma, len = 0.25 + g.hair.sidelockLen * 0.45;
    fillCss(ctx, C.hairRgb);
    for (var s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.moveTo(s * 0.30, -0.98);
      ctx.quadraticCurveTo(s * 0.44, -0.80, s * (0.40 + st.hairSway.x * 0.2), -0.72 + len * 0.5);
      ctx.quadraticCurveTo(s * 0.38 + st.hairSway.x * 0.3, -0.55 + len * 0.5, s * 0.30 + st.hairSway.x * 0.4, -0.48 + len * 0.5);
      ctx.quadraticCurveTo(s * 0.33, -0.75, s * 0.24, -0.92);
      ctx.closePath(); ctx.fill();
    }
  }

  /* The eye — the beguilement organ. Layers: sclera → iris (gradient, gaze
     offset) → pupil (dilation) → highlights (own alpha, killable) → lash.
     Drawn in a local frame (origin at eye center, +x = outward) mirrored for
     the left eye — so the lash flick always points outward, and the iris
     offset is un-mirrored so both pupils track the cursor the same way. */
  function drawEye(ctx, g, st, side) {
    var C = g.chroma, s = side;
    var ex = s * 0.152 * g.soma.eyeSpacing * g.soma.headW;
    var ey = -0.72 + 0.038 + g.soma.eyeY;
    var ew = 0.10 * g.soma.eyeSize;               // half-width
    var eh0 = 0.115 * g.soma.eyeSize;             // half-height at full open
    var open = Math.max(0.04, st.lidOpen * (1 - st.lid));
    var eh = eh0 * open;
    var tilt = g.soma.eyeTilt;                    // + = tsuri-me (outer corner up)

    var irisC = s < 0 ? C.eye1Rgb : C.eye2Rgb;
    var deepC = s < 0 ? C.eye1Deep : C.eye2Deep;

    ctx.save();
    ctx.translate(ex, ey);
    if (s < 0) ctx.scale(-1, 1);                  // local frame: -x = inner (nose), +x = outer

    function eyePath(mult) {
      var m = mult || 1;
      ctx.beginPath();
      ctx.moveTo(-ew * m, 0);
      ctx.quadraticCurveTo(-ew * 0.4, -eh * 2.05 - tilt * 0.5, ew * m, -tilt);
      ctx.quadraticCurveTo(ew * 0.55, eh * 1.7, -ew * m, 0);
      ctx.closePath();
    }

    // sclera
    ctx.save();
    eyePath(1); ctx.clip();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-ew * 1.2, -eh * 2.4, ew * 2.4, eh * 4.2);
    // top shadow cast by lashes
    ctx.save(); ctx.globalAlpha = 0.18;
    fillCss(ctx, C.hairShadow);
    ctx.fillRect(-ew * 1.2, -eh * 2.4, ew * 2.4, eh * 1.1);
    ctx.restore();

    if (open > 0.15) {
      // iris — gradient: deep at top, hue at bottom. Gaze offset is applied
      // UN-mirrored (s * … cancels the frame flip) so both eyes pursue the
      // cursor in the same screen direction.
      var gx = s * st.gaze.x * ew * 0.35, gy = st.gaze.y * eh * 0.5 + eh * 0.1;
      var ir = eh0 * 0.92;
      var iy = gy - eh * 0.15;
      var grad = ctx.createLinearGradient(0, iy - ir, 0, iy + ir);
      grad.addColorStop(0, I.genome.css(deepC));
      grad.addColorStop(0.55, I.genome.css(irisC));
      grad.addColorStop(1, I.genome.css(deepC));
      ctx.fillStyle = grad;
      ellipse(ctx, gx, iy, ir * 0.72, ir);
      ctx.fill();
      // dark rim
      ctx.save(); ctx.globalAlpha = 0.5;
      strokeCss(ctx, deepC); ctx.lineWidth = 0.012;
      ellipse(ctx, gx, iy, ir * 0.72, ir); ctx.stroke();
      ctx.restore();
      // pupil — dilation is a sanctioned menace slot
      var pr = ir * (0.30 + st.pupilDilate * 0.22);
      ctx.fillStyle = "#1a1014";
      ellipse(ctx, gx, iy, pr * 0.8, pr);
      ctx.fill();

      // highlights — their own runtime layer. deadEyes fades them to zero:
      // the cheapest menace in the medium, and it's on a switch.
      var ha = 1 - st.deadEyes;
      if (ha > 0.01) {
        ctx.save();
        ctx.globalAlpha = ha * 0.95;
        ctx.fillStyle = "#fff";
        ellipse(ctx, gx - ir * 0.28, iy - ir * 0.34, ir * 0.24, ir * 0.30);
        ctx.fill();
        ctx.globalAlpha = ha * 0.6;
        ellipse(ctx, gx + ir * 0.30, iy + ir * 0.38, ir * 0.11, ir * 0.11);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore(); // un-clip

    // upper lash — thick, with the outer-corner flick
    strokeCss(ctx, C.hairShadow);
    ctx.lineCap = "round";
    ctx.lineWidth = 0.028 * g.soma.eyeSize;
    ctx.beginPath();
    ctx.moveTo(-ew * 1.05, eh * 0.2);
    ctx.quadraticCurveTo(-ew * 0.4, -eh * 2.3 - tilt * 0.6, ew * 1.02, -tilt - eh * 0.1);
    ctx.stroke();
    // the flick
    ctx.lineWidth = 0.02 * g.soma.eyeSize;
    ctx.beginPath();
    ctx.moveTo(ew * 1.02, -tilt - eh * 0.1);
    ctx.lineTo(ew * 1.28, -tilt - eh * 0.55);
    ctx.stroke();
    // lower lid hint — rises with squint (joy)
    ctx.save();
    ctx.globalAlpha = 0.4 + st.squint * 0.5;
    ctx.lineWidth = 0.012;
    ctx.beginPath();
    ctx.moveTo(-ew * 0.7, eh * (1.1 - st.squint * 0.5));
    ctx.quadraticCurveTo(0, eh * (1.55 - st.squint * 0.9), ew * 0.7, eh * (0.9 - st.squint * 0.5));
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // un-mirror
  }

  function drawBrow(ctx, g, st, side) {
    var C = g.chroma, s = side;
    var ex = s * 0.152 * g.soma.eyeSpacing * g.soma.headW;
    var ey = -0.72 + 0.038 + g.soma.eyeY;
    var bw = 0.085 * g.soma.eyeSize;
    var by = ey - 0.115 * g.soma.eyeSize - 0.045 - st.browRaise * 0.03 + g.soma.browY;
    // browTilt: + = inner-up (sorrow), - = inner-down (angry)
    var innerDy = -st.browTilt * 0.035;
    ctx.save();
    ctx.translate(ex, by);
    if (s < 0) ctx.scale(-1, 1);                  // local: -x = inner
    strokeCss(ctx, C.hairShadow);
    ctx.lineWidth = 0.016; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-bw, innerDy);                                          // inner end
    ctx.quadraticCurveTo(0, -0.02 - st.browRaise * 0.02, bw, -0.01);   // outer end
    ctx.stroke();
    ctx.restore();
  }

  function drawMouth(ctx, g, st) {
    var mx = 0, my = -0.72 + 0.38 * g.soma.headH * 0.55;
    var mw = 0.075 * g.soma.mouthW;
    var curve = st.mouthCurve;      // -1 frown .. +1 smile
    var open = st.mouthOpen;        // 0..1
    ctx.lineCap = "round";

    if (st.mouthForm === "w") {     // cat mouth — the "fun" face
      strokeCss(ctx, { r: 120, g: 60, b: 70 });
      ctx.lineWidth = 0.016;
      ctx.beginPath();
      ctx.moveTo(mx - mw, my - 0.008);
      ctx.quadraticCurveTo(mx - mw / 2, my + 0.022, mx, my - 0.004);
      ctx.quadraticCurveTo(mx + mw / 2, my + 0.022, mx + mw, my - 0.008);
      ctx.stroke();
      return;
    }
    if (st.mouthForm === "o" || open > 0.25) {
      var oh = Math.max(st.mouthForm === "o" ? 0.05 : 0.02, open * 0.075);
      // open mouth: dark fill + tongue + optional fang
      ctx.fillStyle = "#7a3040";
      ellipse(ctx, mx, my + oh * 0.15, mw * (0.7 + open * 0.4), oh);
      ctx.fill();
      ctx.fillStyle = "#d98a94";
      ellipse(ctx, mx, my + oh * 0.55, mw * 0.5, oh * 0.45);
      ctx.fill();
      if (g.extras.fang) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(mx + mw * 0.3, my - oh * 0.5);
        ctx.lineTo(mx + mw * 0.52, my - oh * 0.5);
        ctx.lineTo(mx + mw * 0.42, my - oh * 0.02);
        ctx.closePath(); ctx.fill();
      }
      // lip line
      strokeCss(ctx, { r: 120, g: 60, b: 70 });
      ctx.lineWidth = 0.013;
      ctx.beginPath();
      ctx.moveTo(mx - mw * 0.8, my - oh * 0.3);
      ctx.quadraticCurveTo(mx, my - oh * (0.9 + curve * 0.3), mx + mw * 0.8, my - oh * 0.3);
      ctx.stroke();
      return;
    }
    // closed: a curve
    strokeCss(ctx, { r: 120, g: 60, b: 70 });
    ctx.lineWidth = 0.016;
    ctx.beginPath();
    ctx.moveTo(mx - mw, my - curve * 0.012);
    ctx.quadraticCurveTo(mx, my + curve * 0.035, mx + mw, my - curve * 0.012);
    ctx.stroke();
  }

  function drawFaceExtras(ctx, g, st) {
    var C = g.chroma;
    // blush — alpha rides soma.blush + the puppet's blushBoost beat
    var ba = Math.min(1, g.soma.blush * 0.55 + st.blushBoost);
    if (ba > 0.03) {
      ctx.save();
      ctx.globalAlpha = ba * 0.45;
      fillCss(ctx, C.blushRgb);
      ellipse(ctx, -0.21, -0.585, 0.06, 0.032); ctx.fill();
      ellipse(ctx, 0.21, -0.585, 0.06, 0.032); ctx.fill();
      ctx.restore();
    }
    // nose — a whisper
    ctx.save(); ctx.globalAlpha = 0.4;
    strokeCss(ctx, C.skinShadow); ctx.lineWidth = 0.01; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0.004, -0.585); ctx.lineTo(0.012, -0.565); ctx.stroke();
    ctx.restore();
    if (g.extras.freckles) {
      ctx.save(); ctx.globalAlpha = 0.5; fillCss(ctx, C.skinShadow);
      var fp = [[-0.09, -0.60], [-0.05, -0.585], [-0.13, -0.585], [0.09, -0.60], [0.05, -0.585], [0.13, -0.585]];
      for (var i = 0; i < fp.length; i++) { ellipse(ctx, fp[i][0], fp[i][1], 0.008, 0.008); ctx.fill(); }
      ctx.restore();
    }
    if (g.extras.mole) {
      fillCss(ctx, { r: 60, g: 40, b: 40 });
      ellipse(ctx, 0.10, -0.485, 0.009, 0.009); ctx.fill();
    }
  }

  /* ══ HAIR — front components ═════════════════════════════════════════ */
  function drawBangs(ctx, g, st) {
    var C = g.chroma, hw = 0.40 * g.soma.headW, fluff = g.hair.fluff;
    fillCss(ctx, C.hairRgb);
    var top = -0.72 - 0.38 * g.soma.headH; // crown y

    function fringeBase(pts) {
      ctx.beginPath();
      ctx.moveTo(-hw * 1.02, -0.80);
      ctx.quadraticCurveTo(-hw * 1.05, top - 0.06, 0, top - 0.10 * fluff);
      ctx.quadraticCurveTo(hw * 1.05, top - 0.06, hw * 1.02, -0.80);
      // jagged bottom edge right→left through pts (x, y pairs)
      for (var i = pts.length - 1; i >= 0; i--) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath(); ctx.fill();
    }
    var b = g.hair.bangs;
    if (b === "straight") {
      fringeBase([[-hw * 0.95, -0.80], [-hw * 0.66, -0.845], [-hw * 0.4, -0.83], [-hw * 0.13, -0.855], [hw * 0.13, -0.85], [hw * 0.4, -0.84], [hw * 0.66, -0.85], [hw * 0.95, -0.80]]);
    } else if (b === "m") {
      fringeBase([[-hw * 0.95, -0.79], [-hw * 0.6, -0.87], [-hw * 0.3, -0.82], [0, -0.885], [hw * 0.3, -0.82], [hw * 0.6, -0.87], [hw * 0.95, -0.79]]);
    } else if (b === "side") {
      fringeBase([[-hw * 0.95, -0.78], [-hw * 0.5, -0.83], [-hw * 0.1, -0.865], [hw * 0.35, -0.885], [hw * 0.7, -0.86], [hw * 0.95, -0.78]]);
      // the swept mass line
      strokeCss(ctx, C.hairShadow); ctx.lineWidth = 0.012;
      ctx.beginPath(); ctx.moveTo(hw * 0.35, top - 0.02); ctx.quadraticCurveTo(hw * 0.1, -0.86, -hw * 0.5, -0.845); ctx.stroke();
    } else if (b === "hime") {
      // blunt straight cut just above the brows
      ctx.beginPath();
      ctx.moveTo(-hw * 1.0, -0.80);
      ctx.quadraticCurveTo(-hw * 1.05, top - 0.06, 0, top - 0.10 * fluff);
      ctx.quadraticCurveTo(hw * 1.05, top - 0.06, hw * 1.0, -0.80);
      ctx.lineTo(hw * 0.98, -0.865);
      ctx.lineTo(-hw * 0.98, -0.865);
      ctx.closePath(); ctx.fill();
      strokeCss(ctx, C.hairShadow); ctx.lineWidth = 0.014;
      ctx.beginPath(); ctx.moveTo(-hw * 0.95, -0.862); ctx.lineTo(hw * 0.95, -0.862); ctx.stroke();
    } else if (b === "choppy") {
      fringeBase([[-hw * 0.95, -0.79], [-hw * 0.75, -0.86], [-hw * 0.55, -0.815], [-hw * 0.33, -0.875], [-hw * 0.12, -0.82], [hw * 0.08, -0.88], [hw * 0.3, -0.825], [hw * 0.52, -0.87], [hw * 0.74, -0.82], [hw * 0.95, -0.79]]);
    } else { // center — two curtains
      ctx.beginPath();
      ctx.moveTo(-hw * 1.02, -0.78);
      ctx.quadraticCurveTo(-hw * 1.05, top - 0.06, 0, top - 0.09 * fluff);
      ctx.quadraticCurveTo(-0.02, -0.84, -0.06, -0.83);
      ctx.quadraticCurveTo(-hw * 0.5, -0.86, -hw * 0.95, -0.72);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(hw * 1.02, -0.78);
      ctx.quadraticCurveTo(hw * 1.05, top - 0.06, 0, top - 0.09 * fluff);
      ctx.quadraticCurveTo(0.02, -0.84, 0.06, -0.83);
      ctx.quadraticCurveTo(hw * 0.5, -0.86, hw * 0.95, -0.72);
      ctx.closePath(); ctx.fill();
    }
  }

  function drawAhoge(ctx, g, st) {
    var a = g.hair.ahoge;
    if (a === "none") return;
    var C = g.chroma, sway = st.hairSway.x * 1.4;
    var top = -0.72 - 0.38 * g.soma.headH - 0.08;
    strokeCss(ctx, C.hairRgb); ctx.lineWidth = 0.022; ctx.lineCap = "round";
    function one(x0, dx, kink) {
      ctx.beginPath();
      ctx.moveTo(x0, top + 0.06);
      ctx.quadraticCurveTo(x0 + dx * 0.3 + sway * 0.3, top - 0.14, x0 + dx + sway + kink, top - 0.20 - Math.abs(dx) * 0.4);
      ctx.stroke();
    }
    if (a === "single") one(0, 0.06, 0.03);
    else if (a === "double") { one(-0.02, -0.07, -0.02); one(0.02, 0.07, 0.02); }
    else if (a === "bolt") {
      ctx.beginPath();
      ctx.moveTo(0, top + 0.06);
      ctx.lineTo(-0.05 + sway * 0.4, top - 0.10);
      ctx.lineTo(0.03 + sway * 0.7, top - 0.16);
      ctx.lineTo(-0.02 + sway, top - 0.25);
      ctx.stroke();
    }
  }

  function drawAccessory(ctx, g, st) {
    var C = g.chroma, acc = g.hair.accessory;
    if (acc === "none") return;
    fillCss(ctx, C.accentRgb);
    if (acc === "ribbon") {
      var spots = g.hair.back === "twintails" ? [[-0.42, -0.82], [0.42, -0.82]] : [[0.30, -0.95]];
      for (var i = 0; i < spots.length; i++) {
        var x = spots[i][0], y = spots[i][1];
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 0.07, y - 0.06); ctx.lineTo(x - 0.06, y + 0.04); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.07, y - 0.06); ctx.lineTo(x + 0.06, y + 0.04); ctx.closePath(); ctx.fill();
        ellipse(ctx, x, y, 0.02, 0.02); ctx.fill();
      }
    } else if (acc === "clip") {
      ctx.save();
      ctx.translate(-0.24, -0.90); ctx.rotate(-0.5);
      ctx.beginPath(); ctx.roundRect(-0.05, -0.012, 0.10, 0.024, 0.01); ctx.fill();
      ctx.restore();
    } else if (acc === "band") {
      strokeCss(ctx, C.accentRgb); ctx.lineWidth = 0.03; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.ellipse(0, -0.86, 0.40 * g.soma.headW * 0.98, 0.33, 0, Math.PI * 1.08, Math.PI * 1.92);
      ctx.stroke();
    }
  }

  /* ══ the glitch ghost — a sanctioned wrongness ═══════════════════════ */
  function drawGirl(ctx, g, st) {
    drawBackHair(ctx, g, st);
    drawLegs(ctx, g, st);
    drawTorso(ctx, g, st);
    drawArms(ctx, g, st);
    drawHead(ctx, g);
    drawSidelocks(ctx, g, st);
    drawFaceExtras(ctx, g, st);
    drawBrow(ctx, g, st, -1);
    drawBrow(ctx, g, st, 1);
    drawEye(ctx, g, st, -1);
    drawEye(ctx, g, st, 1);
    drawMouth(ctx, g, st);
    drawBangs(ctx, g, st);
    drawAhoge(ctx, g, st);
    drawAccessory(ctx, g, st);
  }

  /* render(ctx, W, H, genome, st) — full frame. st comes from the puppet. */
  function render(ctx, W, H, g, st) {
    ctx.clearRect(0, 0, W, H);
    var scale = Math.min(W / 2.1, H / 2.5);

    ctx.save();
    ctx.translate(W / 2 + st.leanX * scale, H * 0.50 + st.bob * scale);
    ctx.rotate(st.sway);
    ctx.scale(scale, scale);

    if (st.glitch > 0.02) {
      // ghost pass: offset, accent-tinted, additive — reads as signal trouble,
      // never as broken geometry
      ctx.save();
      ctx.globalAlpha = st.glitch * 0.35;
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(st.glitch * 0.03 * (st.glitchDir || 1), -st.glitch * 0.01);
      drawGirl(ctx, g, st);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = st.glitch * 0.2;
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(-st.glitch * 0.025 * (st.glitchDir || 1), st.glitch * 0.012);
      drawGirl(ctx, g, st);
      ctx.restore();
    }
    drawGirl(ctx, g, st);
    ctx.restore();

    // floor shadow
    ctx.save();
    ctx.globalAlpha = 0.30;
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.ellipse(W / 2 + st.leanX * scale, H * 0.50 + 0.72 * scale, 0.42 * scale, 0.05 * scale, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  I.draw = { render: render };
})();
