// The lexicon, as a minimal acyclic DFA (a DAWG) in a flat Uint32Array.
//
// WHY NOT A Set OF STRINGS. Two reasons, and the second is the real one.
// ENABLE is 172,823 words — about 1.9 MB of text, which a Set inflates to tens
// of megabytes of JS strings in a Worker that has to boot on every cold start.
// But the binding constraint is the AI: move generation walks the lexicon
// PREFIX BY PREFIX, asking "is there any word starting HALO that I can reach
// from this rack" thousands of times per turn. A Set cannot answer that at all;
// a trie can, and the minimal version of that trie is this. 172k words become
// ~300k edges — one megabyte of Uint32, memory-mapped straight out of the
// asset, no parse step.
//
// ------------------------------------------------------------ the format --
//
//   magic 'MDWG' | u32 version | u32 edgeCount | u32 rootEdge | u32 wordCount
//   then edgeCount * u32, each edge:
//
//     bits  0..4   letter, 1..26 (A..Z)
//     bit   5      terminal — a word ends on this edge
//     bit   6      last — final edge of this node's list
//     bits  7..31  the target node, as the index of ITS first edge (0 = leaf)
//
// A NODE IS JUST THE INDEX OF ITS FIRST EDGE, and its edges are the run from
// there up to and including the one with the `last` bit set. Index 0 is
// reserved to mean "no child", which is why allocation starts at 1.

export const MAGIC = 0x4d445747; // 'MDWG'
export const VERSION = 1;
export const HEADER_U32 = 5;

const LETTER_MASK = 0x1f;
const TERMINAL_BIT = 1 << 5;
const LAST_BIT = 1 << 6;
const CHILD_SHIFT = 7;

export const A = 'A'.charCodeAt(0);
/** 'A'..'Z' -> 1..26, anything else -> 0. */
export const letterIndex = (ch) => {
  const n = ch.charCodeAt(0) - A + 1;
  return n >= 1 && n <= 26 ? n : 0;
};
export const indexLetter = (n) => String.fromCharCode(A + n - 1);

export class Dawg {
  /** @param {ArrayBuffer|Uint8Array} buf a serialized DAWG */
  constructor(buf) {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    // Copy when the source is not 4-byte aligned; a Worker's asset body often
    // is not, and Uint32Array construction throws rather than realigning.
    const aligned = bytes.byteOffset % 4 === 0 ? bytes : new Uint8Array(bytes);
    const u32 = new Uint32Array(aligned.buffer, aligned.byteOffset, aligned.byteLength >>> 2);
    if (u32[0] !== MAGIC) throw new Error('not a DAWG (bad magic)');
    if (u32[1] !== VERSION) throw new Error(`DAWG version ${u32[1]}, expected ${VERSION}`);
    this.edgeCount = u32[2];
    this.root = u32[3];
    this.wordCount = u32[4];
    this.edges = u32.subarray(HEADER_U32, HEADER_U32 + this.edgeCount);
  }

  letter(e) { return this.edges[e] & LETTER_MASK; }
  isTerminal(e) { return (this.edges[e] & TERMINAL_BIT) !== 0; }
  isLast(e) { return (this.edges[e] & LAST_BIT) !== 0; }
  /** The node an edge leads to — 0 when the edge is a leaf. */
  child(e) { return this.edges[e] >>> CHILD_SHIFT; }

  /**
   * The edge leaving `node` labelled `letterIdx`, or 0 if there is none.
   * Edges are written in letter order, so this bails early — worth doing, it
   * is the single hottest call in move generation.
   */
  edge(node, letterIdx) {
    if (!node) return 0;
    for (let e = node; ; e++) {
      const l = this.edges[e] & LETTER_MASK;
      if (l === letterIdx) return e;
      if (l > letterIdx) return 0;
      if (this.edges[e] & LAST_BIT) return 0;
    }
  }

  /** Walk a prefix. Returns the node reached, or 0 if the prefix is dead. */
  walk(prefix, node = this.root) {
    let n = node;
    for (let i = 0; i < prefix.length; i++) {
      const e = this.edge(n, letterIndex(prefix[i]));
      if (!e) return 0;
      n = this.child(e);
      if (!n && i < prefix.length - 1) return 0;
    }
    return n;
  }

  /** Is `word` in the lexicon? Case-insensitive; non-letters are never words. */
  has(word) {
    const w = String(word).toUpperCase();
    if (!w.length) return false;
    let node = this.root;
    for (let i = 0; i < w.length; i++) {
      const li = letterIndex(w[i]);
      if (!li) return false;
      const e = this.edge(node, li);
      if (!e) return false;
      if (i === w.length - 1) return this.isTerminal(e);
      node = this.child(e);
      if (!node) return false;
    }
    return false;
  }

