// golem — the NCA engine from tjs/cube, extended for a builder world:
// cubes can be PLACED as well as smashed, and a creature can be split into
// connected components that each carry their state forward.
//
// Every living voxel is a "smart brick": a 28-channel state
// [structure(1), hidden(20), class beliefs(7)] updated by the EXACT trained
// network from the physical cube3D ESP32 firmware (neural_network.h):
//
//   perception[84] = relu( bias + Σ_dir W_dir · state_neighbor(dir) )   7-point stencil
//   h[84]          = relu( W1 · perception + b1 )
//   update[27]     = tanh( W2 · h + b2 )
//   if alive && rand() <= fireRate: state[1..27] += update
//
// Pure module: no DOM, no three.js — node-testable (nca.selftest.mjs).

export const GRID = 15;
export const CH = 28;      // 1 structure + 20 hidden + 7 classes
export const PC = 84;      // perception channels (CH * 3)
export const NC = 7;       // classes
export const NCELLS = GRID * GRID * GRID;

// Direction table in dataset axis order (axis0, axis1, axis2). Order MUST
// match weights.js concatenation: self, north(x-1), south(x+1), west(y-1),
// east(y+1), front(z-1), back(z+1).
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
    kernels: DIRS.map(() => take(CH * PC)),
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

// Shared static face-neighbor table (module-level: every NCA instance and the
// component walker use the same one). -1 = out of bounds. Layout: cell*7 + dir.
export const NEIGHBORS = (() => {
  const n = new Int32Array(NCELLS * 7);
  let i = 0;
  for (let x = 0; x < GRID; x++) for (let y = 0; y < GRID; y++) for (let z = 0; z < GRID; z++, i++) {
    for (let d = 0; d < 7; d++) {
      const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
      n[i * 7 + d] = (nx < 0 || ny < 0 || nz < 0 || nx >= GRID || ny >= GRID || nz >= GRID)
        ? -1 : (nx * GRID + ny) * GRID + nz;
    }
  }
  return n;
})();

export class NCA {
  constructor(weights) {
    this.w = weights;
    this.state = new Float32Array(NCELLS * CH);
    this.structure = new Uint8Array(NCELLS);
    this.live = [];
    this.steps = 0;
    this._perc = new Float32Array(PC);
    this._h = new Float32Array(PC);
    this._upd = new Float32Array(0);
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
        this.state[i * CH] = 1;
        this.live.push(i);
      }
    }
    this._upd = new Float32Array(this.live.length * (CH - 1));
    this.steps = 0;
  }

  // Add a cube: joins with blank beliefs and gets recruited by gossip.
  place(cell) {
    if (cell < 0 || cell >= NCELLS || this.structure[cell]) return false;
    this.structure[cell] = 1;
    this.state.fill(0, cell * CH, cell * CH + CH);
    this.state[cell * CH] = 1;
    this.live.push(cell);
    this._upd = new Float32Array(this.live.length * (CH - 1));
    return true;
  }

  // Remove a cube (damage). Its state zeroes out; neighbors stop hearing it.
  damage(cell) {
    if (cell < 0 || cell >= NCELLS || !this.structure[cell]) return false;
    this.structure[cell] = 0;
    this.state.fill(0, cell * CH, cell * CH + CH);
    this.live = this.live.filter((i) => i !== cell);
    this._upd = new Float32Array(this.live.length * (CH - 1));
    return true;
  }

  // Carve out a sub-creature: a new NCA holding only `cells`, with their
  // current state COPIED (survivors keep their beliefs — continuity of self).
  extract(cells) {
    const child = new NCA(this.w);
    for (const cell of cells) {
      if (!this.structure[cell]) continue;
      child.structure[cell] = 1;
      child.state.set(this.state.subarray(cell * CH, cell * CH + CH), cell * CH);
      child.live.push(cell);
    }
    child._upd = new Float32Array(child.live.length * (CH - 1));
    child.steps = this.steps;
    return child;
  }

  // One synchronous NCA step: all cells perceive the OLD state, then apply.
  step(fireRate = 0.5, rand = Math.random) {
    const { kernels, pBias, dk1, db1, dk2, db2 } = this.w;
    const st = this.state, nb = NEIGHBORS;
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

  vote(cell) {
    const lg = this.logits(cell);
    let best = 0;
    for (let k = 1; k < NC; k++) if (lg[k] > lg[best]) best = k;
    return best;
  }

  // Softmax probabilities of one cell -> Float32Array(NC) (fresh array).
  probs(cell) {
    const lg = this.logits(cell);
    let mx = -Infinity;
    for (let k = 0; k < NC; k++) if (lg[k] > mx) mx = lg[k];
    const p = new Float32Array(NC);
    let sum = 0;
    for (let k = 0; k < NC; k++) { p[k] = Math.exp(lg[k] - mx); sum += p[k]; }
    for (let k = 0; k < NC; k++) p[k] /= sum;
    return p;
  }

  confidence(cell) {
    const p = this.probs(cell);
    let top = 0;
    for (let k = 0; k < NC; k++) if (p[k] > top) top = p[k];
    return top;
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
