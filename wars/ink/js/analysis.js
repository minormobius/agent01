// analysis.js — the report after a run of blots.
//
// Each archetype axis is a known blend of raw attributes (judge.js). The player
// only ever moved four perceptual dots, but because we know each blot's full raw
// attribute vector, we can drill the systematic delta DOWN to the attribute that
// drives it: correlate the player's per-blot delta on an axis against each raw
// trait that feeds that axis. That separates two kinds of "error":
//
//   • a TRAIT-CORRELATED lean  ("you read warmth wherever there's colour")
//       -> a specific interpretive lens — but it could equally mean our model
//          under-weights that trait. We say so.
//   • a FLAT OFFSET            ("you just run warm, whatever the ink does")
//       -> ambiguous between your baseline and our axis being mis-zeroed.
//
// report(run) -> { n, title, headline, signature[], metaNote, reveal }
// run = [ { seed, raw:{trait:0..1...}, deltas:[{key,you,ink,d}...] } ]
(function (g) {
  // short noun phrases that read naturally after "the more ___"
  const TRAIT_LABEL = {
    coverage: "ink",
    unity: "wholeness",
    centrality: "centring",
    filigree: "lacy edges",
    density: "density",
    balance: "top-heaviness",
    reach: "spread",
    pigment: "colour",
    stature: "height",
  };

  // perceptual label + direction words per archetype axis, from the quiz pads
  function perceptual() {
    const map = {};
    for (const pad of g.INKQUIZ.PADS) {
      for (const ax of [pad.x, pad.y]) {
        map[ax.key] = { label: ax.lo + "–" + ax.hi, hiWord: ax.hiWord, loWord: ax.loWord };
      }
    }
    return map;
  }

  const avg = (a) => a.reduce((s, x) => s + x, 0) / a.length;
  function std(a, m) { m = m == null ? avg(a) : m; return Math.sqrt(avg(a.map((x) => (x - m) * (x - m)))); }
  function corr(xs, ys) {
    const n = xs.length; if (n < 3) return 0;
    const mx = avg(xs), my = avg(ys);
    let sxy = 0, sx = 0, sy = 0;
    for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
    if (sx < 1e-9 || sy < 1e-9) return 0;
    return sxy / Math.sqrt(sx * sy);
  }

  function report(run) {
    const PERC = perceptual();
    const n = run.length;
    const sig = [];

    for (const ax of g.INKJUDGE.AXES) {
      const key = ax.key;
      const ds = run.map((r) => (r.deltas.find((d) => d.key === key) || { d: 0 }).d);
      const mean = avg(ds), sd = std(ds, mean);
      const p = PERC[key] || { label: ax.title, hiWord: "higher", loWord: "lower" };
      const leanWord = mean >= 0 ? p.hiWord : p.loWord;

      // attribute drill-down: which contributing raw trait best explains the delta?
      const traitKeys = Object.keys(ax.w).map((k) => (k[0] === "!" ? k.slice(1) : k));
      let best = { trait: null, r: 0 };
      for (const tk of traitKeys) {
        const xs = run.map((r) => r.raw[tk]);
        const r = corr(xs, ds);
        if (Math.abs(r) > Math.abs(best.r)) best = { trait: tk, r };
      }

      const biasNotable = Math.abs(mean) > 0.1;
      const driverStrong = Math.abs(best.r) > 0.5;
      let tag;
      if (biasNotable && driverStrong) tag = "lens";
      else if (biasNotable) tag = "offset";
      else if (driverStrong) tag = "conditional";
      else tag = "aligned";

      const dl = TRAIT_LABEL[best.trait] || best.trait;
      // for a swing (no overall lean) name the direction; for a lean, name where
      // it's strongest (avoids ceiling-clamp giving a contradictory direction).
      const swingWord = best.r >= 0 ? p.hiWord : p.loWord;
      const swingPhrase = "the more " + dl + ", the " + swingWord + " you read it";
      const leanMod = "strongest where there's " + (best.r >= 0 ? "most " : "least ") + dl;

      let line;
      if (tag === "lens") line = "You ran " + leanWord + " — " + leanMod + ".";
      else if (tag === "offset") line = "You sit " + leanWord + " across the board — a flat lean, whatever the ink does.";
      else if (tag === "conditional") line = "On balance you matched the ink, but your read swings — " + swingPhrase + ".";
      else line = "You read the ink almost exactly — little projection here.";

      sig.push({
        key, perceptual: p.label, mean, sd, tag, line, leanWord, swingPhrase,
        driver: best.trait, driverCorr: best.r,
        salience: Math.abs(mean) + 0.4 * Math.abs(best.r),
        pole: (mean >= 0 ? ax.hi.name : ax.lo.name).replace(/^The /, ""),
      });
    }

    sig.sort((a, b) => b.salience - a.salience);

    // --- digestible rollup: directional bias (lens/offset) leads the headline;
    //     a pure trait-swing (conditional) is a different, second-class story. ---
    const biased = sig.filter((s) => s.tag === "lens" || s.tag === "offset")
      .sort((a, b) => Math.abs(b.mean) - Math.abs(a.mean));
    const swings = sig.filter((s) => s.tag === "conditional")
      .sort((a, b) => Math.abs(b.driverCorr) - Math.abs(a.driverCorr));

    let title, headline;
    if (biased.length) {
      title = "The " + biased[0].pole + " Eye";
      const words = biased.slice(0, 2).map((s) => s.leanWord);
      const both = words.length > 1 ? words[0] + " and " + words[1] : words[0];
      headline = "Across " + n + " blots you consistently saw them " + both +
        " than they are — steady enough to read as habit, not chance.";
    } else if (swings.length) {
      title = "The Swinging Eye";
      headline = "Across " + n + " blots your aim was true on average — but your eye swings: " +
        swings[0].swingPhrase + ".";
    } else {
      title = "The Even Eye";
      headline = "Across " + n + " blots you read the ink remarkably straight — little systematic projection. Rare, and a little eerie.";
    }

    const metaNote =
      "Two kinds of error muddy this mirror. Our attribute-ruler is crude: where a lean " +
      "keys on one feature (a <b>lens</b>), it may mean our model under-weights that " +
      "feature as much as it means your eye favours it. A <b>flat lean</b> could be your " +
      "baseline — or our axis simply zeroed wrong. Ten blots can't fully tell the ruler's " +
      "faults from yours; the trait-specific lenses are the most trustworthy “you”.";

    const reveal =
      "And the honest part: the ink has no temperature, no kin, no ambition. Every degree " +
      "of warmth, every thread of connection, every reach you read in — you brought. That's " +
      "the trick and the point: an inkblot measures nothing and reflects everything. " +
      "A mirror, not a measurement.";

    return { n, title, headline, signature: sig, metaNote, reveal };
  }

  g.INKANALYSIS = { report };
})(typeof globalThis !== "undefined" ? globalThis : this);
