// panels.js — the 2D readouts beside the 3D view.
//
// Four panels, each answering one question:
//   ContactMap    which specific native contacts are made right now
//   Funnel        which (Q, energy) states this trajectory has visited
//   Trace         how Q and RMSD have moved over the last while
//   SequenceStrip which residues, by sequence position, are folded
//
// Palette. Three chromatic roles, validated as a set for all pairs on a dark
// surface (OKLab CVD dE 8.4 worst, normal-vision 19.8 worst):
//   gold #c98500  foldedness — formed contacts, per-residue Q
//   blue #3987e5  Q, and the funnel's sequential density ramp
//   aqua #199e70  RMSD
// Q and RMSD are different scales, so they are two separate charts and never
// one dual-axis chart. Sequential ramps are one hue, dark-to-bright on dark.

export const INK = {
  gold: '#c98500',
  blue: '#3987e5',
  aqua: '#199e70',
  text: '#e8e9ee',
  dim: '#8f93a3',
  faint: 'rgba(255,255,255,0.07)',
  grid: 'rgba(255,255,255,0.06)',
  surface: '#0e1119',
};

/** Blue sequential ramp, near-surface to bright. Density, magnitude. */
const RAMP_BLUE = ['#0d366b', '#184f95', '#256abf', '#3987e5', '#6da7ec', '#9ec5f4', '#cde2fb'];
/** Gold sequential ramp, same job for the second sequential context. */
const RAMP_GOLD = ['#2a1f06', '#5a4103', '#8a6300', '#c98500', '#e0a63c', '#f2ca7e'];

const AA3 = {
  A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', Q: 'Gln', E: 'Glu', G: 'Gly',
  H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe', P: 'Pro', S: 'Ser',
  T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val',
};

