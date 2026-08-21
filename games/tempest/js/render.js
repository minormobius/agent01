// render.js — the vector view.
//
// The web is drawn from exactly the geometry the solver reasoned about: the
// polygon in levels.json is the same object whose edge lengths became the lane
// travel costs. Nothing here is decorative-only, which is the point — on a star
// web the long lanes *look* long because they are long, and crossing them
// really does cost what it looks like it costs.

(function () {
  'use strict';

  const DEPTH_MAX = 1000;
  // Projective depth: s = 1 / (1 + K·t). K sets how deep the tube feels — and
  // how small something at the far end is drawn. At 7 the far ring came out at
  // an eighth of the rim and a flipper that had just entered was two pixels of
  // nothing; 4.6 puts the far end at about 18%, which is roughly where the
  // arcade cabinet had it and is the point at which you can see what is coming
  // in time to decide which way to go.
  const K = 4.6;

  const COLORS = {
    rim: '#39d0ff',
    lane: '#2a8bb0',
    laneHot: '#7fe9ff',
    far: '#12455a',
    player: '#ffd23f',
    flipper: '#ff4d6d',
    tanker: '#c77dff',
    spiker: '#8bd450',
    shot: '#ffffff',
    doomed: '#ff4d6d',
  };

  function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
  }
  function len(v) {
    return Math.hypot(v[0], v[1]) || 1;
  }
  function norm(v) {
    const l = len(v);
    return [v[0] / l, v[1] / l];
  }

  /**
   * Where the tube converges. For a ring it is the middle; for a strip the
   * middle is *on* the strip, so the vanishing point is pushed off to one
   * side — whichever side is further from the rim, so the tube never folds
   * back through the lanes the player is standing on.
   */
  function vanishingPoint(web) {
    const vs = web.verts;
    let cx = 0;
    let cy = 0;
    for (const v of vs) {
      cx += v[0];
      cy += v[1];
    }
    cx /= vs.length;
    cy /= vs.length;
    if (web.closed) return [cx, cy];
    const a = vs[0];
    const b = vs[vs.length - 1];
    const t = norm(sub(b, a));
    const n = [-t[1], t[0]];
    const off = 620;
    const best = [
      [cx + n[0] * off, cy + n[1] * off],
      [cx - n[0] * off, cy - n[1] * off],
    ].map((p) => {
      let worst = Infinity;
      for (const v of vs) worst = Math.min(worst, len(sub(v, p)));
      return { p, worst };
    });
    return best[0].worst >= best[1].worst ? best[0].p : best[1].p;
  }

  class View {
    constructor(canvas, web) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.setWeb(web);
    }

    setWeb(web) {
      this.web = web;
      this.vp = vanishingPoint(web);
      // Lane i spans verts[i] .. verts[i+1] (wrapping on a ring).
      this.edge = [];
      for (let i = 0; i < web.lanes; i++) {
        const a = web.verts[i];
        const b = web.verts[(i + 1) % web.verts.length];
        this.edge.push([a, b]);
      }
    }

    resize() {
      const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
      const rect = this.canvas.getBoundingClientRect();
      this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
      this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
      // Fit the web plus its vanishing point into the frame.
      const pts = this.web.verts.concat([this.vp]);
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p[0]);
        maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]);
        maxY = Math.max(maxY, p[1]);
      }
      const pad = 40;
      const w = maxX - minX + pad * 2;
      const h = maxY - minY + pad * 2;
      this.scale = Math.min(this.canvas.width / w, this.canvas.height / h);
      this.ox = this.canvas.width / 2 - ((minX + maxX) / 2) * this.scale;
      this.oy = this.canvas.height / 2 - ((minY + maxY) / 2) * this.scale;
    }

    /** Web coordinates at depth `d` -> canvas pixels. */
    project(p, d) {
      const t = Math.max(0, Math.min(1, d / DEPTH_MAX));
      const s = 1 / (1 + K * t);
      const x = this.vp[0] + (p[0] - this.vp[0]) * s;
      const y = this.vp[1] + (p[1] - this.vp[1]) * s;
      return [x * this.scale + this.ox, y * this.scale + this.oy];
    }

    laneEnds(lane, depth) {
      const [a, b] = this.edge[lane];
      return [this.project(a, depth), this.project(b, depth)];
    }

    /** Two-pass stroke: a wide soft halo under a thin bright line. */
    glow(path, color, width, alpha) {
      const c = this.ctx;
      c.lineCap = 'round';
      c.lineJoin = 'round';
      c.strokeStyle = color;
      c.globalAlpha = (alpha === undefined ? 1 : alpha) * 0.22;
      c.lineWidth = width * 3.4;
      path();
      c.globalAlpha = alpha === undefined ? 1 : alpha;
      c.lineWidth = width;
      path();
      c.globalAlpha = 1;
    }

    line(pts, close) {
      const c = this.ctx;
      return () => {
        c.beginPath();
        c.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
        if (close) c.closePath();
        c.stroke();
      };
    }

    clear() {
      const c = this.ctx;
      c.fillStyle = '#04070d';
      c.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    drawWeb(hotLane) {
      const px = Math.max(1, this.scale * 2.2);
      // Lane rails, back to front.
      for (let i = 0; i < this.web.lanes; i++) {
        const [a, b] = this.edge[i];
        const hot = i === hotLane;
        this.glow(
          this.line([this.project(a, 0), this.project(a, DEPTH_MAX)]),
          hot ? COLORS.laneHot : COLORS.lane,
          px * (hot ? 1.2 : 0.8),
          hot ? 1 : 0.72
        );
        if (!this.web.closed && i === this.web.lanes - 1) {
          this.glow(
            this.line([this.project(b, 0), this.project(b, DEPTH_MAX)]),
            COLORS.lane,
            px * 0.8,
            0.72
          );
        }
      }
      // Far ring, then the rim.
      const far = this.web.verts.map((v) => this.project(v, DEPTH_MAX));
      this.glow(this.line(far, this.web.closed), COLORS.far, px * 0.8, 0.75);
      const rim = this.web.verts.map((v) => this.project(v, 0));
      this.glow(this.line(rim, this.web.closed), COLORS.rim, px * 1.25, 1);
    }

    drawThreat(t) {
      if (!t.alive || !t.active) return;
      const px = Math.max(1, this.scale * 2.2);
      const d = t.depth;
      const near = Math.max(0, d - 45);
      const far = Math.min(DEPTH_MAX, d + 45);
      const [a0, b0] = this.laneEnds(t.lane, near);
      const [a1, b1] = this.laneEnds(t.lane, far);
      if (t.kind === 1) {
        // Tanker: a solid diamond. Reads as heavy, which it is.
        const mid0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
        const mid1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
        this.glow(this.line([mid0, a1, mid1, b1], true), COLORS.tanker, px, 1);
      } else if (t.kind === 2) {
        // Spiker: a dart down the middle of its lane. It never turns, so it
        // is drawn as a thing pointed straight at you.
        const mid0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
        this.glow(this.line([a1, mid0, b1]), COLORS.spiker, px, 1);
      } else {
        // Flipper: the bowtie, walking sideways down the web.
        this.glow(this.line([a0, b1]), COLORS.flipper, px, 1);
        this.glow(this.line([b0, a1]), COLORS.flipper, px, 1);
        this.glow(this.line([a0, b0]), COLORS.flipper, px * 0.7, 0.8);
      }
    }

    drawShot(s) {
      const px = Math.max(1, this.scale * 2.2);
      const [a0, b0] = this.laneEnds(s.lane, Math.max(0, s.depth - 30));
      const [a1, b1] = this.laneEnds(s.lane, Math.min(DEPTH_MAX, s.depth + 30));
      const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
      const m1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
      this.glow(this.line([m0, m1]), COLORS.shot, px * 1.3, 1);
    }

    /** The claw, sitting on the rim between two seats while it walks. */
    drawPlayer(state, doomed) {
      const seats = this.web.seats;
      const f = seats[state.fromLane];
      const t = seats[state.lane];
      const k = state.settled ? 1 : state.transit / 1000;
      const p = [f[0] + (t[0] - f[0]) * k, f[1] + (t[1] - f[1]) * k];
      const [ea, eb] = this.edge[state.settled ? state.lane : state.fromLane];
      const tan = norm(sub(eb, ea));
      const half = (len(sub(eb, ea)) / 2) * 0.92;
      const inward = norm(sub(this.vp, p));
      const depth = 230;
      const L = [p[0] - tan[0] * half, p[1] - tan[1] * half];
      const R = [p[0] + tan[0] * half, p[1] + tan[1] * half];
      const nose = [p[0] + inward[0] * depth, p[1] + inward[1] * depth];
      const Lin = [L[0] + inward[0] * depth * 0.55, L[1] + inward[1] * depth * 0.55];
      const Rin = [R[0] + inward[0] * depth * 0.55, R[1] + inward[1] * depth * 0.55];
      const px = Math.max(1, this.scale * 2.2);
      const col = doomed ? COLORS.doomed : COLORS.player;
      const pj = (q) => this.project(q, 0);
      this.glow(this.line([pj(L), pj(Lin), pj(nose), pj(Rin), pj(R)]), col, px * 1.9, 1);
      this.glow(this.line([pj(L), pj(R)]), col, px * 1.1, 0.85);
    }

    /** The web with nothing on it — what the title card sits in front of. */
    idle() {
      this.clear();
      this.drawWeb(-1);
    }

    frame(state, opts) {
      opts = opts || {};
      this.clear();
      this.drawWeb(state.settled ? state.lane : -1);
      // Deepest first, so nearer things overdraw.
      const sorted = state.threats.slice().sort((a, b) => b.depth - a.depth);
      for (const t of sorted) this.drawThreat(t);
      for (const s of state.shots) this.drawShot(s);
      this.drawPlayer(state, opts.doomed);
    }
  }

  globalThis.Tempest = Object.assign(globalThis.Tempest || {}, {
    View,
    COLORS,
    DEPTH_MAX,
  });
})();
