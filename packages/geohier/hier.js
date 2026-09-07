// hier.js — hierarchy rollups that are actually correct. No dependencies.
//
// THE PROBLEM THIS SOLVES:
//
// Every level of a geographic hierarchy wants the same measures — per capita
// income, the transfer share, GDP per job — and the naive way to produce them
// is to average the children. That is wrong, always, and wrong in a direction:
// averaging counties gives every county one vote, so Loving County, Texas
// (population 64) counts as much as Los Angeles (9.7 million). A state's
// "average county income" and its actual income per person are different
// numbers, and the gap is largest exactly where somebody is about to draw a
// conclusion about rural decline.
//
// So: STOCKS ROLL UP BY SUMMING, RATES ARE RECOMPUTED FROM THE ROLLED-UP
// STOCKS. `measure()` below never sees a rate it did not derive itself. The
// same function serves county, state, superstate and nation, which is the whole
// reason the superstates can be redrawn interactively: changing the partition
// changes one lookup, and every number follows.
//
// The one honest exception is a measure a publisher gives you as a rate with no
// numerator and denominator to rebuild it from — a median, a survey rate. Those
// are marked `noRollup` and the parent level shows nothing rather than a number
// somebody might quote. A median of medians is not a median.

/* global globalThis */
(function (root) {
  'use strict';

  /**
   * A level of geography over the same set of leaf units.
   *   id      'county' | 'state' | 'region' | 'nation' | anything
   *   label   display name
   *   of      (leafId) => parentId | null   — null drops the leaf from this level
   *   name    (parentId) => string
   */
  function level(spec) {
    return {
      id: spec.id, label: spec.label, of: spec.of,
      name: spec.name || ((k) => k), order: spec.order == null ? 0 : spec.order,
    };
  }

  class Hierarchy {
    /** @param {object} data { ids: string[], series: { 'stock:year': (number|null)[] } } */
    constructor(data, opts) {
      const o = opts || {};
      this.data = data;
      this.index = Object.create(null);
      data.ids.forEach((id, i) => { this.index[id] = i; });
      this.levels = new Map();
      this.noRollup = o.noRollup instanceof Set ? o.noRollup : new Set(o.noRollup || []);
      this._cache = new Map();
      for (const l of (o.levels || [])) this.addLevel(l);
    }

    addLevel(l) { this.levels.set(l.id, l); this._cache.clear(); return this; }

    /** Replace one level's mapping. This is how a redrawn superstate map lands. */
    setLevel(id, of, name) {
      const l = this.levels.get(id);
      if (l) { l.of = of; if (name) l.name = name; }
      for (const k of [...this._cache.keys()]) if (k.indexOf(id + ' ') === 0) this._cache.delete(k);
      return this;
    }

    /** Leaf indices grouped by their parent at `levelId`. */
    groups(levelId) {
      const key = levelId + ' groups';
      if (this._cache.has(key)) return this._cache.get(key);
      const l = this.levels.get(levelId);
      if (!l) throw new Error('hier: no level "' + levelId + '"');
      const g = new Map();
      for (let i = 0; i < this.data.ids.length; i++) {
        const p = l.of(this.data.ids[i], i);
        if (p == null) continue;
        let a = g.get(p);
        if (!a) g.set(p, a = []);
        a.push(i);
      }
      this._cache.set(key, g);
      return g;
    }

    /**
     * Sum a stock over each group at `levelId`.
     * A group is null only if EVERY child is null; a partially suppressed group
     * returns the sum of what is known, and `coverage()` says how much that is,
     * because "1,900 of 2,000 counties" is a usable number and a silent null is
     * not.
     */
    rollup(stockKey, levelId) {
      const key = levelId + ' ' + stockKey;
      if (this._cache.has(key)) return this._cache.get(key);
      const col = this.data.series[stockKey];
      const out = new Map();
      if (!col) { this._cache.set(key, out); return out; }
      for (const [p, idxs] of this.groups(levelId)) {
        let s = 0, n = 0;
        for (const i of idxs) { const v = col[i]; if (v != null) { s += v; n++; } }
        out.set(p, n ? s : null);
      }
      this._cache.set(key, out);
      return out;
    }

    /** How many of each group's children reported a stock. */
    coverage(stockKey, levelId) {
      const col = this.data.series[stockKey];
      const out = new Map();
      for (const [p, idxs] of this.groups(levelId)) {
        let n = 0;
        for (const i of idxs) if (col && col[i] != null) n++;
        out.set(p, { have: n, of: idxs.length });
      }
      return out;
    }

    /** Whole-set total of a stock — the denominator for "relative to national". */
    total(stockKey) {
      const col = this.data.series[stockKey];
      if (!col) return null;
      let s = 0, n = 0;
      for (const v of col) if (v != null) { s += v; n++; }
      return n ? s : null;
    }

    /**
     * Evaluate a measure at a level.
     * @param {object} m        a measure from atlas/lib/measures.js
     * @param {string} levelId  'leaf' for the raw units
     * @param {number|object} year  a year, or a per-stock map of years plus a
     *   `_` default. Stocks do not all share a vintage — BEA publishes income
     *   through 2024 and employment through 2022 — and pinning every stock to
     *   the oldest common year would throw away two years of the best data on
     *   the map. Naming the vintage per stock keeps the footnote honest instead.
     * @returns {{ ids: string[], values: (number|null)[], refused?: string }}
     */
    measure(m, levelId, year) {
      const S = (typeof year === 'object' && year !== null)
        ? (k) => k + ':' + (year[k] != null ? year[k] : year._)
        : (k) => k + ':' + year;
      const isLeaf = levelId === 'leaf' || levelId == null;

      // A publisher-supplied rate with nothing to rebuild it from: honest at
      // the leaf, refused above it.
      if (m.stock && this.noRollup.has(m.stock)) {
        if (!isLeaf) return { ids: [...this.groups(levelId).keys()], values: [], refused: 'no-rollup' };
        return { ids: this.data.ids, values: this.data.series[S(m.stock)] || [] };
      }

      const ids = isLeaf ? this.data.ids : [...this.groups(levelId).keys()];
      const get = isLeaf
        ? (k) => this.data.series[S(k)] || null
        : (k) => this.rollup(S(k), levelId);
      const at = isLeaf
        ? (col, i) => (col ? col[i] : null)
        : (map, i) => (map ? map.get(ids[i]) : null);
      const norm = (v) => (v == null || !Number.isFinite(v) ? null : v);

      // ratio of two ratios: the income of arrivals against the income of leavers
      if (m.ratioOfRatios) {
        const A = get(m.ratioOfRatios[0][0]), B = get(m.ratioOfRatios[0][1]);
        const C = get(m.ratioOfRatios[1][0]), D = get(m.ratioOfRatios[1][1]);
        return {
          ids,
          values: ids.map((_, i) => {
            const a = at(A, i), b = at(B, i), c = at(C, i), d = at(D, i);
            if (a == null || b == null || c == null || d == null || !b || !d || !c) return null;
            return norm((a / b) / (c / d));
          }),
        };
      }

      if (m.stock) {
        const col = get(m.stock);
        return { ids, values: ids.map((_, i) => norm(at(col, i))) };
      }

      const N = get(m.num), Dn = get(m.den);
      const Plus = m.plus ? get(m.plus) : null;
      const Minus = m.minus ? get(m.minus) : null;
      const k = m.k || 1;

      // "Relative to the national average" uses the WHOLE-SET total, not the
      // mean of the level's own values, so the reference is the same number
      // whether you are looking at counties or at thirteen superstates.
      let ref = 1;
      if (m.relativeToTotal) {
        const tn = this.total(S(m.num)), td = this.total(S(m.den));
        ref = (tn != null && td) ? (tn / td) * k : 0;
      }

      const values = ids.map((_, i) => {
        let n = at(N, i);
        const d = at(Dn, i);
        if (n == null || d == null || !d) return null;
        if (Plus) { const p = at(Plus, i); if (p == null) return null; n += p; }
        if (Minus) { const p = at(Minus, i); if (p == null) return null; n -= p; }
        const v = (n / d) * k;
        return norm(m.relativeToTotal ? (ref ? v / ref : null) : v);
      });
      return { ids, values };
    }
  }

  const API = { Hierarchy, level };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  root.ATLAS_HIER = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