function rampAt(ramp, t) {
  const x = Math.max(0, Math.min(1, t)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = ramp[i], b = ramp[i + 1];
  const pa = [1, 3, 5].map((k) => parseInt(a.slice(k, k + 2), 16));
  const pb = [1, 3, 5].map((k) => parseInt(b.slice(k, k + 2), 16));
  const c = pa.map((v, k) => Math.round(v + (pb[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** Shared canvas plumbing: DPR scaling, a tooltip, and pointer tracking. */
class Panel {
  constructor(canvas, tip) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.tip = tip;
    this.w = 0;
    this.h = 0;
    this.hover = null;
    canvas.addEventListener('pointermove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.hover = { x: e.clientX - r.left, y: e.clientY - r.top, cx: e.clientX, cy: e.clientY };
      this.render();
    });
    canvas.addEventListener('pointerleave', () => {
      this.hover = null;
      this.hideTip();
      this.render();
    });
  }

  showTip(html, cx, cy) {
    if (!this.tip) return;
    this.tip.innerHTML = html;
    this.tip.hidden = false;
    // keep the tooltip on screen near the right edge
    const w = this.tip.offsetWidth || 160;
    const left = Math.min(cx + 14, window.innerWidth - w - 10);
    this.tip.style.transform = `translate(${left}px, ${cy + 14}px)`;
  }

  hideTip() {
    if (this.tip) this.tip.hidden = true;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    if (w === this.w && h === this.h && this.dpr === dpr) return false;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  clear() {
    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
  }

  label(text, x, y, { color = INK.dim, align = 'left', size = 10, weight = 400 } = {}) {
    const { ctx } = this;
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ui-monospace, "SF Mono", Menlo, monospace`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(text, x, y);
  }
}

// ---------------------------------------------------------------- contact map
export class ContactMap extends Panel {
  constructor(canvas, tip) {
    super(canvas, tip);
    this.pad = { l: 30, r: 8, t: 8, b: 22 };
  }

  setProtein(p, contacts, nContacts) {
    this.p = p;
    this.contacts = contacts;
    this.nContacts = nContacts;
    this.formed = null;
  }

  update(formed) {
    this.formed = formed;
  }

  render() {
    if (!this.p) return;
    this.resize();
    this.clear();
    const { ctx, w, h, pad } = this;
    const n = this.p.n;
    const side = Math.max(10, Math.min(w - pad.l - pad.r, h - pad.t - pad.b));
    const ox = pad.l + (w - pad.l - pad.r - side) / 2;
    const oy = pad.t;
    const cell = side / n;
    const dot = Math.max(1.4, cell * 0.92);

    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    ctx.fillRect(ox, oy, side, side);
    ctx.strokeStyle = INK.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(ox + 0.5, oy + 0.5, side - 1, side - 1);

    // diagonal
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox + side, oy + side);
    ctx.stroke();

    // every native contact, recessive; then the ones currently made, in gold
    const put = (i, j, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(ox + i * cell, oy + j * cell, dot, dot);
      ctx.fillRect(ox + j * cell, oy + i * cell, dot, dot);
    };
    for (let c = 0; c < this.nContacts; c++) {
      put(this.contacts[3 * c], this.contacts[3 * c + 1], 'rgba(255,255,255,0.13)');
    }
    if (this.formed) {
      for (let c = 0; c < this.nContacts; c++) {
        if (this.formed[c]) put(this.contacts[3 * c], this.contacts[3 * c + 1], INK.gold);
      }
    }

    // axes: only the ends and the midpoint, so the numbers never collide
    this.label('1', ox, oy + side + 13);
    this.label(String(n), ox + side, oy + side + 13, { align: 'right' });
    this.label('residue j', ox - 6, oy + side / 2, { align: 'right' });

    // hover: nearest cell, reported as a residue pair
    if (this.hover) {
      const i = Math.floor((this.hover.x - ox) / cell);
      const j = Math.floor((this.hover.y - oy) / cell);
      if (i >= 0 && i < n && j >= 0 && j < n) {
        ctx.strokeStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.moveTo(ox + (i + 0.5) * cell, oy);
        ctx.lineTo(ox + (i + 0.5) * cell, oy + side);
        ctx.moveTo(ox, oy + (j + 0.5) * cell);
        ctx.lineTo(ox + side, oy + (j + 0.5) * cell);
        ctx.stroke();
        const seq = this.p.seq;
        const a = AA3[seq[i]] || seq[i];
        const b = AA3[seq[j]] || seq[j];
        let state = 'not a native contact';
        for (let c = 0; c < this.nContacts; c++) {
          const ci = this.contacts[3 * c], cj = this.contacts[3 * c + 1];
          if ((ci === i && cj === j) || (ci === j && cj === i)) {
            state = this.formed && this.formed[c] ? 'contact made' : 'native, not yet made';
            break;
          }
        }
        this.showTip(
          `<b>${a}${i + 1} · ${b}${j + 1}</b><span>${state}</span>`,
          this.hover.cx,
          this.hover.cy
        );
      } else {
        this.hideTip();
      }
    }
  }
}

// --------------------------------------------------------------------- funnel
/**
 * A 2D histogram of every (Q, energy) state the trajectory has visited. This is
 * the folding funnel that textbooks draw as a cartoon, drawn instead from the
 * run you are watching: wide and high at low Q, narrowing as it drops.
 */
export class Funnel extends Panel {
  constructor(canvas, tip) {
    super(canvas, tip);
    this.bins = 64;
    this.rows = 48;
    this.pad = { l: 34, r: 10, t: 10, b: 22 };
    this.reset();
  }

  reset() {
    this.grid = new Float32Array(this.bins * this.rows);
    this.max = 0;
    this.eLo = Infinity;
    this.eHi = -Infinity;
    this.pending = [];
    this.locked = false;
  }

  add(q, e) {
    if (!Number.isFinite(e)) return;
    this.cur = { q, e };
    if (!this.locked) {
      // Collect a little before fixing the energy axis; a range chosen from the
      // first sample alone would be the coil energy and nothing else.
      this.pending.push([q, e]);
      this.eLo = Math.min(this.eLo, e);
      this.eHi = Math.max(this.eHi, e);
      if (this.pending.length >= 45) {
        const span = Math.max(1, this.eHi - this.eLo);
        this.eLo -= span * 0.35;
        this.eHi += span * 0.2;
        this.locked = true;
        for (const [pq, pe] of this.pending) this._put(pq, pe);
        this.pending = [];
      }
      return;
    }
    this._put(q, e);
  }

  _put(q, e) {
    const bx = Math.max(0, Math.min(this.bins - 1, Math.floor(q * this.bins)));
    const t = (e - this.eLo) / Math.max(1e-6, this.eHi - this.eLo);
    const by = Math.max(0, Math.min(this.rows - 1, Math.floor((1 - t) * this.rows)));
    const k = by * this.bins + bx;
    this.grid[k] += 1;
    if (this.grid[k] > this.max) this.max = this.grid[k];
  }

  render() {
    this.resize();
    this.clear();
    const { ctx, w, h, pad } = this;
    const pw = w - pad.l - pad.r;
    const ph = h - pad.t - pad.b;
    if (pw < 10 || ph < 10) return;

    ctx.fillStyle = 'rgba(255,255,255,0.018)';
    ctx.fillRect(pad.l, pad.t, pw, ph);

    if (this.locked && this.max > 0) {
      const cw = pw / this.bins;
      const ch = ph / this.rows;
      const lmax = Math.log1p(this.max);
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.bins; x++) {
          const v = this.grid[y * this.bins + x];
          if (v === 0) continue;
          ctx.fillStyle = rampAt(RAMP_BLUE, Math.log1p(v) / lmax);
          ctx.fillRect(pad.l + x * cw, pad.t + y * ch, cw + 0.6, ch + 0.6);
        }
      }
    }

    ctx.strokeStyle = INK.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(pad.l + 0.5, pad.t + 0.5, pw - 1, ph - 1);

    // where the chain is right now — a 2px surface ring so it stays visible
    // wherever it lands on the density
    if (this.cur && this.locked) {
      const cx = pad.l + Math.max(0, Math.min(1, this.cur.q)) * pw;
      const t = (this.cur.e - this.eLo) / Math.max(1e-6, this.eHi - this.eLo);
      const cy = pad.t + (1 - Math.max(0, Math.min(1, t))) * ph;
      ctx.beginPath();
      ctx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      ctx.strokeStyle = INK.surface;
      ctx.lineWidth = 3.5;
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    this.label('0', pad.l, h - 7);
    this.label('Q  fraction of native contacts', pad.l + pw / 2, h - 7, { align: 'center' });
    this.label('1', pad.l + pw, h - 7, { align: 'right' });
    ctx.save();
    ctx.translate(11, pad.t + ph / 2);
    ctx.rotate(-Math.PI / 2);
    this.label('energy', 0, 0, { align: 'center' });
    ctx.restore();
  }
}

// --------------------------------------------------------------------- traces
/** One series, one scale. Two of these rather than one dual-axis chart. */
export class Trace extends Panel {
  constructor(canvas, { color, title, format, lo, hi, autoHi = false }) {
    super(canvas, null);
    this.color = color;
    this.title = title;
    this.format = format;
    this.lo = lo;
    this.hi = hi;
    this.autoHi = autoHi;
    this.cap = 900;
    this.buf = [];
  }

  reset() {
    this.buf = [];
  }

  add(v) {
    if (!Number.isFinite(v)) return;
    this.buf.push(v);
    if (this.buf.length > this.cap) this.buf.shift();
  }

  render() {
    this.resize();
    this.clear();
    const { ctx, w, h } = this;
    const padT = 16, padB = 4, padR = 46;
    const pw = w - padR;
    const ph = h - padT - padB;
    if (pw < 8 || ph < 4 || this.buf.length === 0) {
      this.label(this.title, 0, 11);
      return;
    }
    let hi = this.hi;
    if (this.autoHi) {
      hi = Math.max(this.hi, ...this.buf) * 1.05;
    }
    const y = (v) => padT + ph * (1 - (v - this.lo) / Math.max(1e-6, hi - this.lo));

    ctx.strokeStyle = INK.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, Math.round(y(this.lo)) + 0.5);
    ctx.lineTo(pw, Math.round(y(this.lo)) + 0.5);
    ctx.stroke();

    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const step = pw / Math.max(1, this.cap - 1);
    const off = pw - (this.buf.length - 1) * step;
    for (let i = 0; i < this.buf.length; i++) {
      const px = off + i * step;
      const py = y(this.buf[i]);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    const last = this.buf[this.buf.length - 1];
    ctx.beginPath();
    ctx.arc(pw, y(last), 3, 0, Math.PI * 2);
    ctx.fillStyle = this.color;
    ctx.fill();

    this.label(this.title, 0, 11);
    // one direct label, on the current value only
    this.label(this.format(last), w, 11, { align: 'right', color: INK.text, weight: 600 });
  }
}

// ------------------------------------------------------------- sequence strip
/**
 * The chain laid out flat: one cell per residue, gold by how much of that
 * residue's own native contact set is currently made, with the C-alpha
 * secondary structure above it. This is the bridge between "a sequence" and
 * "a shape" — the thing the 3D view alone never quite says.
 */
export class SequenceStrip extends Panel {
  constructor(canvas, tip) {
    super(canvas, tip);
    this.resq = null;
  }

  setProtein(p) {
    this.p = p;
  }

  update(resq) {
    this.resq = resq;
  }

  /** Residue under the pointer, or null. The 3D view highlights it. */
  get hovered() {
    if (!this.hover || !this.p) return null;
    const n = this.p.n;
    const cw = this.w / n;
    const i = Math.floor(this.hover.x / cw);
    return i >= 0 && i < n ? i : null;
  }

  render() {
    if (!this.p) return;
    this.resize();
    this.clear();
    const { ctx, w, h } = this;
    const n = this.p.n;
    const cw = w / n;
    const ssH = 6;
    const gap = 3;
    const barY = ssH + gap;
    const barH = Math.max(6, h - barY - 12);

    for (let i = 0; i < n; i++) {
      const x = i * cw;
      const q = this.resq ? this.resq[i] : 0;
      ctx.fillStyle = q > 0.02 ? rampAt(RAMP_GOLD, q) : 'rgba(255,255,255,0.07)';
      ctx.fillRect(x, barY, Math.max(1, cw - (cw > 4 ? 0.8 : 0)), barH);

      const s = this.p.ss[i];
      if (s === 'H') {
        ctx.fillStyle = 'rgba(232,233,238,0.60)';
        ctx.fillRect(x, 0, Math.max(1, cw - 0.5), ssH);
      } else if (s === 'E') {
        ctx.fillStyle = 'rgba(232,233,238,0.34)';
        ctx.fillRect(x, 1.5, Math.max(1, cw - 0.5), ssH - 3);
      } else {
        ctx.fillStyle = 'rgba(232,233,238,0.12)';
        ctx.fillRect(x, ssH / 2 - 0.5, Math.max(1, cw - 0.5), 1);
      }

      // the letter itself, once there is room for it
      if (cw >= 9) {
        ctx.fillStyle = q > 0.55 ? 'rgba(10,10,12,0.85)' : 'rgba(232,233,238,0.55)';
        ctx.font = `600 ${Math.min(11, cw * 0.85)}px ui-monospace, Menlo, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(this.p.seq[i], x + cw / 2, barY + barH / 2);
      }
    }

    this.label('N', 0, h - 1, { size: 9 });
    this.label('C', w, h - 1, { align: 'right', size: 9 });

    const i = this.hovered;
    if (i !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.strokeRect(i * cw - 0.5, barY - 0.5, Math.max(2, cw) + 1, barH + 1);
      const q = this.resq ? this.resq[i] : 0;
      const ss = { H: 'helix', E: 'strand', '-': 'coil' }[this.p.ss[i]];
      this.showTip(
        `<b>${AA3[this.p.seq[i]] || this.p.seq[i]}${i + 1}</b>` +
          `<span>${ss} · ${Math.round(q * 100)}% of its native contacts made</span>`,
        this.hover.cx,
        this.hover.cy
      );
    }
  }
}
