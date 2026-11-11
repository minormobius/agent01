/* CAD⁴'s part library: feature trees, plain JSON. Each is { params, parts, show } plus what the page needs to present
   it (title, note, ranges for the sliders, check: pairs of parts whose overlap should be nothing). */
const circle = (r) => ({ op: "shell", t: 0, of: { op: "disc", r } }), point2 = { op: "ball", dim: 2, r: 0 };
/* a loop of wire in 4D: a circle in the plane of the first two axes, at the origin of the other two, thickened */
const loop = (R, r) => ({ op: "round", r, of: { op: "product", of: [circle(R), point2] } });

export const PARTS = {
  ball: { title: "ball", note: "Everything within r of a point. Every slice is a ball; move the slice in w and it shrinks to nothing at w = r.",
    params: { r: 1 }, show: { op: "ball", dim: 4, r: "r" } },
  tesseract: { title: "tesseract", note: "A square, extruded twice. Eight cubes for a boundary. Tilt the slice into w and the cube becomes prisms and, corner-on, an octahedron.",
    params: { a: 1.6 }, show: { op: "box", size: ["a", "a", "a", "a"] } },
  spherinder: { title: "spherinder", note: "A 3-ball extruded along w: a ball that lasts. It rolls like a ball in three directions and stands like a can on the fourth.",
    params: { r: 1, h: 0.8 }, show: { op: "extrude", h: "h", of: { op: "ball", dim: 3, r: "r" } } },
  cubinder: { title: "cubinder", note: "A disc times a square: the 4D axle. It rolls one way only.",
    params: { r: 1, a: 1.6 }, show: { op: "product", of: [{ op: "disc", r: "r" }, { op: "rect", size: ["a", "a"] }] } },
  duocylinder: { title: "duocylinder", note: "A disc times a disc. Two curved faces, each a solid torus, meeting on a flat torus with no edge or corner anywhere else. It rolls two ways.",
    params: { a: 1, b: 1 }, show: { op: "product", of: [{ op: "disc", r: "a" }, { op: "disc", r: "b" }] } },
  tiger: { title: "tiger", note: "A circle times a circle (the flat torus), rounded: the 4D torus with no 3D cousin. Slice it along w and it is two separate rings.",
    params: { a: 1.1, b: 0.9, r: 0.3 }, show: { op: "round", r: "r", of: { op: "product", of: [circle("a"), circle("b")] } } },
  ring: { title: "ring", note: "A loop of wire: a circle in one plane, thickened in all four directions. Its cross-section is a 3-ball, not a disc.",
    params: { R: 1.2, r: 0.3 }, show: loop("R", "r") },
  bracket: { title: "bracket", note: "A plate with a boss, blended, drilled and rounded: ordinary CAD, one dimension up. The drill is a disc; in 4D a disc cuts a hole that is a plane long.",
    params: { a: 2.4, t: 0.5, boss: 0.7, bore: 0.35, fillet: 0.25 },
    parts: {
      plate: { op: "round", r: 0.06, of: { op: "box", size: ["a", "t", "a", "a"] } },
      body: { op: "union", r: "fillet", of: ["plate", { op: "move", by: [0, "t/2+0.2", 0, 0], of: { op: "ball", dim: 4, r: "boss" } }] },
      drill: { op: "rotate", plane: [1, 2], deg: 90, of: { op: "disc", r: "bore" } },
    },
    show: { op: "cut", of: ["body", "drill", { op: "move", by: ["a/2-0.5", 0, "a/2-0.5", 0], of: "drill" }, { op: "move", by: ["0.5-a/2", 0, "0.5-a/2", 0], of: "drill" }] } },
  hinge: { title: "hinge", note: "In 4D a door turns in a plane (x–y here) about a plane (z–w): the pin is a disc times a square, not a rod. Open it: the leaves never touch each other or the pin, until the door folds flat onto the frame past 155°.",
    params: { open: 30, pin: 0.2, gap: 0.03, leaf: 1.6, t: 0.16, k: 0.42 }, ranges: { open: [0, 170], pin: [0.1, 0.3], gap: [-0.05, 0.1], leaf: [1, 2.2], t: [0.1, 0.3], k: [0.3, 0.6] },
    parts: {
      /* the pin: a disc in x–y, a square in z–w */
      pin: { op: "product", of: [{ op: "disc", r: "pin" }, { op: "rect", size: [1.9, 1.9] }] },
      bore: { op: "disc", r: "pin+gap" },
      knuckle: { op: "disc", r: "k" },
      /* a leaf: a slab in x (long), y (thin), z and w, standing clear of the knuckle, joined to its own bands of the
         knuckle by a neck. The door holds the knuckle's middle band in z, the frame the two outer bands: they
         interleave along z, as hinges do, and each is bored for the pin */
      slab: { op: "move", by: ["leaf/2+k+gap", 0, 0, 0], of: { op: "box", size: ["leaf", "t", 1.8, 1.8] } },
      barrel: { op: "intersect", of: [{ op: "union", of: ["knuckle", { op: "move", by: ["(k+gap)/2+0.05", 0], of: { op: "rect", size: ["k+gap+0.1", "t"] } }] }, { op: "box", size: [9, 9, 1.8, 1.8] }] },
      mid: { op: "box", size: [9, 9, 0.6, 9] },
      door: { op: "rotate", plane: [0, 1], deg: "open", of: { op: "cut", of: [{ op: "union", of: ["slab", { op: "intersect", of: ["barrel", "mid"] }] }, "bore"] } },
      frame: { op: "rotate", plane: [0, 1], deg: 180, of: { op: "cut", of: [{ op: "union", of: ["slab", { op: "cut", of: ["barrel", { op: "round", r: "gap", of: "mid" }] }] }, "bore"] } },
    },
    show: ["frame", "door", "pin"], check: [["frame", "door"], ["door", "pin"], ["frame", "pin"]], path: [{ open: 0 }, { open: 150 }] },
  chain: { title: "chain (it isn't one)", note: "Two linked rings, as in any chain. Lift one along w, slide it clear, bring it back: it never touches the other. Loops don't link in 4D.",
    params: { lift: 0, pull: 0, R: 1, r: 0.2 }, ranges: { lift: [0, 1.2], pull: [0, 3], R: [0.7, 1.3], r: [0.1, 0.3] },
    parts: {
      a: loop("R", "r"),
      /* the second ring stands in the x–z plane, threaded through the first */
      b: { op: "move", by: ["R+pull", 0, 0, "lift"], of: { op: "rotate", plane: [1, 2], deg: 90, of: loop("R", "r") } },
    },
    show: ["a", "b"], check: [["a", "b"]], films: [{ loop: "b", other: "a", plane: [0, 2], centre: ["R+pull", 0, 0, "lift"], rad: "R", tube: "r", kind: "curve", loopName: "the second ring", otherName: "the first ring" }], path: [{ lift: 0, pull: 0 }, { lift: 1, pull: 0 }, { lift: 1, pull: 3 }, { lift: 0, pull: 3 }] },
  lock: { title: "lock", note: "What does link a ring in 4D: a sphere. The ring passes into the hollow sphere and out again through w, and no slide in any direction frees it without a collision.",
    params: { sx: 0, sy: 0, sz: 0, sw: 0, R: 1.2, rho: 0.7, r: 0.12 }, ranges: { sx: [-2.5, 2.5], sy: [-2.5, 2.5], sz: [-2.5, 2.5], sw: [-2.5, 2.5], R: [0.9, 1.5], rho: [0.5, 0.9], r: [0.08, 0.2] },
    parts: {
      /* a hollow 2-sphere in x, y, z at w = 0, with a little thickness in all four directions */
      sphere: { op: "round", r: "r", of: { op: "product", of: [{ op: "shell", t: 0, of: { op: "ball", dim: 3, r: "R" } }, { op: "interval", h: 0 }] } },
      /* a ring in the x–w plane, centred on the sphere's skin */
      ring: { op: "move", by: ["R+sx", "sy", "sz", "sw"], of: { op: "rotate", plane: [1, 3], deg: 90, of: loop("rho", "r") } },
    },
    show: ["sphere", "ring"], check: [["sphere", "ring"]], ways: { name: "the ring", params: ["sx", "sy", "sz", "sw"], reach: 3.5 }, films: [{ loop: "ring", other: "sphere", plane: [0, 3], centre: ["R+sx", "sy", "sz", "sw"], rad: "rho", tube: "r", kind: "surface", loopName: "the ring", otherName: "the sphere" }], path: [{ sx: 0, sw: 0 }, { sx: 0, sw: 1.5 }, { sx: 0, sw: 0 }, { sx: 1.5, sw: 0 }] },
  tigers: { title: "tiger chain", note: "A chain that is one: three tigers, big, small, big. One circle of the small tiger threads both big ones as surfaces, the way a loop threads the sphere in the lock. Pull an end or push the middle in any direction and something collides.",
    params: { pull: 0, bx: 0, by: 0, bz: 0, bw: 0, b: 0.4, r: 0.13 }, ranges: { pull: [0, 1.5], bx: [-2, 2], by: [-2, 2], bz: [-2, 2], bw: [-2, 2], b: [0.3, 0.6], r: [0.06, 0.18] },
    parts: {
      /* an end link: circles of radius 1 in x–z and in y–w */
      big: { op: "rotate", plane: [1, 2], deg: 90, of: { op: "round", r: "r", of: { op: "product", of: [circle(1), circle(1)] } } },
      a: "big",
      /* the middle link: a circle of radius 1 in x–y, centred on the gap between the ends at the height of their
         y–w circles, so it passes through both; times a small circle (b) in z–w, small enough to stay inside both */
      m: { op: "move", by: ["1.25+bx", "1+by", "bz", "bw"], of: { op: "round", r: "r", of: { op: "product", of: [circle(1), circle("b")] } } },
      c: { op: "move", by: ["2.5+pull", 0, 0, 0], of: "big" },
    },
    show: ["a", "m", "c"], check: [["a", "m"], ["m", "c"], ["a", "c"]], ways: { name: "the middle tiger", params: ["bx", "by", "bz", "bw"], reach: 4 }, films: [{ loop: "m", other: "a", plane: [0, 1], centre: ["1.25+bx", "1+by", "bz+b", "bw"], rad: 1, tube: "r", kind: "surface", loopName: "one circle of the small tiger", otherName: "the first big tiger" }, { loop: "m", other: "c", plane: [0, 1], centre: ["1.25+bx", "1+by", "bz+b", "bw"], rad: 1, tube: "r", kind: "surface", loopName: "the same circle", otherName: "the other big tiger" }], path: [{ pull: 0, bw: 0 }, { pull: 0.9, bw: 0 }, { pull: 0, bw: 0 }, { pull: 0, bw: 1.4 }, { pull: 0, bw: 0 }] },
  links: { title: "ring–sphere chain", note: "The other chain that holds: ring, hollow sphere, ring. Each ring passes through the sphere's skin by way of w. Push the sphere or pull a ring in any direction and something collides.",
  params: { pull: 0, sx: 0, sy: 0, sz: 0, sw: 0, R: 1.2, rho: 0.7, r: 0.12 }, ranges: { pull: [0, 2], sx: [-2.5, 2.5], sy: [-2.5, 2.5], sz: [-2.5, 2.5], sw: [-2.5, 2.5], R: [0.9, 1.5], rho: [0.5, 0.9], r: [0.08, 0.2] },
  parts: {
    /* a ring in the x–w plane */
    ring: { op: "rotate", plane: [1, 3], deg: 90, of: loop("rho", "r") },
    /* the middle link: a hollow 2-sphere in x, y, z, thickened in all four directions */
    sphere: { op: "move", by: ["sx", "sy", "sz", "sw"], of: { op: "round", r: "r", of: { op: "product", of: [{ op: "shell", t: 0, of: { op: "ball", dim: 3, r: "R" } }, { op: "interval", h: 0 }] } } },
    /* each ring is centred on the sphere's skin, on opposite sides */
    a: { op: "move", by: ["0-R", 0, 0, 0], of: "ring" },
    c: { op: "move", by: ["R+pull", 0, 0, 0], of: "ring" },
  },
  show: ["a", "sphere", "c"], check: [["a", "sphere"], ["sphere", "c"], ["a", "c"]], ways: { name: "the sphere", params: ["sx", "sy", "sz", "sw"], reach: 3.5 }, films: [{ loop: "a", other: "sphere", plane: [0, 3], centre: ["0-R", 0, 0, 0], rad: "rho", tube: "r", kind: "surface", loopName: "the first ring", otherName: "the sphere" }, { loop: "c", other: "sphere", plane: [0, 3], centre: ["R+pull", 0, 0, 0], rad: "rho", tube: "r", kind: "surface", loopName: "the second ring", otherName: "the sphere" }], path: [{ pull: 0, sw: 0 }, { pull: 1.2, sw: 0 }, { pull: 0, sw: 0 }, { pull: 0, sw: 1.6 }, { pull: 0, sw: 0 }] },
  weave: { title: "weave: thread and ribbons", note: "The simplest 4D loom. Three ribbons, and a thread passing ana of the first, kata of the second, ana of the third. It cannot change sides without going round a ribbon's edge. Narrow the ribbons to threads and it just steps aside: threads don't weave with threads.",
    params: { width: 1.6, tx: 0, ty: 0, tz: 0, tw: 0 }, ranges: { width: [0.1, 1.6], tx: [-1.5, 1.5], ty: [-1.5, 1.5], tz: [-1.5, 1.5], tw: [-1.5, 1.5] },
    parts: {
      /* a ribbon: a strip in x–y, long in x, a little thick in the two directions it doesn't span */
      ribbon: { op: "round", r: 0.05, of: { op: "product", of: [{ op: "rect", size: [2.6, "width"] }, point2] } },
      ribbons: { op: "union", of: [{ op: "move", by: [0, 0, -1, 0], of: "ribbon" }, "ribbon", { op: "move", by: [0, 0, 1, 0], of: "ribbon" }] },
      /* the thread runs along z, crimped in w: over, under, over */
      thread: { op: "move", by: ["tx", "ty", "tz", "tw"], of: { op: "wire", r: 0.07, pts: [[0, 0, -1.7, 0.3], [0, 0, -1, 0.3], [0, 0, 0, -0.3], [0, 0, 1, 0.3], [0, 0, 1.7, 0.3]] } },
    },
    /* start looking at x, w and z (y unseen): the ribbons edge-on, the thread's over and under in view */
    view: [[1, 0, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [0, 1, 0, 0]],
    show: ["ribbons", "thread"], check: [["thread", "ribbons"]], ways: { name: "the thread", params: ["tx", "ty", "tz", "tw"], reach: 2.2 },
    path: [{ tw: 0, ty: 0 }, { tw: 0.7, ty: 0 }, { tw: 0, ty: 0 }, { tw: -0.7, ty: 0 }, { tw: 0, ty: 0 }, { tw: 0, ty: 0.5 }, { tw: 0.9, ty: 0.5 }, { tw: 0, ty: 0.5 }, { tw: 0, ty: 0 }] },
  hoop: { title: "bundle in a sphere-hoop", note: "Seven rods (thin spherinders, the 4D fibre) lying along w (up, in the slice you start in), bound by a hoop that is a sphere, not a ring: a bundle's surroundings are 3D, so only a closed skin goes all the way round. No rod can leave sideways. Along its own length a rod slides: that is friction's job.",
    params: { ox: 0, oy: 0, oz: 0, ow: 0 }, ranges: { ox: [-1.2, 1.2], oy: [-1.2, 1.2], oz: [-1.2, 1.2], ow: [-1.6, 1.6] },
    parts: {
      one: { op: "wire", r: 0.12, pts: [[0, 0, 0, -1.1], [0, 0, 0, 1.1]] },
      /* the bundle: one rod in the middle and five of the six round it (at the corners of an octahedron) */
      bundle: { op: "union", of: ["one", { op: "move", by: [-0.27, 0, 0, 0], of: "one" }, { op: "move", by: [0, 0.27, 0, 0], of: "one" }, { op: "move", by: [0, -0.27, 0, 0], of: "one" }, { op: "move", by: [0, 0, 0.27, 0], of: "one" }, { op: "move", by: [0, 0, -0.27, 0], of: "one" }] },
      /* the sixth, the one we try to take out */
      rod: { op: "move", by: ["0.27+ox", "oy", "oz", "ow"], of: "one" },
      hoop: { op: "round", r: 0.04, of: { op: "product", of: [{ op: "shell", t: 0, of: { op: "ball", dim: 3, r: 0.46 } }, { op: "interval", h: 0.25 }] } },
    },
    view: [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0]],
    show: ["bundle", "rod", "hoop"], check: [["rod", "hoop"], ["rod", "bundle"]], ways: { name: "the outer rod", params: ["ox", "oy", "oz", "ow"], reach: 3 },
    path: [{ ox: 0, oz: 0, ow: 0 }, { ox: 0.8, oz: 0, ow: 0 }, { ox: 0, oz: 0, ow: 0 }, { ox: 0, oz: 0.8, ow: 0 }, { ox: 0, oz: 0, ow: 0 }, { ox: 0, oz: 0, ow: 1.4 }, { ox: 0, oz: 0, ow: 0 }] },
  ringed: { title: "bundle in a ring (it falls apart)", note: "The same bundle in the hoop we would use: a ring. In the slice you start in it looks exactly like the sphere-hoop. It goes round the bundle in one plane and leaves the third sideways direction open, so the rod walks out along z.",
    params: { ox: 0, oy: 0, oz: 0, ow: 0 }, ranges: { ox: [-1.2, 1.2], oy: [-1.2, 1.2], oz: [-1.2, 1.2], ow: [-1.6, 1.6] },
    parts: {
      one: { op: "wire", r: 0.12, pts: [[0, 0, 0, -1.1], [0, 0, 0, 1.1]] },
      bundle: { op: "union", of: ["one", { op: "move", by: [-0.27, 0, 0, 0], of: "one" }, { op: "move", by: [0, 0.27, 0, 0], of: "one" }, { op: "move", by: [0, -0.27, 0, 0], of: "one" }, { op: "move", by: [0, 0, 0.27, 0], of: "one" }, { op: "move", by: [0, 0, -0.27, 0], of: "one" }] },
      rod: { op: "move", by: ["0.27+ox", "oy", "oz", "ow"], of: "one" },
      hoop: { op: "round", r: 0.04, of: { op: "product", of: [{ op: "shell", t: 0, of: { op: "disc", r: 0.46 } }, { op: "product", of: [{ op: "interval", h: 0 }, { op: "interval", h: 0.25 }] }] } },
    },
    view: [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0]],
    show: ["bundle", "rod", "hoop"], check: [["rod", "hoop"], ["rod", "bundle"]], ways: { name: "the outer rod", params: ["ox", "oy", "oz", "ow"], reach: 3 },
    path: [{ ox: 0, oz: 0, ow: 0 }, { ox: 0.8, oz: 0, ow: 0 }, { ox: 0, oz: 0, ow: 0 }, { ox: 0, oz: 0.8, ow: 0 }, { ox: 0, oz: 0, ow: 0 }] },
};
export const ORDER = ["ball", "tesseract", "spherinder", "cubinder", "duocylinder", "tiger", "ring", "bracket", "hinge", "chain", "lock", "links", "tigers", "weave", "hoop", "ringed"];
