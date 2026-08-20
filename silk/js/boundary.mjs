// boundary.mjs — the boundary conditions.
//
// THE INPUT TO THE WHOLE SURFACE. A spider does not choose a web; it chooses a
// site, and the site chooses most of the web. Everything here is a fact about
// the world the agent wakes up in, not a parameter of the agent:
//
//   anchors    where silk can be made fast — twig tips, a window reveal, a
//              wire. The spider cannot add one and cannot move one.
//   gravity    sets the hub's rise, the spiral's up/down asymmetry, and how far
//              the whole sheet sags while it is still being built.
//   wind       decides whether the bridge line snags at all, and where.
//   obstacles  a leaf, a bud, a knot. Silk cannot cross one.
//   silk       the finite protein in the glands this evening.
//
// The agent's OWN properties (leg span, mesh preference, how long it will keep
// splitting a gap) live in weaver.mjs. Keeping the two files apart is the point
// of the exercise: swap the boundary and hold the agent fixed, and you should
// get a different web from the same animal.

export const WORLD = { w: 1000, h: 720 };

const P = (x, y) => ({ x, y });

export const PRESETS = {
  window: {
    label: 'window reveal',
    blurb: 'Four square corners, generous span. The textbook garden orb — and the case where the family is tightest, because nothing about the boundary breaks the symmetry except gravity.',
    anchors: [P(95, 70), P(905, 70), P(905, 650), P(95, 650)],
    gravity: 0.20, wind: 0.5, silk: 62000, obstacles: [],
  },
  fork: {
    label: 'twig fork',
    blurb: 'Three anchors in a narrow V. The frame is a triangle, so the rim distance a spider must cover per radius varies hugely with direction — radii bunch where the frame is close and stretch where it is far.',
    anchors: [P(230, 80), P(795, 120), P(520, 665)],
    gravity: 0.22, wind: 0.6, silk: 20000, obstacles: [],
  },
  bramble: {
    label: 'bramble tangle',
    blurb: 'Six irregular anchors. The hull throws two of them away — the frame a spider can actually walk is convex, so an anchor inside the hull is silk it will never use.',
    anchors: [P(120, 130), P(430, 60), P(880, 150), P(930, 470), P(600, 680), P(180, 560), P(500, 300), P(700, 420)],
    gravity: 0.20, wind: 0.5, silk: 40000, obstacles: [],
  },
  broken: {
    label: 'a broken anchor',
    blurb: 'The same reveal with the top-right corner gone. The bridge can only snag one way now, the hub slides left, and every radius on the open side has to run further — one missing twig, and the whole family shifts.',
    anchors: [P(95, 70), P(560, 95), P(910, 430), P(880, 650), P(95, 650)],
    gravity: 0.20, wind: 0.5, silk: 45000, obstacles: [],
  },
  leaf: {
    label: 'a leaf in the way',
    blurb: 'Silk cannot cross the disc. Radii that would run through it are abandoned mid-lay, and the capture spiral bridges the gap — producing the free sector you see in real webs built around an obstruction.',
    anchors: [P(95, 70), P(905, 70), P(905, 650), P(95, 650)],
    gravity: 0.20, wind: 0.5, silk: 50000,
    obstacles: [{ x: 792, y: 208, r: 74 }],
  },
  gale: {
    label: 'thin silk, high wind',
    blurb: 'Half the protein and a gusty site. The frame and radii are non-negotiable, so the shortfall lands entirely on the capture spiral: the agent runs out mid-inward and stops. An unfinished web is still a correct web.',
    anchors: [P(95, 70), P(905, 70), P(905, 650), P(95, 650)],
    gravity: 0.20, wind: 0.9, silk: 28000, obstacles: [],
  },
  weightless: {
    label: 'no gravity (control)',
    blurb: 'Not a habitat — a control. Remove gravity and the hub sits at the centroid, the spiral spacing is the same above and below, and the asymmetries in every other preset are shown to be gravity\'s doing and not the algorithm\'s.',
    anchors: [P(95, 70), P(905, 70), P(905, 650), P(95, 650)],
    gravity: 0.0, wind: 0.5, silk: 62000, obstacles: [],
  },
};

export function boundary(name, overrides = {}) {
  const p = PRESETS[name] || PRESETS.window;
  return {
    name,
    label: p.label,
    blurb: p.blurb,
    anchors: p.anchors.map((a) => ({ ...a })),
    gravity: p.gravity,
    wind: p.wind,
    silk: p.silk,
    obstacles: p.obstacles.map((o) => ({ ...o })),
    ...overrides,
  };
}

export const blocked = (x, y, obstacles) =>
  obstacles.some((o) => Math.hypot(x - o.x, y - o.y) < o.r);

// Does the segment a→b pass through any obstacle? Point-to-segment distance.
export function segmentBlocked(ax, ay, bx, by, obstacles) {
  for (const o of obstacles) {
    const dx = bx - ax;
    const dy = by - ay;
    const L2 = dx * dx + dy * dy;
    let t = L2 > 0 ? ((o.x - ax) * dx + (o.y - ay) * dy) / L2 : 0;
    t = Math.min(1, Math.max(0, t));
    if (Math.hypot(ax + dx * t - o.x, ay + dy * t - o.y) < o.r) return true;
  }
  return false;
}
