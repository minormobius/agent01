// engine.js — turn a seed into a blot.
//
//   seed -> pick attractor family + params (per pigment layer)
//        -> iterate the map, splat points into a half-width density grid
//        -> blur + normalize each layer
//        -> composite layers (coloured under, dark ink on top)
//        -> mirror the half across the vertical axis  (the "fold")
//        -> paint onto a white-bg offscreen canvas (ink darkens paper via
//           multiply at draw time) + a few spatter droplets + a faint crease
//        -> extract an objective trait vector (traits.js)
//
// Deterministic: everything draws from the seeded rng. Attaches to globalThis so
// the trait math is unit-testable in plain node (canvas steps are guarded).
(function (g) {
  const { makeRng } = g.INKPRNG;
  const ATT = g.INKATTRACTORS;

  // ---- ink palettes (parchment-friendly) ----
  const DARKS = ["#241a12", "#2b2018", "#1d1813", "#322414"];
  const PIGMENTS = [
    "#7c2b22", // oxblood
    "#9c3b1b", // vermilion
    "#27406b", // indigo
    "#2b2f43", // iron-gall
    "#2f6157", // verdigris
    "#6b4a1f", // raw umber
    "#5d2a52", // tyrian
  ];

  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ss = (a, b, x) => {
    x = clamp((x - a) / (b - a), 0, 1);
    return x * x * (3 - 2 * x);
  };
  function hexRGB(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  // ---- one pigment layer: iterate attractor -> normalized blurred density ----
  // Returns { grid:Float32(HALF*H in 0..1), family, p } or null if degenerate.
  // `place` = {tx,ty,tw,th} target rect in the half-plane; shared across a blot's
  // layers so they co-locate, and varied per blot so position/extent traits move.
  function layerField(rng, HALF, H, N, BURN, place) {
    const famKey = rng.pick(ATT.keys);
    const a = ATT.families[famKey].make(rng);
    let x = a.x0, y = a.y0;
    for (let i = 0; i < BURN; i++) {
      const n = a.step(x, y); x = n[0]; y = n[1];
      if (!isFinite(x) || !isFinite(y)) return null;
    }
    const xs = new Float32Array(N), ys = new Float32Array(N);
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (let i = 0; i < N; i++) {
      const n = a.step(x, y); x = n[0]; y = n[1];
      if (!isFinite(x) || !isFinite(y) || Math.abs(x) > 1e9 || Math.abs(y) > 1e9) return null;
      xs[i] = x; ys[i] = y;
      if (x < minx) minx = x; if (x > maxx) maxx = x;
      if (y < miny) miny = y; if (y > maxy) maxy = y;
    }
    const rx = maxx - minx, ry = maxy - miny;
    if (!(rx > 1e-3) || !(ry > 1e-3)) return null; // collapsed to a point/line

    // fit attractor bbox into the target rect, preserving aspect; left-anchored so
    // ink reaches toward the fold when the rect hugs it (tx≈0 -> bridged blot;
    // tx>0 -> the halves detach into side masses). Vertically centred in the rect.
    const { tx, ty, tw, th } = place;
    const scale = Math.min(tw / rx, th / ry);
    const offX = tx;
    const offY = ty + (th - ry * scale) / 2;

    const grid = new Float32Array(HALF * H);
    for (let i = 0; i < N; i++) {
      const fx = offX + (xs[i] - minx) * scale;
      const fy = offY + (ys[i] - miny) * scale;
      const x0 = fx | 0, y0 = fy | 0;
      if (x0 < 0 || y0 < 0 || x0 >= HALF - 1 || y0 >= H - 1) continue;
      const dx = fx - x0, dy = fy - y0, o = y0 * HALF + x0;
      grid[o] += (1 - dx) * (1 - dy);
      grid[o + 1] += dx * (1 - dy);
      grid[o + HALF] += (1 - dx) * dy;
      grid[o + HALF + 1] += dx * dy;
    }

    boxBlur(grid, HALF, H, 3, 2);

    // log-compress + normalize to 0..1, lift midtones a touch.
    let max = 0;
    for (let i = 0; i < grid.length; i++) {
      grid[i] = Math.log(1 + grid[i]);
      if (grid[i] > max) max = grid[i];
    }
    if (max <= 0) return null;
    const inv = 1 / max;
    for (let i = 0; i < grid.length; i++) grid[i] = Math.pow(grid[i] * inv, 0.82);

    return { grid, family: ATT.label(famKey), famKey, p: a.p };
  }

  // separable box blur (≈gaussian over a few passes)
  function boxBlur(grid, W, H, r, passes) {
    const tmp = new Float32Array(grid.length);
    const win = 2 * r + 1;
    for (let pass = 0; pass < passes; pass++) {
      // horizontal
      for (let y = 0; y < H; y++) {
        let acc = 0; const row = y * W;
        for (let x = -r; x <= r; x++) acc += grid[row + clamp(x, 0, W - 1)];
        for (let x = 0; x < W; x++) {
          tmp[row + x] = acc / win;
          const add = grid[row + clamp(x + r + 1, 0, W - 1)];
          const sub = grid[row + clamp(x - r, 0, W - 1)];
          acc += add - sub;
        }
      }
      // vertical
      for (let x = 0; x < W; x++) {
        let acc = 0;
        for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, H - 1) * W + x];
        for (let y = 0; y < H; y++) {
          grid[y * W + x] = acc / win;
          const add = tmp[clamp(y + r + 1, 0, H - 1) * W + x];
          const sub = tmp[clamp(y - r, 0, H - 1) * W + x];
          acc += add - sub;
        }
      }
    }
  }

  // ---- assemble a full blot from the seed ----
  function generate(seedStr, opts) {
    opts = opts || {};
    const RES = opts.RES || 600;          // full square resolution
    const HALF = RES / 2 | 0;
    const H = RES;
    const N = opts.points || 70000;
    const BURN = 800;
    const rng = makeRng(seedStr);
    const t0 = (g.performance && performance.now()) || 0;

    // decide pigment structure up front (stable from seed)
    const coloured = rng.chance(0.5);
    const nPig = coloured ? (rng.chance(0.3) ? 2 : 1) : 0;
    const darkColor = rng.pick(DARKS);
    const pigColors = [];
    const used = new Set();
    while (pigColors.length < nPig) {
      const c = rng.pick(PIGMENTS);
      if (!used.has(c)) { used.add(c); pigColors.push(c); }
    }

    // build layers, retrying degenerate attractors; retry whole blot if the ink
    // coverage is implausible. All retries consume the rng stream deterministically.
    let layers, Atot, Acol, meta, attempts = 0;
    do {
      attempts++;
      layers = [];

      // varied placement rect (deterministic per attempt) so position/extent
      // traits carry signal instead of saturating.
      const mV = 14;
      const tw = HALF * rng.range(0.5, 0.97);
      const th = H * rng.range(0.45, 0.94);
      const tx = (HALF - tw) * Math.pow(rng(), 2.4) * 0.42;   // usually fold-hugging (bridged); occasionally split
      const tyMax = Math.max(mV, H - mV - th);
      const ty = rng.range(mV, tyMax);
      const place = { tx, ty, tw, th };

      // coloured pigment layers first (rendered underneath)
      const layerSpecs = [];
      for (let i = 0; i < nPig; i++) layerSpecs.push({ role: "pigment", color: pigColors[i], t0: 0.05, t1: 0.5, op: 0.9 });
      layerSpecs.push({ role: "ink", color: darkColor, t0: 0.06, t1: 0.44, op: 1.0 });

      let ok = true;
      for (const spec of layerSpecs) {
        let field = null, tries = 0;
        while (!field && tries++ < 14) field = layerField(rng, HALF, H, N, BURN, place);
        if (!field) { ok = false; break; }
        spec.field = field;
        spec.rgb = hexRGB(spec.color);
        layers.push(spec);
      }
      if (!ok) continue;

      // composite (right half): coloured layers, then dark on top.
      Atot = new Float32Array(HALF * H);
      Acol = new Float32Array(HALF * H);
      for (let i = 0; i < HALF * H; i++) {
        let ar = 0, ag = 0, ab = 0, aa = 0;       // premultiplied accumulate (all)
        let car = 0, cag = 0, cab = 0, caa = 0;    // coloured-only
        for (const L of layers) {
          const a = ss(L.t0, L.t1, L.field.grid[i]) * L.op;
          if (a <= 0) continue;
          const k = a * (1 - aa);
          ar += L.rgb[0] * k; ag += L.rgb[1] * k; ab += L.rgb[2] * k; aa += k;
          if (L.role === "pigment") {
            const ck = a * (1 - caa);
            car += L.rgb[0] * ck; cag += L.rgb[1] * ck; cab += L.rgb[2] * ck; caa += ck;
          }
        }
        Atot[i] = aa; Acol[i] = caa;
        // stash composited colour back into the dark field's grid slot? no —
        // keep colour in a parallel buffer for painting:
        compR[i] = aa > 0 ? ar / aa : 0;
        compG[i] = aa > 0 ? ag / aa : 0;
        compB[i] = aa > 0 ? ab / aa : 0;
      }

      // coverage sanity
      let cov = 0;
      for (let i = 0; i < Atot.length; i++) if (Atot[i] >= 0.18) cov++;
      cov /= Atot.length;
      meta = { coverage: cov };
      if (cov >= 0.03 && cov <= 0.5) break;
    } while (attempts < 6);

    // ---- objective traits (separable; feeds the interpretation layer) ----
    const traits = g.INKTRAITS.extract({
      HALF, H, Atot, Acol, pigmentCount: nPig, mask: 0.18,
    });

    // ---- paint (browser only) ----
    let canvas = null;
    if (typeof document !== "undefined") {
      canvas = document.createElement("canvas");
      canvas.width = RES; canvas.height = RES;
      const ctx = canvas.getContext("2d");
      const img = ctx.createImageData(RES, RES);
      const d = img.data;
      for (let y = 0; y < H; y++) {
        for (let gx = 0; gx < HALF; gx++) {
          const i = y * HALF + gx;
          const A = Atot[i];
          // white background; ink lerps paper toward ink colour (multiply later)
          const r = 255 * (1 - A) + compR[i] * A;
          const gg = 255 * (1 - A) + compG[i] * A;
          const b = 255 * (1 - A) + compB[i] * A;
          const xr = HALF + gx, xl = HALF - 1 - gx;
          for (const X of [xr, xl]) {
            const o = (y * RES + X) * 4;
            d[o] = r; d[o + 1] = gg; d[o + 2] = b; d[o + 3] = 255;
          }
        }
      }
      ctx.putImageData(img, 0, 0);
      paintSpatter(ctx, rng, Atot, HALF, H, RES, darkColor);
      paintCrease(ctx, RES, H);
    }

    const ms = ((g.performance && performance.now()) || 0) - t0;
    return {
      canvas,
      traits,
      meta: {
        seed: String(seedStr),
        res: RES,
        coverage: meta.coverage,
        pigmentCount: nPig,
        inkColor: darkColor,
        pigments: pigColors,
        layers: layers.map((L) => ({ role: L.role, family: L.field.family, color: L.color, p: L.field.p })),
        ms: Math.round(ms),
      },
    };
  }

  // scratch colour buffers (reused; sized to the largest half seen)
  let compR = new Float32Array(0), compG = new Float32Array(0), compB = new Float32Array(0);
  function ensureScratch(n) {
    if (compR.length < n) { compR = new Float32Array(n); compG = new Float32Array(n); compB = new Float32Array(n); }
  }

  // a few ink droplets near the blot's edges — the spatter that sells "ink".
  function paintSpatter(ctx, rng, Atot, HALF, H, RES, darkHex) {
    const rgb = hexRGB(darkHex);
    const edges = [];
    for (let y = 4; y < H - 4; y += 2) {
      for (let gx = 1; gx < HALF - 2; gx += 2) {
        const i = y * HALF + gx;
        if (Atot[i] > 0.25 && Atot[i + 1] < 0.12) edges.push([gx, y]);
      }
    }
    if (!edges.length) return;
    const n = rng.int(4, 11);
    ctx.save();
    for (let k = 0; k < n; k++) {
      const e = edges[(rng() * edges.length) | 0];
      const off = rng.range(2, 16);
      const gx = e[0] + off, y = e[1] + rng.range(-6, 6);
      const rad = rng.range(1.2, 5.5);
      const alpha = rng.range(0.12, 0.5);
      for (const X of [HALF + gx, HALF - 1 - gx]) {
        const grd = ctx.createRadialGradient(X, y, 0, X, y, rad);
        grd.addColorStop(0, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha})`);
        grd.addColorStop(1, `rgba(${rgb[0]},${rgb[1]},${rgb[2]},0)`);
        ctx.fillStyle = grd;
        ctx.beginPath(); ctx.arc(X, y, rad, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();
  }

  // faint vertical crease where the paper was folded.
  function paintCrease(ctx, RES, H) {
    const cx = RES / 2;
    const grd = ctx.createLinearGradient(cx - 6, 0, cx + 6, 0);
    grd.addColorStop(0, "rgba(60,45,30,0)");
    grd.addColorStop(0.5, "rgba(60,45,30,0.05)");
    grd.addColorStop(1, "rgba(60,45,30,0)");
    ctx.fillStyle = grd;
    ctx.fillRect(cx - 6, 0, 12, H);
  }

  // wrap generate to ensure scratch buffers exist before compositing
  const _generate = generate;
  g.INKENGINE = {
    generate(seedStr, opts) {
      const RES = (opts && opts.RES) || 600;
      ensureScratch((RES / 2 | 0) * RES);
      return _generate(seedStr, opts);
    },
    DARKS, PIGMENTS,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
