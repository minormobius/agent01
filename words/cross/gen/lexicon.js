// The crossword answer list, and the bit index the filler actually searches.
//
// WHY NOT THE DAWG NEXT DOOR. The game half of this surface already ships a
// minimal DAWG (../engine/dawg.js) and it is the right structure for the job it
// does: move generation walks the lexicon prefix by prefix, so a trie is the
// only thing that can answer "is there any word starting HALO reachable from
// this rack". A crossword filler asks a DIFFERENT question, and it asks it
// tens of thousands of times a puzzle:
//
//     which words of length 7 have R at position 2 and E at position 5?
//
// That is not a prefix walk — the known letters are scattered, and the answer
// is wanted as a SET, because the next thing the filler needs is the set's SIZE
// (to pick the most constrained slot) and whether it survives a crossing being
// pinned (to prune). A trie has to enumerate to answer that. A bit index
// answers it with an AND, incrementally, and undoes it with a memcpy.
//
// ------------------------------------------------------------- the index --
//
// Words are grouped by length. Inside a length, word i is bit i. For every
// (position, letter) there is one bitset of the words with that letter there:
//
//   bits[len] = Uint32Array( len * 26 * W )      W = ceil(count / 32)
//   block(pos, letter) = bits[len].subarray((pos*26 + letter) * W, ... + W)
//
// Candidates for a pattern are the AND of one block per known letter. The whole
// structure is about 1.3 MB for 50,000 answers and builds in well under a
// second, which is why it is built at load rather than committed as a binary:
// the committed artefact stays a diffable text file.
//
// DETERMINISM. Bit i means "the i-th word of this length IN FILE ORDER", so the
// committed order of answers.txt is load-bearing — the same seed reproduces the
// same puzzle only against the same list in the same order. That is what `id`
// is for: it is stamped into every permalink and checked on the way back in.

/**
 * FNV-1a over the answer body, as 8 hex characters. Defined here and imported
 * by tools/build-lexicon.mjs, so the builder and the loader cannot disagree
 * about what a lexicon's identity is.
 */
