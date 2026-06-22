// judge.js — the interpretation layer (hide the ball).
//
// Raw attributes are the ruler; we never show the ruler. Instead we blend 2–3
// raw traits into each of four ARCHETYPAL axes with evocative names, so the
// reading reads like character, not geometry. Each axis quietly maps to a real
// Rorschach dimension (see docs.html §4). Data-driven + tunable.
//
// scoreBlot(traitValues) -> { axisKey: 0..1 }   (0 = low pole, 1 = high pole)
// portrait(scores)       -> { title, blurb, axes:[...] }
//
// traitValues = { coverage, unity, centrality, filigree, density, balance,
//                 reach, pigment, stature } each 0..1 (the trait .value fields).
(function (g) {
  // weight keys reference a trait; a leading "!" means use (1 - value).
  const AXES = [
    {
      key: "temperament", title: "Temperament",
      lo: { name: "The Stoic", line: "cool, contained — reasons before it feels" },
      hi: { name: "The Ember", line: "warm, expressive — feels the world in colour" },
      w: { pigment: 0.40, filigree: 0.35, coverage: 0.25 },
      nods: "Erlebnistypus · form ⟷ colour",
    },
    {
      key: "scope", title: "Scope",
      lo: { name: "The Watchmaker", line: "precise, intricate — loves the small true thing" },
      hi: { name: "The Cartographer", line: "sweeping, integrative — sees the whole map" },
      w: { unity: 0.45, reach: 0.35, "!filigree": 0.20 },
      nods: "Whole (W) ⟷ Detail (Dd)",
    },
    {
      key: "gravity", title: "Gravity",
      lo: { name: "The Anchor", line: "rooted, steady — content to hold its ground" },
      hi: { name: "The Comet", line: "restless, reaching — pulled toward the horizon" },
      w: { "!balance": 0.45, stature: 0.35, reach: 0.20 },
      nods: "grounded ⟷ aspirational (W:M)",
    },
    {
      key: "bond", title: "Bond",
      lo: { name: "The Island", line: "self-contained, sovereign — whole on its own" },
      hi: { name: "The Weave", line: "connective, merging — a builder of bridges" },
      w: { centrality: 0.50, density: 0.30, unity: 0.20 },
      nods: "autonomy ⟷ connection (white-space S)",
    },
  ];

  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

  // Per-axis calibration so each archetype axis is centred (~0.5) with full
  // swing, instead of collapsing toward one pole. {mean, spread=k·σ} measured by
  // Monte-Carlo over 500 random blots (k≈2.2). Re-measure if the engine changes.
  const CALIB = {
    temperament: { mean: 0.443, spread: 0.512 },
    scope:       { mean: 0.706, spread: 0.298 },
    gravity:     { mean: 0.533, spread: 0.182 },
    bond:        { mean: 0.647, spread: 0.432 },
  };
  function calibrate(key, v) {
    const c = CALIB[key];
    return c ? clamp(0.5 + (v - c.mean) / c.spread) : v;
  }

  function axisValue(ax, tv) {
    let sum = 0, wsum = 0;
    for (const k in ax.w) {
      const w = ax.w[k];
      const inv = k[0] === "!";
      const v = tv[inv ? k.slice(1) : k];
      if (v == null) continue;
      sum += (inv ? 1 - v : v) * w;
      wsum += w;
    }
    return wsum ? clamp(sum / wsum) : 0.5;
  }

  function scoreBlot(tv) {
    const out = {};
    for (const ax of AXES) out[ax.key] = calibrate(ax.key, axisValue(ax, tv));
    return out;
  }

  // a per-axis reading + the combined portrait (two strongest leanings)
  function portrait(scores) {
    const axes = AXES.map((ax) => {
      const v = scores[ax.key];
      const pole = v >= 0.5 ? ax.hi : ax.lo;
      return {
        key: ax.key, title: ax.title, value: v,
        pole: pole.name, line: pole.line, nods: ax.nods,
        lo: ax.lo.name, hi: ax.hi.name,
        strength: Math.abs(v - 0.5) * 2, // 0 (balanced) .. 1 (extreme)
      };
    });
    const ranked = axes.slice().sort((a, b) => b.strength - a.strength);
    const a = ranked[0], b = ranked[1];
    // adjective from the secondary, noun from the primary -> "The Ember Cartographer"
    const title = `The ${secondName(b)} ${a.pole.replace(/^The /, "")}`;
    const blurb = `${cap(a.line)} — and ${b.line}.`;
    return { title, blurb, axes };
  }

  // use the secondary pole's distinctive word as an adjective
  function secondName(ax) { return ax.pole.replace(/^The /, ""); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  g.INKJUDGE = { AXES, scoreBlot, portrait };
})(typeof globalThis !== "undefined" ? globalThis : this);
