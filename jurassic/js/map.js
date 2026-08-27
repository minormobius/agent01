/* jurassic — the map.
 *
 * A hundred and eighty metres of forest floor seen from above, with you in it.
 * Two things are drawn on top of the scenery and both come from the kernel, not
 * from here:
 *
 *   • a dot per singing male, lit while it is actually singing;
 *   • the circle inside which the selected species is audible — to whichever
 *     ear you have chosen.
 *
 * That circle is the argument. Select the ultrasonic singer with a human ear
 * chosen and it is a coin on a dinner plate; switch the ear to an early mammal
 * and it swells across the plot. Nothing about the animal changed. What changed
 * is who was listening, and that is the question the fossils leave open.
 *
 * Colour on this map encodes one thing only: carrier frequency, on a single-hue
 * sequential ramp read out of CSS so it re-steps for light and dark. Nothing
 * else here is coloured by data — the plants are scenery in a hue the ramp
 * never uses, so they cannot be misread as low-frequency insects.
 */

import { PLOT_M } from "./fauna.js";

/** Ends of the frequency ramp, Hz. Bracketing the roster with room to spare. */
export const F_LO = 3500;
export const F_HI = 22000;

const HIT_PX = 14;

export class ForestMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.plot = null;
    this.listener = { x: 0, y: 0 };
    this.rings = []; // [{x, y, radius}] in metres
    this.activity = new Float32Array(0);
    this.selectedSpecies = null;
    this.hover = null;
    this.dragging = false;

    this.onmove = () => {};
    this.onpick = () => {};
    this.onhover = () => {};
    this.onscheme = () => {};

    this.readTheme();
    this.resize();
    this.bind();

    // The canvas caches the palette, so an OS theme flip mid-session would
    // otherwise leave a dark forest on a light page.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onScheme = () => {
      this.readTheme();
      this.onscheme();
      this.draw();
    };
    if (mq.addEventListener) mq.addEventListener("change", onScheme);
    else if (mq.addListener) mq.addListener(onScheme);
  }

  /** Pull the palette out of CSS so light and dark are one source of truth. */
  readTheme() {
    const cs = getComputedStyle(this.canvas);
    const v = (n, fallback) => (cs.getPropertyValue(n) || fallback).trim();
    this.theme = {
      ground: v("--map-ground", "#141c17"),
      grid: v("--map-grid", "#22302a"),
      canopy: v("--map-canopy", "#1f3a2b"),
      ground2: v("--map-ground-cover", "#1a2c22"),
      ink: v("--text-primary", "#f2f4f1"),
      muted: v("--text-muted", "#8e9c93"),
      surface: v("--surface-1", "#101613"),
      freq: [
        v("--freq-0", "#184f95"),
        v("--freq-1", "#2a78d6"),
        v("--freq-2", "#6da7ec"),
        v("--freq-3", "#cde2fb"),
      ],
    };
  }

  /** Colour for a carrier frequency: sequential, one hue, log-spaced. */
  freqColor(hz, alpha = 1) {
    const t = clamp01(
      (Math.log(hz) - Math.log(F_LO)) / (Math.log(F_HI) - Math.log(F_LO))
    );
    const stops = this.theme.freq;
    const s = t * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(s));
    const [r, g, b] = mixHex(stops[i], stops[i + 1], s - i);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, Math.round(rect.width));
    this.h = Math.max(1, Math.round(rect.height));
    this.canvas.width = this.w * dpr;
    this.canvas.height = this.h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Fit the whole plot with a margin, so a radius that overflows it is
    // visibly overflowing rather than silently cropped at the frame.
    this.scale = (Math.min(this.w, this.h) * 0.92) / PLOT_M;
    this.draw();
  }

  toScreen(x, y) {
    return [this.w / 2 + x * this.scale, this.h / 2 - y * this.scale];
  }

  toWorld(px, py) {
    return [(px - this.w / 2) / this.scale, (this.h / 2 - py) / this.scale];
  }

  bind() {
    const pos = (e) => {
      const r = this.canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    this.canvas.addEventListener("pointerdown", (e) => {
      const [px, py] = pos(e);
      const hit = this.pick(px, py);
      if (hit) {
        // A click on an animal is a question about that animal; a click on the
        // forest is an instruction to walk there.
        this.onpick(hit);
        return;
      }
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      this.moveListener(px, py);
    });

    this.canvas.addEventListener("pointermove", (e) => {
      const [px, py] = pos(e);
      if (this.dragging) {
        this.moveListener(px, py);
        return;
      }
      const hit = this.pick(px, py);
      const changed = (hit && hit.index) !== (this.hover && this.hover.index);
      this.hover = hit;
      this.canvas.style.cursor = hit ? "pointer" : "crosshair";
      if (changed) {
        this.onhover(hit, px, py);
        this.draw();
      } else if (hit) {
        this.onhover(hit, px, py);
      }
    });

    const release = (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      try {
        this.canvas.releasePointerCapture(e.pointerId);
      } catch (_) {
        /* the pointer may already be gone; harmless */
      }
    };
    this.canvas.addEventListener("pointerup", release);
    this.canvas.addEventListener("pointercancel", release);
    this.canvas.addEventListener("pointerleave", () => {
      if (this.hover) {
        this.hover = null;
        this.onhover(null);
        this.draw();
      }
    });
  }

  moveListener(px, py) {
    const [x, y] = this.toWorld(px, py);
    const half = PLOT_M / 2;
    this.onmove(clamp(x, -half, half), clamp(y, -half, half));
  }

  /** Nearest singer within the hit radius of a screen point. */
  pick(px, py) {
    if (!this.plot) return null;
    let best = null;
    let bestD = HIT_PX * HIT_PX;
    this.plot.voices.forEach((v, index) => {
      const [sx, sy] = this.toScreen(v.x, v.y);
      const d = (sx - px) ** 2 + (sy - py) ** 2;
      if (d < bestD) {
        bestD = d;
        best = { index, voice: v };
      }
    });
    return best;
  }

  // ------------------------------------------------------------- rendering --

  draw() {
    const c = this.ctx;
    const t = this.theme;
    c.clearRect(0, 0, this.w, this.h);
    c.fillStyle = t.ground;
    c.fillRect(0, 0, this.w, this.h);
    if (!this.plot) return;

    this.drawGrid();
    this.drawPlants();
    this.drawRings();
    this.drawSingers();
    this.drawListener();
    this.drawScale();
  }

  drawGrid() {
    const c = this.ctx;
    c.save();
    c.strokeStyle = this.theme.grid;
    c.lineWidth = 1;
    c.globalAlpha = 0.6;
    for (let m = -PLOT_M / 2; m <= PLOT_M / 2 + 0.01; m += 20) {
      const [x0, y0] = this.toScreen(m, -PLOT_M / 2);
      const [x1, y1] = this.toScreen(m, PLOT_M / 2);
      c.beginPath();
      c.moveTo(x0, y0);
      c.lineTo(x1, y1);
      c.stroke();
      const [ax, ay] = this.toScreen(-PLOT_M / 2, m);
      const [bx, by] = this.toScreen(PLOT_M / 2, m);
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.stroke();
    }
    c.restore();
  }

  drawPlants() {
    const c = this.ctx;
    const t = this.theme;
    c.save();
    for (const p of this.plot.plants) {
      const [x, y] = this.toScreen(p.x, p.y);
      const r = Math.max(1.2, p.r * this.scale);
      c.fillStyle = p.layer === "tree" ? t.canopy : t.ground2;
      c.globalAlpha = p.layer === "tree" ? 0.42 : 0.28;
      c.beginPath();
      if (p.layer === "tree") {
        // Crowns as soft blobs rather than circles, so the canopy reads as
        // vegetation and not as another set of data marks.
        for (let k = 0; k < 5; k++) {
          const a = p.tilt + (k / 5) * Math.PI * 2;
          c.moveTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6);
          c.arc(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.6, 0, Math.PI * 2);
        }
      } else {
        c.arc(x, y, r, 0, Math.PI * 2);
      }
      c.fill();
    }
    c.restore();
  }

  /** The audible circles for the selected species. */
  drawRings() {
    if (!this.rings.length) return;
    const c = this.ctx;
    c.save();
    for (const ring of this.rings) {
      const [x, y] = this.toScreen(ring.x, ring.y);
      const r = ring.radius * this.scale;
      const col = this.freqColor(ring.carrierHz, 1);
      c.fillStyle = this.freqColor(ring.carrierHz, 0.07);
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = col;
      c.globalAlpha = 0.75;
      c.lineWidth = 2;
      c.setLineDash([5, 5]);
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
    }
    c.restore();
  }

  drawSingers() {
    const c = this.ctx;
    c.save();
    this.plot.voices.forEach((v, i) => {
      const [x, y] = this.toScreen(v.x, v.y);
      const selected = this.selectedSpecies === v.speciesId;
      const hovered = this.hover && this.hover.index === i;
      const act = this.activity[i] || 0;

      // A halo while it is actually radiating, sized by how loud it is where
      // you are standing.
      if (act > 0.01) {
        c.fillStyle = this.freqColor(v.carrierHz, 0.28 * Math.min(1, act * 2.5));
        c.beginPath();
        c.arc(x, y, 6 + act * 22, 0, Math.PI * 2);
        c.fill();
      }

      const base = 4.2 + (v.splDb - 84) * 0.3;
      const r = base * (selected || hovered ? 1.45 : 1);
      // 2px surface ring, so overlapping singers stay countable.
      c.beginPath();
      c.arc(x, y, r + 2, 0, Math.PI * 2);
      c.fillStyle = this.theme.surface;
      c.fill();
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fillStyle = this.freqColor(v.carrierHz, selected || hovered ? 1 : 0.72);
      c.fill();
      if (selected || hovered) {
        c.strokeStyle = this.theme.ink;
        c.lineWidth = 1.5;
        c.stroke();
      }
    });
    c.restore();
  }

  drawListener() {
    const c = this.ctx;
    const [x, y] = this.toScreen(this.listener.x, this.listener.y);
    c.save();
    c.strokeStyle = this.theme.ink;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(x, y, 7, 0, Math.PI * 2);
    c.stroke();
    c.beginPath();
    c.moveTo(x - 12, y);
    c.lineTo(x + 12, y);
    c.moveTo(x, y - 12);
    c.lineTo(x, y + 12);
    c.globalAlpha = 0.55;
    c.stroke();
    c.restore();
  }

  drawScale() {
    const c = this.ctx;
    const t = this.theme;
    const metres = 50;
    const px = metres * this.scale;
    const x = 14;
    const y = this.h - 16;
    c.save();
    c.strokeStyle = t.muted;
    c.fillStyle = t.muted;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + px, y);
    c.moveTo(x, y - 4);
    c.lineTo(x, y + 4);
    c.moveTo(x + px, y - 4);
    c.lineTo(x + px, y + 4);
    c.stroke();
    c.font = "11px ui-monospace, SFMono-Regular, Menlo, monospace";
    c.fillText(`${metres} m`, x + px + 8, y + 4);
    // North, because the map has a bearing and the ears use it.
    c.textAlign = "center";
    c.fillText("N", this.w - 20, 22);
    c.beginPath();
    c.moveTo(this.w - 20, 30);
    c.lineTo(this.w - 20, 46);
    c.moveTo(this.w - 24, 36);
    c.lineTo(this.w - 20, 30);
    c.lineTo(this.w - 16, 36);
    c.stroke();
    c.restore();
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function clamp01(v) {
  return clamp(v, 0, 1);
}
function hexToRgb(h) {
  const s = h.replace("#", "").trim();
  const n =
    s.length === 3
      ? s.split("").map((ch) => parseInt(ch + ch, 16))
      : [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16));
  return n.map((v) => (Number.isFinite(v) ? v : 0));
}
function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return [0, 1, 2].map((i) => Math.round(A[i] + (B[i] - A[i]) * clamp01(t)));
}
