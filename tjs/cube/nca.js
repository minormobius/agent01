// cube — a browser port of rmorenoga/cube3D's neural cellular automaton.
//
// Every living voxel is a "smart brick": it holds a 28-channel state
// [structure(1), hidden(20), class beliefs(7)] and runs the SAME tiny network
// the physical ESP32 cubes run (weights lifted verbatim from the firmware's
// neural_network.h). One step:
//
//   perception[84] = relu( bias + Σ_dir W_dir · state_neighbor(dir) )   7-point stencil
//   h[84]          = relu( W1 · perception + b1 )
//   update[27]     = tanh( W2 · h + b2 )
//   if alive && rand() <= fireRate: state[1..27] += update              residual, async fire
//
// Class belief = the last 7 channels; a cube's vote is their argmax. There is
// no global coordinator — consensus emerges from neighbor gossip alone, which
// is why the swarm re-classifies after you smash pieces off ("damage recovery").
//
// Pure module: no DOM, no three.js — node-testable (see nca.selftest.mjs).

export const GRID = 15;
export const CH = 28;      // 1 structure + 20 hidden + 7 classes
export const PC = 84;      // perception channels (CH * 3)
export const NC = 7;       // classes
export const NCELLS = GRID * GRID * GRID;

// Direction table: [dx, dy, dz] in dataset axis order (axis0, axis1, axis2).
// Order MUST match the concatenation order in weights.js (emit_assets.py):
// self, north(x-1), south(x+1), west(y-1), east(y+1), front(z-1), back(z+1).
export const DIRS = [
  [0, 0, 0],
  [-1, 0, 0], [1, 0, 0],
  [0, -1, 0], [0, 1, 0],
  [0, 0, -1], [0, 0, 1],
];

