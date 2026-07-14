// golem — builder operations on a 15^3 bit structure: place/remove with
// mirror symmetry, undo/redo, and a base64url codec so every build is a
// permalink. Pure module, node-testable (builder.selftest.mjs).

import { GRID, NCELLS } from './nca.js';

export const BYTES = Math.ceil(NCELLS / 8); // 422

export const cellOf = (a0, a1, a2) => (a0 * GRID + a1) * GRID + a2;
export const coordsOf = (cell) => [
  Math.floor(cell / (GRID * GRID)),
  Math.floor(cell / GRID) % GRID,
  cell % GRID,
];

// Mirror across the lattice mid-plane of axis1 (world Z — left/right when
// driving along X). Self-inverse; the mid column maps to itself.
export function mirrorCell(cell) {
  const [a0, a1, a2] = coordsOf(cell);
  return cellOf(a0, GRID - 1 - a1, a2);
}

export class Builder {
  constructor() {
    this.structure = new Uint8Array(NCELLS);
    this.undoStack = [];
    this.redoStack = [];
  }

  count() {
    let n = 0;
    for (let i = 0; i < NCELLS; i++) n += this.structure[i];
    return n;
  }

  // Returns the list of cells actually changed (for syncing the NCA).
  _apply(cells, value) {
    const changed = [];
    for (const c of cells) {
      if (c < 0 || c >= NCELLS) continue;
      if (this.structure[c] !== value) {
        this.structure[c] = value;
        changed.push(c);
      }
    }
    return changed;
  }

  place(cell, symmetry = false) {
    const targets = symmetry ? [cell, mirrorCell(cell)] : [cell];
    const changed = this._apply(targets, 1);
    if (changed.length) {
      this.undoStack.push({ cells: changed, value: 1 });
      this.redoStack.length = 0;
    }
    return changed;
  }

  remove(cell, symmetry = false) {
    const targets = symmetry ? [cell, mirrorCell(cell)] : [cell];
    const changed = this._apply(targets, 0);
    if (changed.length) {
      this.undoStack.push({ cells: changed, value: 0 });
      this.redoStack.length = 0;
    }
    return changed;
  }

  // Load a whole structure as one undoable op. Returns [placed, removed].
  load(structure) {
    const placed = [], removed = [];
    for (let i = 0; i < NCELLS; i++) {
      const v = structure[i] ? 1 : 0;
      if (this.structure[i] !== v) (v ? placed : removed).push(i);
    }
    if (placed.length || removed.length) {
      this.undoStack.push({ placed, removed, isLoad: true });
      this.redoStack.length = 0;
      for (const c of placed) this.structure[c] = 1;
      for (const c of removed) this.structure[c] = 0;
    }
    return [placed, removed];
  }

  _invert(op) {
    if (op.isLoad) {
      for (const c of op.placed) this.structure[c] = 0;
      for (const c of op.removed) this.structure[c] = 1;
      return { placed: op.removed, removed: op.placed, isLoad: true };
    }
    const v = op.value ? 0 : 1;
    for (const c of op.cells) this.structure[c] = v;
    return { cells: op.cells, value: v };
  }

  // Undo/redo return {placed:[], removed:[]} so the caller can sync the NCA.
  undo() {
    const op = this.undoStack.pop();
    if (!op) return null;
    const inv = this._invert(op);
    this.redoStack.push(op);
    return opDelta(inv);
  }

  redo() {
    const op = this.redoStack.pop();
    if (!op) return null;
    if (op.isLoad) {
      for (const c of op.placed) this.structure[c] = 1;
      for (const c of op.removed) this.structure[c] = 0;
      return { placed: op.placed, removed: op.removed };
    }
    for (const c of op.cells) this.structure[c] = op.value;
    return op.value ? { placed: op.cells, removed: [] } : { placed: [], removed: op.cells };
  }
}

function opDelta(op) {
  if (op.isLoad) return { placed: op.placed, removed: op.removed };
  return op.value ? { placed: op.cells, removed: [] } : { placed: [], removed: op.cells };
}

// ---- permalink codec (bit-pack big-endian per byte, like np.packbits) ------
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function encodeStructure(structure) {
  const bytes = new Uint8Array(BYTES);
  for (let i = 0; i < NCELLS; i++) {
    if (structure[i]) bytes[i >> 3] |= 128 >> (i & 7);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = i + 1 < bytes.length ? bytes[i + 1] : 0, b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64URL[b0 >> 2] + B64URL[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += B64URL[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += B64URL[b2 & 63];
  }
  return out;
}

export function decodeStructure(str) {
  const rev = {};
  for (let i = 0; i < 64; i++) rev[B64URL[i]] = i;
  const expectLen = Math.ceil((BYTES * 4) / 3);
  if (typeof str !== 'string' || str.length !== expectLen) return null;
  const bytes = new Uint8Array(BYTES);
  let bi = 0;
  for (let i = 0; i < str.length; i += 4) {
    const v = [0, 1, 2, 3].map((k) => (i + k < str.length ? rev[str[i + k]] : 0));
    if (v.some((x) => x === undefined)) return null;
    if (bi < BYTES) bytes[bi++] = (v[0] << 2) | (v[1] >> 4);
    if (bi < BYTES) bytes[bi++] = ((v[1] & 15) << 4) | (v[2] >> 2);
    if (bi < BYTES) bytes[bi++] = ((v[2] & 3) << 6) | v[3];
  }
  const structure = new Uint8Array(NCELLS);
  for (let i = 0; i < NCELLS; i++) {
    structure[i] = (bytes[i >> 3] >> (7 - (i & 7))) & 1;
  }
  return structure;
}
