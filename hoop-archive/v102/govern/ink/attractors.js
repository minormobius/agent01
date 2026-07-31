// attractors.js — the weird math behind the ink.
//
// Each family is a 2D chaotic map x_{n+1} = f(x_n, y_n). Iterated for ~tens of
// thousands of steps it traces a strange attractor: a wispy, self-similar point
// cloud whose shape depends entirely on a handful of parameters. We accumulate
// those points into a density grid (engine.js), blur + threshold it into solid
// ink, and fold the whole thing across a vertical axis. Different family +
// params -> a genuinely different blot, deterministically, from the seed.
//
// make(rng) returns { step(x,y)->[x,y], p:{...params}, x0, y0 }.
(function (g) {
  const families = {
    clifford: {
      label: "Clifford",
      make(r) {
        const a = r.range(-2, 2), b = r.range(-2, 2),
              c = r.range(-2, 2), d = r.range(-2, 2);
        return {
          p: { a, b, c, d }, x0: 0.1, y0: 0.1,
          step(x, y) {
            return [Math.sin(a * y) + c * Math.cos(a * x),
                    Math.sin(b * x) + d * Math.cos(b * y)];
          },
        };
      },
    },

    dejong: {
      label: "De Jong",
      make(r) {
        const a = r.range(-3, 3), b = r.range(-3, 3),
              c = r.range(-3, 3), d = r.range(-3, 3);
        return {
          p: { a, b, c, d }, x0: 0.1, y0: 0.1,
          step(x, y) {
            return [Math.sin(a * y) - Math.cos(b * x),
                    Math.sin(c * x) - Math.cos(d * y)];
          },
        };
      },
    },

    svensson: {
      label: "Svensson",
      make(r) {
        const a = r.range(-3, 3), b = r.range(-3, 3),
              c = r.range(-3, 3), d = r.range(-3, 3);
        return {
          p: { a, b, c, d }, x0: 0.1, y0: 0.1,
          step(x, y) {
            return [d * Math.sin(a * x) - Math.sin(b * y),
                    c * Math.cos(a * x) + Math.cos(b * y)];
          },
        };
      },
    },

    // Gumowski–Mira: the most biological of the bunch — corals, jellyfish, beetles.
    gumowski: {
      label: "Gumowski–Mira",
      make(r) {
        const a = r.range(-0.9, 0.9), b = r.range(0.5, 1.0);
        const gx = (x) => a * x + (2 * (1 - a) * x * x) / (1 + x * x);
        return {
          p: { a, b }, x0: r.range(-1, 1), y0: r.range(-1, 1),
          step(x, y) {
            const xn = b * y + gx(x);
            const yn = -x + gx(xn);
            return [xn, yn];
          },
        };
      },
    },

    // Hopalong (Barry Martin): sprawling, sparse, spidery sprays.
    hopalong: {
      label: "Hopalong",
      make(r) {
        const a = r.range(0, 8), b = r.range(0.5, 4), c = r.range(0.5, 4);
        return {
          p: { a, b, c }, x0: 0, y0: 0,
          step(x, y) {
            const xn = y - Math.sign(x) * Math.sqrt(Math.abs(b * x - c));
            const yn = a - x;
            return [xn, yn];
          },
        };
      },
    },
  };

  g.INKATTRACTORS = {
    families,
    keys: Object.keys(families),
    label: (k) => (families[k] ? families[k].label : k),
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
