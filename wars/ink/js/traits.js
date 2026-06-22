// traits.js — strip an objective trait vector off a finished blot.
//
// These are deterministic, image-derived measurements (no interpretation here).
// Each trait is a bipolar 0..1 value plus a human label, a display string, and
// the research axis it will feed in the interpretation layer (see docs.html §4).
// Keeping this separable is the whole point: the blot is the stimulus, the trait
// vector is what the future "place a dot on two axes" quiz reasons over.
(function (g) {
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);

  function extract(f) {
    const { HALF, H, Atot, Acol, pigmentCount } = f;
    const tMask = f.mask || 0.18;

    // --- half-plane scalars ---
    let area = 0, sumY = 0, minY = H, maxY = 0, maxGx = 0;
    let centralArea = 0;                       // ink within the central band (near fold)
    let sumAtot = 0, sumAcol = 0;
    const centreBand = HALF * 0.22;
    for (let y = 0; y < H; y++) {
      for (let gx = 0; gx < HALF; gx++) {
        const i = y * HALF + gx;
        sumAtot += Atot[i]; sumAcol += Acol[i];
        if (Atot[i] >= tMask) {
          area++; sumY += y;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          if (gx > maxGx) maxGx = gx;
          if (gx < centreBand) centralArea++;
        }
      }
    }
    if (area === 0) area = 1; // guard

    const coverage = area / (HALF * H);
    const centroidY = sumY / area / H;                 // 0 top .. 1 bottom
    const centralShare = centralArea / area;           // how fold-hugging
    const reach = maxGx / HALF;                         // horizontal spread from fold
    const bboxH = maxY - minY + 1, bboxW = maxGx + 1;
    const bboxFill = area / (bboxW * bboxH);            // solidity proxy (0 airy .. 1 dense)
    const aspect = bboxH / (bboxW * 2);                 // full-blot height / width
    const chromatic = sumAtot > 0 ? sumAcol / sumAtot : 0;

    // --- full-image topology: connected masses + perimeter ---
    const W = HALF * 2;
    const full = new Uint8Array(W * H);
    let inkFull = 0;
    for (let y = 0; y < H; y++) {
      for (let gx = 0; gx < HALF; gx++) {
        if (Atot[y * HALF + gx] >= tMask) {
          full[y * W + (HALF + gx)] = 1;
          full[y * W + (HALF - 1 - gx)] = 1;
          inkFull += 2;
        }
      }
    }
    const { components, largest } = gestaltComponents(full, W, H);
    const largestShare = inkFull > 0 ? largest / inkFull : 1;

    let perim = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!full[y * W + x]) continue;
        if (x === 0 || y === 0 || x === W - 1 || y === H - 1 ||
            !full[y * W + x - 1] || !full[y * W + x + 1] ||
            !full[(y - 1) * W + x] || !full[(y + 1) * W + x]) perim++;
      }
    }
    const edgeC = inkFull > 0 ? perim / Math.sqrt(inkFull) : 0; // ~3.5 round .. 30 lacy

    // --- assemble bipolar traits (value: 0 = low pole, 1 = high pole) ---
    const pct = (v) => Math.round(v * 100) + "%";
    const traits = [
      {
        key: "coverage", label: "Coverage", low: "Sparse", high: "Lavish",
        value: clamp(coverage / 0.28, 0, 1), axis: "Constricted ⟷ Rich",
        display: pct(coverage) + " inked",
      },
      {
        key: "unity", label: "Unity", low: "Scattered", high: "Unified",
        value: clamp(1 - (components - 1) / 7, 0, 1), axis: "Whole ⟷ Detail",
        display: components + " mass" + (components === 1 ? "" : "es"),
      },
      {
        key: "centrality", label: "Centrality", low: "Peripheral", high: "Fold-bound",
        value: clamp(centralShare / 0.5, 0, 1), axis: "Centered ⟷ Peripheral",
        display: pct(centralShare) + " at the fold",
      },
      {
        key: "filigree", label: "Filigree", low: "Smooth", high: "Filigreed",
        value: clamp((edgeC - 6) / 48, 0, 1), axis: "Form ⟷ Feeling",
        display: "edge " + edgeC.toFixed(1),
      },
      {
        key: "density", label: "Density", low: "Airy", high: "Dense",
        value: clamp(bboxFill, 0, 1), axis: "Airy ⟷ Solid",
        display: pct(bboxFill) + " filled",
      },
      {
        key: "balance", label: "Balance", low: "Rising", high: "Grounded",
        value: clamp(centroidY, 0, 1), axis: "Rising ⟷ Grounded",
        display: centroidY < 0.45 ? "top-weighted" : centroidY > 0.55 ? "bottom-weighted" : "even",
      },
      {
        key: "reach", label: "Reach", low: "Contained", high: "Sprawling",
        value: clamp(reach, 0, 1), axis: "Contained ⟷ Sprawling",
        display: pct(reach) + " of half-span",
      },
      {
        key: "pigment", label: "Pigment", low: "Pure ink", high: "Pigmented",
        value: clamp(chromatic / 0.6, 0, 1), axis: "Ink ⟷ Colour",
        display: chromatic < 0.02 ? "pure ink" : pct(chromatic) + " colour · " + pigmentCount + "px",
      },
      {
        key: "stature", label: "Stature", low: "Spreading", high: "Towering",
        value: clamp((aspect - 0.18) / 0.85, 0, 1), axis: "Wide ⟷ Tall",
        display: aspect > 1.15 ? "towering" : aspect < 0.85 ? "spreading" : "square",
      },
    ];

    return {
      traits,
      raw: {
        coverage, components, largestShare, centralShare, reach,
        bboxFill, aspect, chromatic, edgeC, centroidY, pigmentCount,
      },
    };
  }

  // Count gestalt masses: OR-pool the mask down (4×4) so thin strokes a human
  // reads as one form merge, instead of shattering into dozens of line fragments.
  // `largest` is rescaled back to full-pixel units.
  function gestaltComponents(full, W, H) {
    const DS = 8, dw = Math.ceil(W / DS), dh = Math.ceil(H / DS);
    const small = new Uint8Array(dw * dh);
    for (let y = 0; y < H; y++) {
      const row = y * W, drow = ((y / DS) | 0) * dw;
      for (let x = 0; x < W; x++) if (full[row + x]) small[drow + ((x / DS) | 0)] = 1;
    }
    const c = countComponents(small, dw, dh);
    return { components: c.components, largest: c.largest * DS * DS };
  }

  // 8-connected component labelling with an explicit stack (no recursion).
  function countComponents(mask, W, H) {
    const seen = new Uint8Array(W * H);
    const stack = new Int32Array(W * H);
    let components = 0, largest = 0;
    for (let s = 0; s < W * H; s++) {
      if (!mask[s] || seen[s]) continue;
      components++;
      let sp = 0, size = 0;
      stack[sp++] = s; seen[s] = 1;
      while (sp > 0) {
        const p = stack[--sp]; size++;
        const x = p % W, y = (p / W) | 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy; if (ny < 0 || ny >= H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx; if (nx < 0 || nx >= W) continue;
            const q = ny * W + nx;
            if (mask[q] && !seen[q]) { seen[q] = 1; stack[sp++] = q; }
          }
        }
      }
      if (size > largest) largest = size;
    }
    return { components: Math.max(1, components), largest };
  }

  g.INKTRAITS = { extract };
})(typeof globalThis !== "undefined" ? globalThis : this);