  /** Every letter that continues `node` into a word, as a 26-bit mask (bit 0 = A). */
  continuations(node) {
    let mask = 0;
    if (!node) return mask;
    for (let e = node; ; e++) {
      mask |= 1 << (this.letter(e) - 1);
      if (this.isLast(e)) break;
    }
    return mask;
  }

  /** All words under `node`, prefixed. Debug/selftest only — allocates freely. */
  *words(node = this.root, prefix = '') {
    if (!node) return;
    for (let e = node; ; e++) {
      const w = prefix + indexLetter(this.letter(e));
      if (this.isTerminal(e)) yield w;
      yield* this.words(this.child(e), w);
      if (this.isLast(e)) break;
    }
  }
}

// ------------------------------------------------------------- the build --
//
// Daciuk et al.'s incremental construction: feed SORTED words, keep the path of
// the last word live, and minimise everything to the right of the new word's
// common prefix as soon as it can no longer change. Peak memory is the register
// plus one word's worth of path, not the whole trie.

class Node {
  constructor() {
    this.children = new Map(); // letterIdx -> Node
    this.final = false;
    this.id = -1;
  }
  /** Structural key — two nodes with the same key are the same automaton. */
  key() {
    let s = this.final ? '1' : '0';
    for (const [l, c] of this.children) s += `:${l}>${c.id}`;
    return s;
  }
}

/**
 * Build a minimal DAWG and serialize it.
 * @param {Iterable<string>} words must be uppercase A-Z, sorted, unique
 * @returns {{buffer: Uint8Array, stats: object}}
 */
export function buildDawg(words) {
  const root = new Node();
  const register = new Map(); // key -> Node
  let previous = '';
  let wordCount = 0;
  let nextId = 0;
  const uncheckedStack = []; // [parent, letterIdx, child]

  // Deepest first, so a node's children are always canonical (and carry ids)
  // by the time its own key is taken.
  const minimize = (downTo) => {
    for (let i = uncheckedStack.length - 1; i >= downTo; i--) {
      const [parent, letter, child] = uncheckedStack[i];
      const k = child.key();
      const existing = register.get(k);
      if (existing) {
        parent.children.set(letter, existing);
      } else {
        child.id = nextId++;
        register.set(k, child);
      }
      uncheckedStack.pop();
    }
  };

  for (const raw of words) {
    const word = raw;
    if (word <= previous && previous !== '') {
      throw new Error(`buildDawg needs sorted unique input: ${previous} then ${word}`);
    }
    let common = 0;
    while (common < word.length && common < previous.length && word[common] === previous[common]) common++;
    minimize(common);

    let node = uncheckedStack.length ? uncheckedStack[uncheckedStack.length - 1][2] : root;
    for (let i = common; i < word.length; i++) {
      const li = letterIndex(word[i]);
      if (!li) throw new Error(`buildDawg: non A-Z letter in ${word}`);
      const child = new Node();
      node.children.set(li, child);
      uncheckedStack.push([node, li, child]);
      node = child;
    }
    node.final = true;
    previous = word;
    wordCount++;
  }
  minimize(0);

  // ---- serialize ----
  // Collect the distinct nodes that have children; each becomes one contiguous
  // run of edges. Offsets must be known before any parent is written, so this
  // is two passes: allocate, then emit.
  const nodes = [];
  const offset = new Map(); // Node -> first edge index
  const seen = new Set();
  (function collect(n) {
    if (seen.has(n)) return;
    seen.add(n);
    if (n.children.size) nodes.push(n);
    for (const c of n.children.values()) collect(c);
  })(root);

  let next = 1; // 0 is reserved for "no child"
  for (const n of nodes) {
    offset.set(n, next);
    next += n.children.size;
  }
  const edgeCount = next;

  const out = new Uint32Array(HEADER_U32 + edgeCount);
  out[0] = MAGIC;
  out[1] = VERSION;
  out[2] = edgeCount;
  out[3] = offset.get(root) || 0;
  out[4] = wordCount;

  for (const n of nodes) {
    const letters = [...n.children.keys()].sort((a, b) => a - b);
    const base = offset.get(n);
    letters.forEach((l, i) => {
      const child = n.children.get(l);
      const childOffset = child.children.size ? offset.get(child) : 0;
      if (childOffset > (1 << 25)) throw new Error('DAWG too large for the 25-bit child field');
      let edge = l;
      if (child.final) edge |= TERMINAL_BIT;
      if (i === letters.length - 1) edge |= LAST_BIT;
      edge |= childOffset << CHILD_SHIFT;
      out[HEADER_U32 + base + i] = edge >>> 0;
    });
  }

  return {
    buffer: new Uint8Array(out.buffer, out.byteOffset, out.byteLength),
    stats: { words: wordCount, nodes: nodes.length, edges: edgeCount, bytes: out.byteLength },
  };
}