export function fnv1a(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const A = 65;
export const MIN_LEN = 3;
export const MAX_LEN = 15;

/** Bits set in a 32-bit word — the standard SWAR popcount. */
export function popcount32(v) {
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Bits set across a whole bitset. */
export function popcount(bits) {
  let n = 0;
  for (let i = 0; i < bits.length; i++) n += popcount32(bits[i]);
  return n;
}

class LengthIndex {
  /**
   * @param {number} len
   * @param {string[]} words in file order
   * @param {Uint32Array} ranks parallel to `words`; 0 = most frequent
   */
  constructor(len, words, ranks) {
    this.len = len;
    this.words = words;
    this.ranks = ranks;
    this.count = words.length;
    /** How many Uint32 a bitset over this length needs. */
    this.stride = (this.count + 31) >>> 5;
    this.bits = new Uint32Array(len * 26 * this.stride);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const wordIdx = i >>> 5;
      const bit = 1 << (i & 31);
      for (let p = 0; p < len; p++) {
        const l = w.charCodeAt(p) - A;
        this.bits[((p * 26 + l) * this.stride) + wordIdx] |= bit;
      }
    }
    // The trailing bits of the last Uint32 have no word behind them. This masks
    // them off once, here, so nothing downstream has to remember to.
    this.tailMask = (this.count & 31) === 0 ? 0xffffffff : ((1 << (this.count & 31)) - 1) >>> 0;

    // Word indices ordered by rank, commonest first. The filler walks this to
    // find the best few candidates a slot still allows WITHOUT enumerating the
    // slot's whole domain — an open 7-letter slot has nearly eight thousand
    // candidates and wants a dozen of them.
    this.byRank = Uint32Array.from(
      Array.from({ length: this.count }, (_, i) => i).sort((a, b) => (ranks[a] - ranks[b]) || (a - b))
    );

    // The same letters as `words`, as numbers. Reading a letter out of a
    // JavaScript string is not free, and the filler reads every letter of every
    // surviving word every time it wants to know what a slot still permits;
    // this was a third of the total running time as `charCodeAt`.
    this.letters = new Uint8Array(this.count * len);
    for (let i = 0; i < this.count; i++) {
      const w = words[i];
      for (let p = 0; p < len; p++) this.letters[i * len + p] = w.charCodeAt(p) - A;
    }

    // Per GROUP OF 32 WORDS — one Uint32 of a bitset — the letters that appear
    // at each position anywhere in that group. When a bitset holds a whole
    // group, its contribution to "which letters are still possible" is this,
    // read in one step instead of thirty-two. Early in a fill almost every
    // group is whole, which is exactly when the domains are largest and reading
    // them was most expensive.
    this.groupLetters = new Int32Array(this.stride * len);
    for (let i = 0; i < this.count; i++) {
      const g = (i >>> 5) * len;
      for (let p = 0; p < len; p++) this.groupLetters[g + p] |= 1 << this.letters[i * len + p];
    }
    /** The bit pattern of a COMPLETE group — the last one is short. */
    this.groupFull = new Uint32Array(this.stride).fill(0xffffffff);
    this.groupFull[this.stride - 1] = this.tailMask;
  }

  /** Is word `i` in this bitset? */
  static isSet(bits, i) { return (bits[i >>> 5] & (1 << (i & 31))) !== 0; }

  /**
   * Where the block of words with `letter` (0..25) at `pos` starts in `bits`.
   *
   * An OFFSET rather than a subarray, and that is not a style preference. The
   * filler asks for a block tens of millions of times per puzzle, `subarray`
   * allocates a view object every time, and the allocation plus the garbage it
   * makes was a fifth of the total running time. Everything hot takes
   * (bits, offset) and indexes; `block()` below is for callers that are not in
   * a loop.
   */
  blockAt(pos, letter) { return (pos * 26 + letter) * this.stride; }

  /** The block as its own array. Convenience for tests — do not call in a loop. */
  block(pos, letter) {
    const off = this.blockAt(pos, letter);
    return this.bits.subarray(off, off + this.stride);
  }

  /** A fresh bitset with every word of this length set. */
  full() {
    const out = new Uint32Array(this.stride).fill(0xffffffff);
    out[this.stride - 1] = this.tailMask;
    return out;
  }

  /** A fresh bitset with every word ranked below `maxRank` set. */
  pool(maxRank) {
    if (!Number.isFinite(maxRank)) return this.full();
    const out = new Uint32Array(this.stride);
    for (let i = 0; i < this.count; i++) {
      if (this.ranks[i] < maxRank) out[i >>> 5] |= 1 << (i & 31);
    }
    return out;
  }
}

export class Lexicon {
  /** @param {string} text the contents of dict/answers.txt */
  constructor(text) {
    // The id covers the DATA LINES ONLY: re-wording the header comment must not
    // invalidate every permalink anybody has shared, and adding a word must.
    const body = [];
    /** @type {Map<number, {words: string[], ranks: number[]}>} */
    const groups = new Map();
    let total = 0;
    for (const line of text.split('\n')) {
      if (!line || line.charCodeAt(0) === 35 /* # */) continue;
      const sp = line.indexOf(' ');
      const word = sp < 0 ? line : line.slice(0, sp);
      const rank = sp < 0 ? 0 : Number(line.slice(sp + 1));
      if (word.length < MIN_LEN || word.length > MAX_LEN) continue;
      body.push(line);
      if (!groups.has(word.length)) groups.set(word.length, { words: [], ranks: [] });
      const g = groups.get(word.length);
      g.words.push(word);
      g.ranks.push(rank);
      total++;
    }
    this.id = fnv1a(body.join('\n'));
    this.size = total;
    /** @type {Map<number, LengthIndex>} */
    this.byLength = new Map();
    // Ascending, so iteration order is a property of the data rather than of
    // the order the lengths happened to appear in the file.
    for (const len of [...groups.keys()].sort((a, b) => a - b)) {
      const g = groups.get(len);
      this.byLength.set(len, new LengthIndex(len, g.words, Uint32Array.from(g.ranks)));
    }
  }

  /** @returns {LengthIndex | undefined} */
  index(len) { return this.byLength.get(len); }

  /** Is `word` an answer? The file is sorted, so this is a binary search. */
  has(word) {
    const idx = this.byLength.get(word.length);
    if (!idx) return false;
    let lo = 0, hi = idx.words.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const w = idx.words[mid];
      if (w === word) return true;
      if (w < word) lo = mid + 1; else hi = mid - 1;
    }
    return false;
  }

  /** Every length present, ascending. */
  lengths() { return [...this.byLength.keys()]; }
}

// -------------------------------------------------------- bitset helpers --
//
// These take an explicit destination. The filler assigns and unassigns hundreds
// of thousands of times per puzzle and cannot afford an allocation on each one.

/** dst &= src, returning the popcount of the result. */
export function andInto(dst, src) {
  let n = 0;
  for (let i = 0; i < dst.length; i++) {
    const v = (dst[i] &= src[i]);
    n += popcount32(v);
  }
  return n;
}

/** dst &= the block at `off` in `src`, returning the popcount of the result. */
export function andIntoAt(dst, src, off) {
  let n = 0;
  for (let i = 0; i < dst.length; i++) {
    const v = (dst[i] &= src[off + i]);
    n += popcount32(v);
  }
  return n;
}

/** dst &= ~the block at `off` in `src`. The caller counts if it needs to. */
export function andNotAt(dst, src, off) {
  for (let i = 0; i < dst.length; i++) dst[i] &= ~src[off + i];
}

/** Is `a & b` non-empty? Bails on the first hit. */
export function intersects(a, b) {
  for (let i = 0; i < a.length; i++) if (a[i] & b[i]) return true;
  return false;
}

/** Does `a` meet the block at `off` in `src`? Bails on the first hit. */
export function intersectsAt(a, src, off) {
  for (let i = 0; i < a.length; i++) if (a[i] & src[off + i]) return true;
  return false;
}

/** Call `fn(i)` for every set bit, ascending. */
export function forEachBit(bits, fn) {
  for (let w = 0; w < bits.length; w++) {
    let v = bits[w];
    while (v) {
      const lsb = v & -v;
      fn((w << 5) + (31 - Math.clz32(lsb)));
      v ^= lsb;
    }
  }
}
