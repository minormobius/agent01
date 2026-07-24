/* idol — the renderer, v2. Rewritten against the actual conventions of anime
   illustration (animeoutline face structure + eyes, Wacom/Clip-Studio hair):

     FACE   — not an ellipse: a cranium circle + tapered jaw to a small chin,
              widest at the eye line.
     PLACE  — eyes BELOW the head's horizontal midpoint (big forehead); nose
              halfway between eye-top and chin; mouth just above halfway
              between nose and chin. One eye of space between the eyes.
     EYES   — taller than wide (moe), iris nearly fills, thick near-straight
              top lash with an outer flick, gradient dark-at-top.
     HAIR   — 3 sections (bangs/side/back), each built from tapered ribbon
              CLUMPS with pointed triangular tips, varied widths, negative
              space between clumps. Never a blob. Never single strands.
     LINE   — inked outlines (dark shade of the fill) + flat color + one cel
              shadow level. Line art is what makes it read as anime.
     FRAME  — bust-up. The face is the product; it gets the pixels.

   The interface to the rest of the system is unchanged: render(ctx, W, H,
   genome, st) with st from the puppet, plus metrics(genome) so the selftest
   can assert the conventions numerically. Genome is untouched — same seeds,
   same girls, better drawing. */
(function () {
  "use strict";
  var NS = (typeof window !== "undefined") ? window : globalThis;
  var I = NS.IDOL = NS.IDOL || {};

  var TAU = Math.PI * 2;

  function ellipse(ctx, x, y, rx, ry, rot) {
    ctx.beginPath();
    ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), rot || 0, 0, TAU);
  }
  function css(c) { return I.genome.css(c); }
  function fillCss(ctx, c) { ctx.fillStyle = css(c); }
  function strokeCss(ctx, c) { ctx.strokeStyle = css(c); }
  function dark(c, f) { // ink: a darker, slightly desaturated shade for outlines
    return { r: Math.round(c.r * f), g: Math.round(c.g * f), b: Math.round(c.b * f) };
  }

  /* ── THE clump: the primitive anime hair is actually made of — a tapered
     ribbon from a root segment to a POINTED tip, curving by `curve` along its
     normal. Pointed tips + varied widths + gaps = hair; blobs = helmet. */
  function clump(ctx, rootX, rootY, tipX, tipY, w, curve) {
    var dx = tipX - rootX, dy = tipY - rootY;
    var len = Math.sqrt(dx * dx + dy * dy) || 1;
    var nx = -dy / len, ny = dx / len;
    var cx = (rootX + tipX) / 2 + nx * curve, cy = (rootY + tipY) / 2 + ny * curve;
    ctx.beginPath();
    ctx.moveTo(rootX - nx * w / 2, rootY - ny * w / 2);
    ctx.quadraticCurveTo(cx - nx * w * 0.15, cy - ny * w * 0.15, tipX, tipY);
    ctx.quadraticCurveTo(cx + nx * w * 0.15, cy + ny * w * 0.15, rootX + nx * w / 2, rootY + ny * w / 2);
    ctx.closePath();
  }

  function ink(ctx, c, w) {
    strokeCss(ctx, c);
    ctx.lineWidth = w;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();
  }

  /* ── layout: every convention ratio in one place (metrics() exports these
     so the selftest can hold the renderer to them) ── */
  function layout(g) {
    var hw = 0.46 * g.soma.headW;              // half-width at the eye line
    var hh = g.soma.headH;
    var eyeH0 = 0.145 * g.soma.eyeSize;        // half-height, fully open
    var eyeW = 0.095 * g.soma.eyeSize;         // half-width → H/W ≈ 1.5 (moe)
    var L = {
      hw: hw, hh: hh,
      skullTopY: -0.60 * hh,
      eyeLineY: 0.02 + g.soma.eyeY,            // BELOW the midpoint (head spans ±0.60)
      chinY: 0.60 * hh,
      eyeX: 0.235 * g.soma.eyeSpacing * g.soma.headW,
      eyeH0: eyeH0, eyeW: eyeW,
      browY: -0.205 * hh + g.soma.browY,
      noseY: 0.27 * hh,                        // ≈ halfway eye-top → chin
      mouthY: 0.425 * hh,                      // ≈ just above halfway nose → chin
      blushX: 0.285 * g.soma.headW, blushY: 0.15 * hh,
      mouthW: 0.095 * g.soma.mouthW,
    };
    L.eyeTopY = L.eyeLineY - eyeH0;
    L.headMidY = (L.skullTopY + L.chinY) / 2;
    return L;
  }

  var BANG_CLUMPS = { straight: 5, m: 4, side: 4, hime: 3, choppy: 7, center: 4 };
  var BACK_TIPS = { long: 5, hime: 2, bob: 4, twintails: 2, ponytail: 1, drills: 2, wavy: 6 };

  function metrics(g) {
    var L = layout(g);
    return {
      eyeLineY: L.eyeLineY, headMidY: L.headMidY, chinY: L.chinY,
      eyeTopY: L.eyeTopY, noseY: L.noseY, mouthY: L.mouthY,
      eyeHW: L.eyeH0 / L.eyeW,
      bangClumps: BANG_CLUMPS[g.hair.bangs] || 4,
      backTips: BACK_TIPS[g.hair.back] || 3,
    };
  }

  /* ══ FACE outline — cranium + tapered jaw, widest at the eye line ════ */
  function facePath(ctx, L) {
    var hw = L.hw, hh = L.hh;
    ctx.beginPath();
    ctx.moveTo(-hw, 0.02);
    ctx.quadraticCurveTo(-hw * 1.05, -0.40 * hh, -hw * 0.55, -0.545 * hh);
    ctx.quadraticCurveTo(0, -0.635 * hh, hw * 0.55, -0.545 * hh);
    ctx.quadraticCurveTo(hw * 1.05, -0.40 * hh, hw, 0.02);
    ctx.quadraticCurveTo(hw * 0.96, 0.32 * hh, 0.115, 0.555 * hh);   // jaw taper
    ctx.quadraticCurveTo(0, 0.615 * hh, -0.115, 0.555 * hh);          // small chin
    ctx.quadraticCurveTo(-hw * 0.96, 0.32 * hh, -hw, 0.02);
    ctx.closePath();
  }

  /* ══ BACK HAIR — mass with a POINTED-TIP bottom edge, never a blob ═══ */
  function drawBackHair(ctx, g, st, L) {
    var C = g.chroma, sway = st.hairSway.x;
    var inkC = dark(C.hairShadow, 0.75);
    fillCss(ctx, C.hairRgb);

    function tipRow(y, w, tips, jitter) {
      // bottom edge: a row of pointed clump tips of varied length/width
      var pts = [];
      for (var i = 0; i <= tips; i++) pts.push(-w + (2 * w * i) / tips);
      for (var i = 0; i < tips; i++) {
        var xm = (pts[i] + pts[i + 1]) / 2 + sway * (0.5 + i / tips);
        var len = 0.10 + ((i * 37 + g.seed) % 10) / 10 * jitter;
        ctx.lineTo(pts[i] + sway * 0.3, y);
        ctx.lineTo(xm, y + len);
      }
      ctx.lineTo(pts[tips] + sway * 0.3, y);
    }

    ctx.beginPath();
    switch (g.hair.back) {
      case "long":
        ctx.moveTo(-0.42, -0.30);
        ctx.quadraticCurveTo(-0.62, 0.10, -0.52 + sway * 0.3, 0.72);
        tipRow(0.72, 0.52, 5, 0.16);
        ctx.quadraticCurveTo(0.62, 0.10, 0.42, -0.30);
        break;
      case "hime":
        ctx.moveTo(-0.44, -0.30);
        ctx.quadraticCurveTo(-0.56, 0.2, -0.50 + sway * 0.2, 0.66);
        ctx.lineTo(-0.14 + sway * 0.4, 0.68);
        ctx.lineTo(-0.10 + sway * 0.4, 0.74);   // two shallow notches
        ctx.lineTo(0.10 + sway * 0.4, 0.68);
        ctx.lineTo(0.14 + sway * 0.4, 0.74);
        ctx.lineTo(0.50 + sway * 0.2, 0.66);
        ctx.quadraticCurveTo(0.56, 0.2, 0.44, -0.30);
        break;
      case "bob":
        ctx.moveTo(-0.44, -0.28);
        ctx.quadraticCurveTo(-0.58, 0.05, -0.46 + sway * 0.2, 0.42);
        tipRow(0.42, 0.46, 4, 0.10);
        ctx.quadraticCurveTo(0.58, 0.05, 0.44, -0.28);
        break;
      case "wavy":
        ctx.moveTo(-0.42, -0.30);
        for (var i = 0; i <= 6; i++) {
          var yy = -0.30 + (1.0 * i) / 6;
          ctx.lineTo(-0.50 - Math.sin(i * 2.2 + 1) * 0.07 + sway * (i / 6) * 0.5, yy);
        }
        tipRow(0.70, 0.50, 6, 0.14);
        for (var j = 6; j >= 0; j--) {
          var yy2 = -0.30 + (1.0 * j) / 6;
          ctx.lineTo(0.50 + Math.sin(j * 2.2 + 1) * 0.07 + sway * (j / 6) * 0.5, yy2);
        }
        break;
      default: // twintails / ponytail / drills draw their mass below
        ctx.moveTo(-0.42, -0.30);
        ctx.quadraticCurveTo(-0.55, 0.0, -0.44, 0.30);
        tipRow(0.30, 0.42, 3, 0.08);
        ctx.quadraticCurveTo(0.55, 0.0, 0.42, -0.30);
    }
    ctx.quadraticCurveTo(0, -0.72, -0.42, -0.30);
    ctx.closePath();
    ctx.fill();
    ink(ctx, inkC, 0.014);

    // tails / drills as big tapered clumps (they ARE clumps, so this is honest)
    fillCss(ctx, C.hairRgb);
    if (g.hair.back === "twintails") {
      for (var s = -1; s <= 1; s += 2) {
        clump(ctx, s * 0.46, -0.28, s * (0.62 + sway * 1.2), 0.78, 0.24, s * 0.18);
        ctx.fill(); ink(ctx, inkC, 0.014);
        clump(ctx, s * 0.50, -0.24, s * (0.50 + sway * 1.1), 0.62, 0.12, s * 0.05);
        ctx.fill(); ink(ctx, inkC, 0.012);
      }
    } else if (g.hair.back === "ponytail") {
      clump(ctx, 0.18, -0.62, 0.48 + sway * 1.4, 0.55, 0.22, 0.30);
      ctx.fill(); ink(ctx, inkC, 0.014);
      clump(ctx, 0.22, -0.60, 0.30 + sway * 1.3, 0.42, 0.11, 0.18);
      ctx.fill(); ink(ctx, inkC, 0.012);
    } else if (g.hair.back === "drills") {
      for (var s2 = -1; s2 <= 1; s2 += 2) {
        for (var k = 0; k < 4; k++) {
          var ry = -0.05 + k * 0.24, rw = 0.13 - k * 0.026;
          clump(ctx, s2 * (0.46 + k * 0.02), ry - 0.14, s2 * (0.46 + k * 0.02 + sway * k * 0.2), ry + 0.16, rw * 2, s2 * 0.06);
          ctx.fill(); ink(ctx, inkC, 0.013);
          // ring shadow between segments
          ctx.save(); ctx.globalAlpha = 0.5;
          fillCss(ctx, C.hairShadow);
          ellipse(ctx, s2 * (0.46 + k * 0.02 + sway * k * 0.15), ry + 0.10, rw * 0.8, 0.03);
          ctx.fill(); ctx.restore(); fillCss(ctx, C.hairRgb);
        }
      }
    }

    // crown highlight band — the angel ring, following the skull curve
    ctx.save();
    ctx.globalAlpha = 0.55;
    strokeCss(ctx, C.hairLight);
    ctx.lineWidth = 0.05; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.ellipse(0, -0.26, 0.34, 0.30, 0, Math.PI * 1.18, Math.PI * 1.82);
    ctx.stroke();
    ctx.restore();

    // sparse surface strands — detail only at edges, never full strands
    ctx.save();
    ctx.globalAlpha = 0.35;
    ink(ctx, C.hairShadow, 0.008);
    ctx.beginPath();
    ctx.moveTo(-0.30, -0.42); ctx.quadraticCurveTo(-0.44, 0.05, -0.38 + sway * 0.4, 0.5);
    ctx.moveTo(0.30, -0.42); ctx.quadraticCurveTo(0.44, 0.05, 0.38 + sway * 0.4, 0.5);
    ctx.stroke();
    ctx.restore();
  }

  /* ══ BODY — bust: neck, shoulders, outfit collar ═════════════════════ */
  function drawBust(ctx, g, st, L) {
    var C = g.chroma;
    // neck — thin, shadowed under the chin
    fillCss(ctx, C.skinRgb);
    ctx.beginPath();
    ctx.moveTo(-0.075, 0.50);
    ctx.lineTo(-0.095, 0.86);
    ctx.lineTo(0.095, 0.86);
    ctx.lineTo(0.075, 0.50);
    ctx.closePath(); ctx.fill();
    ctx.save(); ctx.globalAlpha = 0.35;
    fillCss(ctx, C.skinShadow);
    ellipse(ctx, 0, 0.585, 0.085, 0.045); ctx.fill();
    ctx.restore();

    // shoulders/bust silhouette in the outfit color
    fillCss(ctx, C.outfit1Rgb);
    ctx.beginPath();
    ctx.moveTo(-0.11, 0.72);
    ctx.quadraticCurveTo(-0.34, 0.74, -0.44, 0.98);
    ctx.lineTo(-0.44, 1.10);
    ctx.lineTo(0.44, 1.10);
    ctx.lineTo(0.44, 0.98);
    ctx.quadraticCurveTo(0.34, 0.74, 0.11, 0.72);
    ctx.quadraticCurveTo(0, 0.68, -0.11, 0.72);
    ctx.closePath(); ctx.fill();
    ink(ctx, dark(C.outfit1Shadow, 0.7), 0.014);

    // collar per outfit (bust view = collar game)
    switch (g.outfit) {
      case "sailor":
        fillCss(ctx, C.outfit2Rgb);
        ctx.beginPath();
        ctx.moveTo(-0.26, 0.76); ctx.lineTo(0, 0.98); ctx.lineTo(0.26, 0.76);
        ctx.lineTo(0.18, 0.72); ctx.lineTo(0, 0.86); ctx.lineTo(-0.18, 0.72);
        ctx.closePath(); ctx.fill();
        ink(ctx, dark(C.outfit2Rgb, 0.7), 0.01);
        fillCss(ctx, C.accentRgb);
        ctx.beginPath(); ctx.moveTo(-0.04, 0.86); ctx.lineTo(0.04, 0.86); ctx.lineTo(0.02, 1.02); ctx.lineTo(-0.02, 1.02); ctx.closePath(); ctx.fill();
        break;
      case "hoodie":
        fillCss(ctx, C.outfit1Shadow);
        ellipse(ctx, 0, 0.76, 0.20, 0.09); ctx.fill();   // hood lump
        strokeCss(ctx, C.outfit2Rgb); ctx.lineWidth = 0.016; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-0.045, 0.80); ctx.lineTo(-0.055, 0.95); ctx.moveTo(0.045, 0.80); ctx.lineTo(0.055, 0.95); ctx.stroke();
        break;
      case "dress":
        fillCss(ctx, C.outfit2Rgb);
        ellipse(ctx, -0.075, 0.755, 0.075, 0.045, 0.3); ctx.fill();
        ellipse(ctx, 0.075, 0.755, 0.075, 0.045, -0.3); ctx.fill();
        fillCss(ctx, C.accentRgb);
        ctx.beginPath(); ctx.roundRect(-0.14, 0.96, 0.28, 0.045, 0.02); ctx.fill();
        break;
      case "miko":
        fillCss(ctx, C.outfit2Rgb);
        ctx.beginPath();
        ctx.moveTo(-0.16, 0.72); ctx.lineTo(-0.06, 0.94); ctx.lineTo(0.06, 0.94); ctx.lineTo(0.16, 0.72);
        ctx.lineTo(0.10, 0.70); ctx.lineTo(0, 0.86); ctx.lineTo(-0.10, 0.70);
        ctx.closePath(); ctx.fill();
        strokeCss(ctx, C.accentRgb); ctx.lineWidth = 0.02; ctx.lineCap = "round";
        ctx.beginPath(); ctx.moveTo(-0.10, 0.74); ctx.lineTo(0.03, 0.93); ctx.stroke();
        break;
      case "blazer":
        fillCss(ctx, C.outfit2Rgb);
        ctx.beginPath(); ctx.moveTo(-0.08, 0.72); ctx.lineTo(0.08, 0.72); ctx.lineTo(0.04, 1.0); ctx.lineTo(-0.04, 1.0); ctx.closePath(); ctx.fill();
        fillCss(ctx, C.outfit1Shadow);
        ctx.beginPath(); ctx.moveTo(-0.16, 0.72); ctx.lineTo(-0.05, 0.86); ctx.lineTo(-0.10, 1.0); ctx.lineTo(-0.22, 0.80); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0.16, 0.72); ctx.lineTo(0.05, 0.86); ctx.lineTo(0.10, 1.0); ctx.lineTo(0.22, 0.80); ctx.closePath(); ctx.fill();
        fillCss(ctx, C.accentRgb);
        ctx.beginPath(); ctx.moveTo(0, 0.78); ctx.lineTo(-0.055, 0.74); ctx.lineTo(-0.05, 0.83); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0.78); ctx.lineTo(0.055, 0.74); ctx.lineTo(0.05, 0.83); ctx.closePath(); ctx.fill();
        ellipse(ctx, 0, 0.785, 0.02, 0.02); ctx.fill();
        break;
      case "stage":
        fillCss(ctx, C.outfit2Rgb);
        for (var i = 0; i < 7; i++) {
          var x = -0.24 + i * 0.08;
          ellipse(ctx, x, 0.76, 0.045, 0.035); ctx.fill();   // frill
        }
        fillCss(ctx, C.accentRgb);
        ctx.beginPath(); ctx.moveTo(0, 0.84); ctx.lineTo(-0.08, 0.79); ctx.lineTo(-0.07, 0.89); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(0, 0.84); ctx.lineTo(0.08, 0.79); ctx.lineTo(0.07, 0.89); ctx.closePath(); ctx.fill();
        ellipse(ctx, 0, 0.84, 0.025, 0.025); ctx.fill();
        break;
    }

    // arms — mostly below frame at idle; rise beside the head when dancing
    for (var s = -1; s <= 1; s += 2) {
      var ang = s < 0 ? st.armL : st.armR;
      var sx = s * 0.30, sy = 0.82;
      var hx = sx + s * Math.sin(ang) * 0.55, hy = sy + Math.cos(ang) * 0.55;
      if (ang < 0.6) continue;                       // out of frame; don't draw
      strokeCss(ctx, g.outfit === "miko" ? C.outfit2Rgb : C.outfit1Rgb);
      ctx.lineWidth = 0.10; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
      fillCss(ctx, C.skinRgb);
      ellipse(ctx, hx, hy, 0.05, 0.05); ctx.fill();
      ink(ctx, dark(C.skinShadow, 0.75), 0.008);
    }
  }

  /* ══ EYES — tall, iris-filling, thick top lash, dark-at-top gradient ══ */
  function drawEye(ctx, g, st, L, side) {
    var C = g.chroma, s = side;
    var ex = s * L.eyeX, ey = L.eyeLineY;
    var open = Math.max(0.05, st.lidOpen * (1 - st.lid));
    var w = L.eyeW, h0 = L.eyeH0, h = h0 * open;
    var tilt = g.soma.eyeTilt;                     // + outer-up (tsuri), − droop (tare)

    var irisC = s < 0 ? C.eye1Rgb : C.eye2Rgb;
    var deepC = s < 0 ? C.eye1Deep : C.eye2Deep;

    ctx.save();
    ctx.translate(ex, ey);
    if (s < 0) ctx.scale(-1, 1);                   // local: −x inner, +x outer

    // eye outline — tall soft shape, nearly straight thick top
    function eyePath() {
      ctx.beginPath();
      ctx.moveTo(-w, -h * 0.30);
      ctx.bezierCurveTo(-w * 0.8, -h * 1.05, w * 0.35, -h * 1.12, w * 0.92, -h * (0.88 + tilt));
      ctx.bezierCurveTo(w * 1.02, -h * 0.15, w * 0.72, h * 0.55, w * 0.28, h * 0.80);
      ctx.bezierCurveTo(-w * 0.15, h * 0.98, -w * 0.82, h * 0.45, -w, -h * 0.30);
      ctx.closePath();
    }

    ctx.save();
    eyePath(); ctx.clip();
    ctx.fillStyle = "#fff";
    ctx.fillRect(-w * 1.2, -h * 1.3, w * 2.4, h * 2.6);
    // lash shadow across the top of the white
    ctx.save(); ctx.globalAlpha = 0.16;
    fillCss(ctx, C.hairShadow);
    ctx.fillRect(-w * 1.2, -h * 1.3, w * 2.4, h * 0.9);
    ctx.restore();

    if (open > 0.18) {
      // iris — nearly fills the eye vertically; gaze un-mirrored (s·) so both
      // pupils pursue the cursor in the same screen direction
      var gx = s * st.gaze.x * w * 0.28, gy = st.gaze.y * h * 0.30;
      var ir = h0 * 0.96;
      var iy = gy - h * 0.10;
      var grad = ctx.createLinearGradient(0, iy - ir, 0, iy + ir);
      grad.addColorStop(0, css(deepC));
      grad.addColorStop(0.5, css(irisC));
      grad.addColorStop(1, css(deepC));
      ctx.fillStyle = grad;
      ellipse(ctx, gx, iy, ir * 0.62, ir);
      ctx.fill();
      // upper shadow INSIDE the iris — the lash's cast shadow, the single
      // biggest "anime eye" cue after shape
      ctx.save(); ctx.globalAlpha = 0.45;
      fillCss(ctx, deepC);
      ctx.beginPath();
      ctx.ellipse(gx, iy - ir * 0.55, ir * 0.60, ir * 0.45, 0, Math.PI, TAU);
      ctx.fill(); ctx.restore();
      // pupil — dilation is a sanctioned menace slot
      var pr = ir * (0.26 + st.pupilDilate * 0.20);
      ctx.fillStyle = "#15090e";
      ellipse(ctx, gx, iy, pr * 0.75, pr);
      ctx.fill();
      // highlights — own runtime layer, killable (deadEyes). The cheap menace.
      var ha = 1 - st.deadEyes;
      if (ha > 0.01) {
        ctx.save();
        ctx.globalAlpha = ha * 0.95;
        ctx.fillStyle = "#fff";
        ellipse(ctx, gx - ir * 0.22, iy - ir * 0.30, ir * 0.20, ir * 0.26);
        ctx.fill();
        ctx.globalAlpha = ha * 0.6;
        ellipse(ctx, gx + ir * 0.26, iy + ir * 0.34, ir * 0.09, ir * 0.09);
        ctx.fill();
        ctx.restore();
      }
    }
    ctx.restore(); // un-clip

    // inked outline of the eye shape (soft, thin)
    eyePath();
    ctx.save(); ctx.globalAlpha = 0.35;
    ink(ctx, dark(C.hairShadow, 0.8), 0.010);
    ctx.restore();

    // THE top lash — thick, near-straight, with the outer flick. This stroke
    // is the style marker; it must dominate.
    strokeCss(ctx, dark(C.hairShadow, 0.55));
    ctx.lineCap = "round";
    ctx.lineWidth = 0.052 * g.soma.eyeSize;
    ctx.beginPath();
    ctx.moveTo(-w * 1.02, -h * 0.28);
    ctx.bezierCurveTo(-w * 0.8, -h * 1.08, w * 0.35, -h * 1.16, w * 0.95, -h * (0.90 + tilt));
    ctx.stroke();
    // the flick — a tapered point, not a stroke-end
    ctx.beginPath();
    ctx.moveTo(w * 0.90, -h * (0.88 + tilt) - 0.004);
    ctx.lineTo(w * 1.22, -h * (1.02 + tilt) - 0.03);
    ctx.lineTo(w * 0.98, -h * (0.80 + tilt) + 0.014);
    ctx.closePath();
    fillCss(ctx, dark(C.hairShadow, 0.55));
    ctx.fill();
    // lower lid hint — rises with squint (joy)
    ctx.save();
    ctx.globalAlpha = 0.35 + st.squint * 0.5;
    strokeCss(ctx, dark(C.hairShadow, 0.75));
    ctx.lineWidth = 0.011;
    ctx.beginPath();
    ctx.moveTo(w * 0.75, h * (0.55 - st.squint * 0.35));
    ctx.quadraticCurveTo(w * 0.2, h * (0.95 - st.squint * 0.6), -w * 0.5, h * (0.72 - st.squint * 0.4));
    ctx.stroke();
    ctx.restore();

    ctx.restore(); // un-mirror
  }

  function drawBrow(ctx, g, st, L, side) {
    var C = g.chroma, s = side;
    var bw = 0.085 * g.soma.eyeSize;
    var innerDy = -st.browTilt * 0.035;            // + tilt = inner up (sorrow)
    ctx.save();
    ctx.translate(s * L.eyeX, L.browY - st.browRaise * 0.035);
    if (s < 0) ctx.scale(-1, 1);
    strokeCss(ctx, dark(C.hairShadow, 0.7));
    ctx.lineWidth = 0.017; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-bw, 0.015 + innerDy);
    ctx.quadraticCurveTo(0, -0.022 - st.browRaise * 0.02, bw, -0.005);
    ctx.stroke();
    ctx.restore();
  }

  function drawNose(ctx, g, L) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    strokeCss(ctx, g.chroma.skinShadow);
    ctx.lineWidth = 0.011; ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(0.008, L.noseY - 0.012);
    ctx.quadraticCurveTo(0.018, L.noseY + 0.004, 0.006, L.noseY + 0.012);
    ctx.stroke();
    ctx.restore();
  }

  function drawMouth(ctx, g, st, L) {
    var my = L.mouthY, mw = L.mouthW;
    var curve = st.mouthCurve, open = st.mouthOpen;
    var lipC = { r: 148, g: 62, b: 74 };
    ctx.lineCap = "round";

    if (st.mouthForm === "w") {
      strokeCss(ctx, lipC);
      ctx.lineWidth = 0.016;
      ctx.beginPath();
      ctx.moveTo(-mw, my - 0.006);
      ctx.quadraticCurveTo(-mw / 2, my + 0.024, 0, my - 0.002);
      ctx.quadraticCurveTo(mw / 2, my + 0.024, mw, my - 0.006);
      ctx.stroke();
      return;
    }
    if (st.mouthForm === "o" || open > 0.25) {
      var oh = Math.max(st.mouthForm === "o" ? 0.045 : 0.018, open * 0.070);
      ctx.fillStyle = "#7d3040";
      ellipse(ctx, 0, my + oh * 0.1, mw * (0.62 + open * 0.35), oh);
      ctx.fill();
      ctx.fillStyle = "#d98a94";
      ellipse(ctx, 0, my + oh * 0.5, mw * 0.45, oh * 0.42);
      ctx.fill();
      if (g.extras.fang) {
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(mw * 0.28, my - oh * 0.55);
        ctx.lineTo(mw * 0.50, my - oh * 0.55);
        ctx.lineTo(mw * 0.40, my - oh * 0.10);
        ctx.closePath(); ctx.fill();
      }
      strokeCss(ctx, lipC); ctx.lineWidth = 0.012;
      ctx.beginPath();
      ctx.moveTo(-mw * 0.75, my - oh * 0.35);
      ctx.quadraticCurveTo(0, my - oh * (0.95 + curve * 0.3), mw * 0.75, my - oh * 0.35);
      ctx.stroke();
      return;
    }
    // closed — small curve, slight gap at center bottom (convention)
    strokeCss(ctx, lipC);
    ctx.lineWidth = 0.015;
    ctx.beginPath();
    ctx.moveTo(-mw, my - curve * 0.010);
    ctx.quadraticCurveTo(0, my + curve * 0.038, mw, my - curve * 0.010);
    ctx.stroke();
  }

  function drawFaceDetails(ctx, g, st, L) {
    var C = g.chroma;
    // blush — soft ovals + the hatch-mark convention
    var ba = Math.min(1, g.soma.blush * 0.5 + st.blushBoost);
    if (ba > 0.03) {
      ctx.save();
      ctx.globalAlpha = ba * 0.35;
      fillCss(ctx, C.blushRgb);
      ellipse(ctx, -L.blushX, L.blushY, 0.062, 0.030); ctx.fill();
      ellipse(ctx, L.blushX, L.blushY, 0.062, 0.030); ctx.fill();
      ctx.globalAlpha = ba * 0.5;
      strokeCss(ctx, C.blushRgb); ctx.lineWidth = 0.008; ctx.lineCap = "round";
      for (var s = -1; s <= 1; s += 2) {
        for (var i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(s * (L.blushX - 0.03 + i * 0.028), L.blushY - 0.018);
          ctx.lineTo(s * (L.blushX - 0.012 + i * 0.028), L.blushY + 0.018);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
    if (g.extras.freckles) {
      ctx.save(); ctx.globalAlpha = 0.5; fillCss(ctx, C.skinShadow);
      var fp = [[-0.09, 0.20], [-0.05, 0.215], [-0.13, 0.215], [0.09, 0.20], [0.05, 0.215], [0.13, 0.215]];
      for (var i2 = 0; i2 < fp.length; i2++) { ellipse(ctx, fp[i2][0], fp[i2][1], 0.007, 0.007); ctx.fill(); }
      ctx.restore();
    }
    if (g.extras.mole) {
      fillCss(ctx, { r: 60, g: 40, b: 40 });
      ellipse(ctx, 0.09, 0.49, 0.008, 0.008); ctx.fill();
    }
  }

  /* ══ BANGS — clumps over a cap, with skin showing in the gaps ════════ */
  function drawBangs(ctx, g, st, L) {
    var C = g.chroma, hw = L.hw;
    var inkC = dark(C.hairShadow, 0.75);
    var capBot = -0.30 * L.hh;                    // cap hem: mid-forehead
    var sway = st.hairSway.x * 0.3;

    // the cap — covers the skull, hem sits HIGH so fringe gaps show skin
    fillCss(ctx, C.hairRgb);
    ctx.beginPath();
    ctx.moveTo(-hw * 1.06, capBot + 0.06);
    ctx.quadraticCurveTo(-hw * 1.12, -0.42 * L.hh, -hw * 0.58, -0.585 * L.hh);
    ctx.quadraticCurveTo(0, -0.685 * L.hh, hw * 0.58, -0.585 * L.hh);
    ctx.quadraticCurveTo(hw * 1.12, -0.42 * L.hh, hw * 1.06, capBot + 0.06);
    ctx.lineTo(hw * 0.92, capBot);
    ctx.quadraticCurveTo(0, capBot - 0.05, -hw * 0.92, capBot);
    ctx.closePath(); ctx.fill();
    ink(ctx, inkC, 0.013);

    // fringe clumps — roots on the cap hem, pointed tips hanging over the
    // brow, varied widths/lengths/curves per style, GAPS between them
    fillCss(ctx, C.hairRgb);
    var b = g.hair.bangs, seedJ = g.seed % 7;
    function fringe(n, tipFn) {
      for (var i = 0; i < n; i++) {
        var t = n === 1 ? 0.5 : i / (n - 1);           // 0..1 across forehead
        var rx = -hw * 0.90 + t * hw * 1.80;
        var ry = capBot + 0.015;
        var tp = tipFn(t, i);
        clump(ctx, rx, ry, tp.x + sway * (0.3 + t * 0.4), tp.y, tp.w, tp.c);
        ctx.fill(); ink(ctx, inkC, 0.011);
      }
    }
    var tipBase = -0.165 * L.hh;                     // tips hover right at the brow line
    if (b === "straight") {
      fringe(5, function (t, i) {
        return { x: -hw * 0.88 + t * hw * 1.76, y: tipBase + ((i * 13 + seedJ) % 3) * 0.018, w: hw * 0.42, c: 0.02 };
      });
    } else if (b === "m") {
      fringe(4, function (t, i) {
        var mid = Math.abs(t - 0.5) < 0.2;              // center clump dips lowest
        return { x: -hw * 0.88 + t * hw * 1.76 + (t - 0.5) * 0.10, y: tipBase + (mid ? 0.055 : 0.0) + (i === 0 || i === 3 ? 0.03 : 0), w: hw * 0.46, c: (t - 0.5) * 0.12 };
      });
    } else if (b === "side") {
      fringe(4, function (t, i) {
        return { x: -hw * 0.88 + t * hw * 1.76 + 0.10, y: tipBase + t * 0.06, w: hw * 0.48, c: 0.16 };
      });
    } else if (b === "hime") {
      fringe(3, function (t, i) {
        return { x: -hw * 0.88 + t * hw * 1.76, y: tipBase + 0.005, w: hw * 0.62, c: 0.0 };
      });
    } else if (b === "choppy") {
      fringe(7, function (t, i) {
        return { x: -hw * 0.88 + t * hw * 1.76, y: tipBase + ((i * 29 + seedJ) % 5) * 0.022 - 0.02, w: hw * (0.26 + ((i * 17) % 3) * 0.05), c: ((i % 3) - 1) * 0.06 };
      });
    } else { // center — parted curtains
      fringe(4, function (t, i) {
        var side = t < 0.5 ? -1 : 1;
        return { x: -hw * 0.88 + t * hw * 1.76 + side * 0.06, y: tipBase + 0.02 + (Math.abs(t - 0.5) > 0.3 ? 0.05 : -0.03), w: hw * 0.5, c: side * 0.14 };
      });
    }

    // sidelocks — ribbons wrapping the cheek curve, tips pointed, IN FRONT
    var lockLen = 0.28 + g.hair.sidelockLen * 0.42;
    for (var s = -1; s <= 1; s += 2) {
      clump(ctx, s * hw * 0.98, -0.24, s * (hw * 0.72 + st.hairSway.x * 0.5), -0.24 + lockLen, 0.11, -s * 0.10);
      ctx.fill(); ink(ctx, inkC, 0.011);
      if (g.hair.sidelockLen > 0.55) { // a second thinner strand
        clump(ctx, s * hw * 1.02, -0.20, s * (hw * 0.86 + st.hairSway.x * 0.6), -0.10 + lockLen * 0.85, 0.055, -s * 0.04);
        ctx.fill(); ink(ctx, inkC, 0.009);
      }
    }
  }

  function drawAhoge(ctx, g, st, L) {
    var a = g.hair.ahoge;
    if (a === "none") return;
    var C = g.chroma, sway = st.hairSway.x * 1.6;
    var top = -0.64 * L.hh;
    var inkC = dark(C.hairShadow, 0.75);
    fillCss(ctx, C.hairRgb);
    function one(x0, dx, lift) {
      clump(ctx, x0, top + 0.05, x0 + dx + sway, top - lift, 0.030, dx * 0.8);
      ctx.fill(); ink(ctx, inkC, 0.008);
    }
    if (a === "single") one(0.01, 0.10, 0.22);
    else if (a === "double") { one(-0.02, -0.10, 0.18); one(0.02, 0.10, 0.20); }
    else if (a === "bolt") {
      strokeCss(ctx, C.hairRgb); ctx.lineWidth = 0.024; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      ctx.moveTo(0, top + 0.05);
      ctx.lineTo(-0.06 + sway * 0.4, top - 0.10);
      ctx.lineTo(0.04 + sway * 0.7, top - 0.17);
      ctx.lineTo(-0.03 + sway, top - 0.27);
      ctx.stroke();
    }
  }

  function drawAccessory(ctx, g, st, L) {
    var C = g.chroma, acc = g.hair.accessory;
    if (acc === "none") return;
    fillCss(ctx, C.accentRgb);
    var inkC = dark(C.accentRgb, 0.65);
    if (acc === "ribbon") {
      var spots = g.hair.back === "twintails" ? [[-0.47, -0.30], [0.47, -0.30]] : [[0.30, -0.50]];
      for (var i = 0; i < spots.length; i++) {
        var x = spots[i][0], y = spots[i][1];
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 0.085, y - 0.055); ctx.lineTo(x - 0.065, y + 0.05); ctx.closePath(); ctx.fill(); ink(ctx, inkC, 0.008);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.085, y - 0.055); ctx.lineTo(x + 0.065, y + 0.05); ctx.closePath(); ctx.fill(); ink(ctx, inkC, 0.008);
        ellipse(ctx, x, y, 0.022, 0.022); ctx.fill(); ink(ctx, inkC, 0.008);
      }
    } else if (acc === "clip") {
      ctx.save();
      ctx.translate(-0.26, -0.38); ctx.rotate(-0.55);
      ctx.beginPath(); ctx.roundRect(-0.055, -0.013, 0.11, 0.026, 0.011); ctx.fill();
      ink(ctx, inkC, 0.007);
      ctx.restore();
    } else if (acc === "band") {
      strokeCss(ctx, C.accentRgb); ctx.lineWidth = 0.032; ctx.lineCap = "round";
      ctx.beginPath();
      ctx.ellipse(0, -0.28, L.hw * 1.02, 0.36, 0, Math.PI * 1.12, Math.PI * 1.88);
      ctx.stroke();
    }
  }

  /* ══ assembly ═══════════════════════════════════════════════════════ */
  function drawGirl(ctx, g, st, L) {
    var C = g.chroma;
    drawBackHair(ctx, g, st, L);
    drawBust(ctx, g, st, L);

    // face
    facePath(ctx, L);
    fillCss(ctx, C.skinRgb);
    ctx.fill();
    // fringe shadow ON the face — cel shadow level, hard edge
    ctx.save();
    facePath(ctx, L); ctx.clip();
    ctx.globalAlpha = 0.16;
    fillCss(ctx, C.skinShadow);
    ctx.beginPath();
    ctx.moveTo(-L.hw, -0.30 * L.hh);
    ctx.quadraticCurveTo(0, -0.20 * L.hh, L.hw, -0.30 * L.hh);
    ctx.lineTo(L.hw, -0.62 * L.hh);
    ctx.lineTo(-L.hw, -0.62 * L.hh);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // inked face outline
    facePath(ctx, L);
    ctx.save(); ctx.globalAlpha = 0.7;
    ink(ctx, dark(C.skinShadow, 0.72), 0.011);
    ctx.restore();

    drawFaceDetails(ctx, g, st, L);
    drawBrow(ctx, g, st, L, -1);
    drawBrow(ctx, g, st, L, 1);
    drawEye(ctx, g, st, L, -1);
    drawEye(ctx, g, st, L, 1);
    drawNose(ctx, g, L);
    drawMouth(ctx, g, st, L);
    drawBangs(ctx, g, st, L);
    drawAhoge(ctx, g, st, L);
    drawAccessory(ctx, g, st, L);
  }

  /* render(ctx, W, H, genome, st) — bust framing: the face gets the pixels */
  function render(ctx, W, H, g, st) {
    ctx.clearRect(0, 0, W, H);
    var L = layout(g);
    var scale = Math.min(W / 1.35, H / 2.0);

    ctx.save();
    ctx.translate(W / 2 + st.leanX * scale * 0.6, H * 0.42 + st.bob * scale);
    ctx.rotate(st.sway * 0.7);
    ctx.scale(scale, scale);

    if (st.glitch > 0.02) {
      ctx.save();
      ctx.globalAlpha = st.glitch * 0.35;
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(st.glitch * 0.03 * (st.glitchDir || 1), -st.glitch * 0.01);
      drawGirl(ctx, g, st, L);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = st.glitch * 0.2;
      ctx.globalCompositeOperation = "lighter";
      ctx.translate(-st.glitch * 0.025 * (st.glitchDir || 1), st.glitch * 0.012);
      drawGirl(ctx, g, st, L);
      ctx.restore();
    }
    drawGirl(ctx, g, st, L);
    ctx.restore();
  }

  I.draw = { render: render, metrics: metrics };
})();