export function decodeB64f32(b64) {
  let bytes;
  if (typeof atob === 'function') {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  } else {
    bytes = new Uint8Array(Buffer.from(b64, 'base64'));
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

export function decodeB64u8(b64) {
  if (typeof atob === 'function') {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, 'base64'));
}

// Unpack one bit-packed 15^3 shape (422 bytes, np.packbits big-endian per byte).
export function unpackShape(packed, index) {
  const BYTES = Math.ceil(NCELLS / 8); // 422
  const out = new Uint8Array(NCELLS);
  const off = index * BYTES;
  for (let i = 0; i < NCELLS; i++) {
    out[i] = (packed[off + (i >> 3)] >> (7 - (i & 7))) & 1;
  }
  return out;
}

export function splitWeights(blob) {
  let o = 0;
  const take = (n) => { const v = blob.subarray(o, o + n); o += n; return v; };
  const w = {
    kernels: DIRS.map(() => take(CH * PC)),  // 7 × [28][84], row-major (in, out)
    pBias: take(PC),
    dk1: take(PC * PC), db1: take(PC),
    dk2: take(PC * (CH - 1)), db2: take(CH - 1),
  };
  if (o !== blob.length) throw new Error(`weights blob size mismatch: ${o} != ${blob.length}`);
  return w;
}

// mulberry32 — seedable PRNG so selftests are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class NCA {
  constructor(weights) {
    this.w = weights;
    this.state = new Float32Array(NCELLS * CH);
    this.structure = new Uint8Array(NCELLS);
    this.live = [];            // indices of living cells
    this.neighbors = new Int32Array(NCELLS * 7); // -1 = out of bounds
    this.steps = 0;
    this._perc = new Float32Array(PC);
    this._h = new Float32Array(PC);
    this._upd = null;          // per-live-cell update buffer
    this._buildNeighbors();
  }

  _buildNeighbors() {
    const n = this.neighbors;
    let i = 0;
    for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) for (let z = 0; z < GRID; z++, i++) {
      for (let d = 0; d < 7; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        n[i * 7 + d] = (nx < 0 || ny < 0 || nz < 0 || nx >= GRID || ny >= GRID || nz >= GRID)
          ? -1 : (nx * GRID + ny) * GRID + nz;
      }
    }
  }

  // structure: Uint8Array(NCELLS) of 0/1. Resets all state.
  setStructure(structure) {
    this.structure.set(structure);
    this.reset();
  }

  reset() {
    this.state.fill(0);
    this.live = [];
    for (let i = 0; i < NCELLS; i++) {
      if (this.structure[i]) {
        this.state[i * CH] = 1;   // gray channel
        this.live.push(i);
      }
    }
    this._upd = new Float32Array(this.live.length * (CH - 1));
    this.steps = 0;
  }

  // Remove a cube (damage). Its state zeroes out; neighbors stop hearing it.
  damage(cell) {
    if (!this.structure[cell]) return false;
    this.structure[cell] = 0;
    this.state.fill(0, cell * CH, cell * CH + CH);
    this.live = this.live.filter((i) => i !== cell);
    this._upd = new Float32Array(this.live.length * (CH - 1));
    return true;
  }

  // One synchronous NCA step: all cells perceive the OLD state, then apply.
  step(fireRate = 0.5, rand = Math.random) {
    const { kernels, pBias, dk1, db1, dk2, db2 } = this.w;
    const st = this.state, nb = this.neighbors;
    const perc = this._perc, h = this._h, upd = this._upd;
    const live = this.live, nLive = live.length;

    for (let li = 0; li < nLive; li++) {
      const cell = live[li];
      perc.set(pBias);
      for (let d = 0; d < 7; d++) {
        const ncell = nb[cell * 7 + d];
        if (ncell < 0) continue;
        const base = ncell * CH, K = kernels[d];
        for (let c = 0; c < CH; c++) {
          const s = st[base + c];
          if (s === 0) continue;
          const ko = c * PC;
          for (let o = 0; o < PC; o++) perc[o] += s * K[ko + o];
        }
      }
      for (let o = 0; o < PC; o++) if (perc[o] < 0) perc[o] = 0;

      h.set(db1);
      for (let c = 0; c < PC; c++) {
        const p = perc[c];
        if (p === 0) continue;
        const ko = c * PC;
        for (let o = 0; o < PC; o++) h[o] += p * dk1[ko + o];
      }
      for (let o = 0; o < PC; o++) if (h[o] < 0) h[o] = 0;

      const uo = li * (CH - 1);
      for (let o = 0; o < CH - 1; o++) upd[uo + o] = db2[o];
      for (let c = 0; c < PC; c++) {
        const v = h[c];
        if (v === 0) continue;
        const ko = c * (CH - 1);
        for (let o = 0; o < CH - 1; o++) upd[uo + o] += v * dk2[ko + o];
      }
    }

    for (let li = 0; li < nLive; li++) {
      if (rand() > fireRate) continue;
      const base = live[li] * CH + 1, uo = li * (CH - 1);
      for (let o = 0; o < CH - 1; o++) st[base + o] += Math.tanh(upd[uo + o]);
    }
    this.steps++;
  }

  // Class logits of one cell (view, length NC).
  logits(cell) {
    const base = cell * CH + (CH - NC);
    return this.state.subarray(base, base + NC);
  }

  // Per-cell argmax vote of one cell.
  vote(cell) {
    const lg = this.logits(cell);
    let best = 0;
    for (let k = 1; k < NC; k++) if (lg[k] > lg[best]) best = k;
    return best;
  }

  // Softmax confidence of one cell's winning class.
  confidence(cell) {
    const lg = this.logits(cell);
    let mx = -Infinity;
    for (let k = 0; k < NC; k++) if (lg[k] > mx) mx = lg[k];
    let sum = 0, top = 0;
    for (let k = 0; k < NC; k++) {
      const e = Math.exp(lg[k] - mx);
      sum += e;
      if (e > top) top = e;
    }
    return top / sum;
  }

  // Vote histogram over all living cells -> Float32Array(NC) fractions.
  consensus() {
    const counts = new Float32Array(NC);
    for (const cell of this.live) counts[this.vote(cell)]++;
    const n = this.live.length || 1;
    for (let k = 0; k < NC; k++) counts[k] /= n;
    return counts;
  }
}
