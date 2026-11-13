/* CAD⁴'s part library: feature trees, plain JSON. Each is { params, parts, show } plus what the page needs to present
   it (title, note, ranges for the sliders, check: pairs of parts whose overlap should be nothing). */
const circle = (r) => ({ op: "shell", t: 0, of: { op: "disc", r } }), point2 = { op: "ball", dim: 2, r: 0 };
/* a loop of wire in 4D: a circle in the plane of the first two axes, at the origin of the other two, thickened */
const loop = (R, r) => ({ op: "round", r, of: { op: "product", of: [circle(R), point2] } });

/* the rope's sheath, drawn in a half-plane and turned: in (ρ, y, ℓ), ρ the distance from the sheath's axis and ℓ along
   the rope, a hoop is an arc from pole to pole at one ℓ and a band is a line along ℓ at one latitude. Where they cross,
   one is h outside the mean radius and the other h inside, chequered. Turned about the axis, the arcs become spheres
   and the lines become tubes (a circle long): two families of sheets, the cloth, rolled into a hose. */
const SHEATH = (() => { const R = 0.58, h = 0.09, t = 0.04, LAT = [-50, 0, 50], AT = [-0.8, 0, 0.8], rad = Math.PI / 180, f = (v) => +v.toFixed(4);
  const hoop = (k) => ({ op: "wire", dim: 3, r: t, pts: [-90, -70, -50, -25, 0, 25, 50, 70, 90].map((lat) => { const j = LAT.indexOf(lat), rr = R + (j < 0 ? 0 : (j + k) % 2 ? -h : h); return [f(rr * Math.cos(lat * rad)), f(rr * Math.sin(lat * rad)), AT[k]]; }) });
  const band = (j) => ({ op: "wire", dim: 3, r: t, pts: [-1.25, ...AT, 1.25].map((l, i) => { const k = i - 1, rr = R - ((j + k + 2) % 2 ? -h : h); return [f(rr * Math.cos(LAT[j] * rad)), f(rr * Math.sin(LAT[j] * rad)), l]; }) });
  /* turn ρ into the plane of the first axis and a new one, then put the rope's length on w */
  const turn = (of) => ({ op: "rotate", plane: [2, 3], deg: 90, of: { op: "revolve", axis: 0, of } });
  return { hoops: turn({ op: "union", of: [0, 1, 2].map(hoop) }), bands: turn({ op: "union", of: [0, 1, 2].map(band) }) }; })();

/* TACKLE: a fixed block above, a moving block below, one rope: made fast to the beam, down and under the moving sheave,
   up and over the fixed one, down to the hand. Raise the load by `lift` and the hand comes down twice that. */
const TACKLE = (() => { const f = (v) => +v.toFixed(4), U = [1.6, 1.6], L0 = [-0.4, -1.6], N = 12, pts = [[-1.4, 3.34, 0, 0]];
  for (let k = 0; k <= N; k++) { const t = Math.PI + (Math.PI * k) / N; pts.push([f(L0[0] + Math.cos(t)), `${f(L0[1] + Math.sin(t))}+lift`, 0, 0]); }   // under the moving sheave
  for (let k = 0; k <= N; k++) { const t = Math.PI - (Math.PI * k) / N; pts.push([f(U[0] + Math.cos(t)), f(U[1] + Math.sin(t)), 0, 0]); }               // over the fixed one
  pts.push([2.6, "0.2-2*lift", 0, 0]);
  return { title: "block and tackle", note: "Two pulleys and one rope: made fast to the beam, under the moving sheave, over the fixed one, down to your hand. Raise the load and your hand travels twice as far, so you pull half as hard. Both blocks have cheeks on all four sides, and every groove is a cup.",
    params: { lift: 0 }, ranges: { lift: [0, 1.2] },
    parts: {
      seat: { op: "round", r: 0.15, of: { op: "product", of: [circle(1), point2] } },
      hole: { op: "move", by: [0.5, 0], of: { op: "disc", r: 0.17 } },
      wheel0: { op: "cut", of: [{ op: "product", of: [{ op: "disc", r: 1.02 }, { op: "rect", size: [0.6, 0.6] }] }, "seat", { op: "disc", r: 0.18 }, "hole", { op: "rotate", plane: [0, 1], deg: 90, of: "hole" }, { op: "rotate", plane: [0, 1], deg: 180, of: "hole" }, { op: "rotate", plane: [0, 1], deg: 270, of: "hole" }] },
      pin: { op: "product", of: [{ op: "disc", r: 0.15 }, { op: "rect", size: [1.1, 1.1] }] },
      /* a block: cheeks on all four sides of the wheel (two across z, two across w), joined over the top */
      zcheek: { op: "move", by: [0, 0.75, 0, 0], of: { op: "box", size: [0.5, 2.1, 0.12, 1] } },
      wcheek: { op: "move", by: [0, 0.75, 0, 0], of: { op: "box", size: [0.5, 2.1, 1, 0.12] } },
      shell: { op: "cut", of: [{ op: "union", of: [{ op: "move", by: [0, 0, 0.44, 0], of: "zcheek" }, { op: "move", by: [0, 0, -0.44, 0], of: "zcheek" }, { op: "move", by: [0, 0, 0, 0.44], of: "wcheek" }, { op: "move", by: [0, 0, 0, -0.44], of: "wcheek" }, { op: "move", by: [0, 1.74, 0, 0], of: { op: "box", size: [0.5, 0.12, 1, 1] } }] }, { op: "disc", r: 0.15 }] },
      housing: { op: "union", of: ["shell", "pin"] },
      /* the fixed block hangs from the beam; the moving one is the same block upside down, with the load under it */
      beam: { op: "move", by: [0.1, 3.46, 0, 0], of: { op: "box", size: [3.6, 0.12, 1, 1] } },
      fixed: { op: "union", of: [{ op: "move", by: [U[0], U[1], 0, 0], of: "housing" }, "beam"] },
      moving: { op: "move", by: [L0[0], `${L0[1]}+lift`, 0, 0], of: { op: "union", of: [{ op: "rotate", plane: [0, 1], deg: 180, of: "housing" }, { op: "move", by: [0, -2.2, 0, 0], of: { op: "ball", dim: 4, r: 0.4 } }] } },
      upper: { op: "move", by: [U[0], U[1], 0, 0], of: { op: "rotate", plane: [0, 1], deg: "0-2*lift*57.29578", of: "wheel0" } },
      lower: { op: "move", by: [L0[0], `${L0[1]}+lift`, 0, 0], of: { op: "rotate", plane: [0, 1], deg: "lift*57.29578", of: "wheel0" } },
      rope: { op: "union", of: [{ op: "wire", r: 0.1, pts }, { op: "move", by: [2.6, "0.2-2*lift", 0, 0], of: { op: "ball", dim: 4, r: 0.2 } }] },
    },
    show: ["upper", "lower", "rope", "fixed", "moving"], check: [["rope", "upper"], ["rope", "lower"], ["rope", "fixed"], ["rope", "moving"], ["moving", "fixed"], ["lower", "upper"]],
    path: [{ lift: 0 }, { lift: 1.2 }], ropePts: pts }; })();

/* SPINNERET. Extrusion pushes a cross-section along one direction, here y (downward, as a spider does). In 4D the
   cross-section is a 3D shape in (x, z, w), so the spigot's shape decides what comes out: a ball-shaped hole makes a
   fibre, a slot a ribbon, a gap shaped like a spherical shell a closed hose, and a hose spigot with fibre holes in its
   plug a whole rope, core and sheath in one pull. `along(A, h)` is a 3D shape in (x, z, w) run h either side along y. */
const along = (of, h) => ({ op: "rotate", plane: [2, 3], deg: 90, of: { op: "rotate", plane: [1, 3], deg: 90, of: { op: "extrude", h, of } } });
const SPIN = (() => { const at = (x, of) => ({ op: "move", by: [x, 0, 0, 0], of }), ball = (r) => ({ op: "ball", dim: 3, r }), shellOf = (r, t) => ({ op: "shell", t, of: ball(r) });
  const CORE = [[0, 0, 0], [0.2, 0.2, 0.2], [0.2, -0.2, -0.2], [-0.2, 0.2, -0.2], [-0.2, -0.2, 0.2]], XR = 1.0, XF = -1.35, XB = -0.45;
  /* the products start half way through the plate (y = 0.25), downstream of the struts, where the dope has closed up
     again behind them, and hang to y = 0.25 − draw: a shape run draw/2 either side of its middle */
  const hang = (of3, x) => ({ op: "move", by: [x, "0.25-draw/2", 0, 0], of: along(of3, "draw/2") });
  const strut = (dz, dw) => ({ op: "move", by: [XR, 0.4, dz * 0.47, dw * 0.47], of: { op: "box", size: [0.05, 0.2, dz ? 0.3 : 0.05, dw ? 0.3 : 0.05] } });
  return { title: "spinneret", note: "How you would make any of it. A plate with three spigots, the products drawn out downward. A ball-shaped hole gives a fibre; a slot gives a ribbon; a gap shaped like a spherical shell gives a closed hose, and with fibre holes in its plug, a whole rope at once. In your slice the hose spigot looks like our tube die. The plug hangs on struts upstream, which die-makers call a spider.",
    params: { draw: 2.2, cx: 0, cy: 0, cz: 0, cw: 0 }, ranges: { draw: [0.6, 3.2], cx: [-0.6, 0.6], cy: [-1.5, 1.5], cz: [-0.6, 0.6], cw: [-0.6, 0.6] },
    parts: {
      /* the plate, 0.5 thick, with the three spigots cut through it; the hose spigot's plug is what the shell-shaped gap
         leaves standing, pierced by five holes, and held by four struts in the upstream part of the plate only */
      plate: { op: "union", of: [{ op: "cut", of: [{ op: "move", by: [0, 0.25, 0, 0], of: { op: "box", size: [4, 0.5, 1.7, 1.7] } }, at(XF, along(ball(0.11), 2)), at(XB, along({ op: "box", size: [0.62, 0.11, 0.11] }, 2)), at(XR, along(shellOf(0.47, 0.11), 2)), ...CORE.map((c) => ({ op: "move", by: [XR + c[0], 0, c[1], c[2]], of: along(ball(0.085), 2) }))] }, strut(1, 0), strut(-1, 0), strut(0, 1), strut(0, -1)] },
      fibre: hang(ball(0.085), XF),
      ribbon: hang({ op: "box", size: [0.56, 0.06, 0.06] }, XB),
      hose: hang(shellOf(0.47, 0.06), XR),
      /* the rope's core: four fibres, and a fifth we try to take out */
      core: { op: "union", of: CORE.slice(1).map((c) => ({ op: "move", by: [c[0], 0, c[1], c[2]], of: hang(ball(0.06), XR) })) },
      one: { op: "move", by: ["cx", "cy", "cz", "cw"], of: hang(ball(0.06), XR) },
      /* for the test: what a ring-shaped gap would have made in the hose's place, a band (a circle in x–z, the yarn's length long) */
      band: hang({ op: "round", r: 0.03, of: { op: "product", of: [{ op: "shell", t: 0, of: { op: "disc", r: 0.47 } }, { op: "interval", h: 0 }] } }, XR),
    },
    show: ["plate", "fibre", "ribbon", "hose", "core", "one"], check: [["fibre", "plate"], ["ribbon", "plate"], ["hose", "plate"], ["core", "plate"], ["one", "plate"], ["one", "hose"], ["one", "core"]],
    ways: { name: "the middle fibre of the rope", params: ["cx", "cy", "cz", "cw"], reach: 1.2 }, path: [{ draw: 0.6 }, { draw: 3.2 }] }; })();

/* ROPES. The rope runs along w; its cross-section is the 3D space (x, y, z). FCC: one fibre and the twelve that fit
   round it in three dimensions (each of the twelve touches four others). */
const FCC = (() => { const P = []; for (const [a, b] of [[0, 1], [0, 2], [1, 2]]) for (const s of [1, -1]) for (const t of [1, -1]) { const v = [0, 0, 0]; v[a] = s / Math.SQRT2; v[b] = t / Math.SQRT2; P.push(v); } return P; })();
const UPW = [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0]], f4 = (v) => +v.toFixed(4);
const strand = (r, h) => ({ op: "wire", r, pts: [[0, 0, 0, -h], [0, 0, 0, h]] }), hoseOf = (R, t, h) => ({ op: "extrude", h, of: { op: "shell", t, of: { op: "ball", dim: 3, r: R } } });
const ROPES = {
  /* thirteen continuous filaments in a closed hose: the spinneret's rope, and the strongest thing on the bench. The
     hose is drawn shorter than the filaments so you can see into it */
  hoserope: { title: "rope: filaments in a hose", note: "The spinneret's rope: thirteen continuous filaments (one, and the twelve that fit round it in the bundle's 3D cross-section) in a closed hose. The hose is cut short here so you can see the filaments. On the bench this is the strongest rope per weight: the hose grips and carries load too. Move the slice along z: the hose's ring closes to a cap.",
    params: { ox: 0, oy: 0, oz: 0, ow: 0 }, ranges: { ox: [-0.8, 0.8], oy: [-0.8, 0.8], oz: [-0.8, 0.8], ow: [-1.5, 1.5] },
    parts: { one: strand(0.12, 1.3), core: { op: "union", of: ["one", ...FCC.slice(1).map((c) => ({ op: "move", by: [f4(c[0] * 0.27), f4(c[1] * 0.27), f4(c[2] * 0.27), 0], of: "one" }))] },
      fibre: { op: "move", by: [`${f4(FCC[0][0] * 0.27)}+ox`, `${f4(FCC[0][1] * 0.27)}+oy`, "oz", "ow"], of: "one" }, hose: hoseOf(0.45, 0.05, 0.6) },
    view: UPW, show: ["core", "fibre", "hose"], check: [["fibre", "hose"], ["fibre", "core"]], ways: { name: "one outer filament", params: ["ox", "oy", "oz", "ow"], reach: 2 },
    path: [{ ox: 0, oz: 0, ow: 0 }, { ox: 0.6, oz: 0, ow: 0 }, { ox: 0, oz: 0, ow: 0 }, { ox: 0, oz: 0.6, ow: 0 }, { ox: 0, oz: 0, ow: 0 }, { ox: 0, oz: 0, ow: 1.2 }, { ox: 0, oz: 0, ow: 0 }] },
  /* five fibres wound round a ribbon: the cheat that gives a 4D yarn its twist back */
  ribbonyarn: (() => { const turn = (z, ph) => { const pts = []; for (let k = 0; k <= 20; k++) { const u = k / 20, a = ph + 2 * Math.PI * 1.5 * u; pts.push([f4(0.17 * Math.cos(a)), f4(0.17 * Math.sin(a)), z, f4(-1.2 + 2.4 * u)]); } return { op: "wire", r: 0.06, pts }; }, Z = [-0.45, -0.225, 0, 0.225, 0.45]; // (one lane is at z = 0, so the slice you start in holds a whole fibre)
    return { title: "yarn on a ribbon", note: "The cheat that gives a 4D yarn its twist back. Twisted round a thread, a fibre slips over it through the spare direction and falls straight. Twisted round a ribbon, flat along the yarn and wide across z, it can't get over. Here are five fibres wound on one. In the slice you start in it looks exactly like a fibre twisted round a thread: the thread is the ribbon edge-on, and it runs off along z, where the other four fibres are (move the lever). A fibre is held in x and y; along z it slides until it reaches the ribbon's edge. Narrow the ribbon and that edge comes to meet it.",
      params: { width: 1.2, ox: 0, oy: 0, oz: 0, ow: 0 }, ranges: { width: [0.2, 1.4], ox: [-0.6, 0.6], oy: [-0.6, 0.6], oz: [-1.2, 1.2], ow: [-0.5, 0.5] },
      parts: { ribbon: { op: "round", r: 0.03, of: { op: "box", size: [0.04, 0.04, "width", 2.4] } }, fibres: { op: "union", of: Z.slice(0, 4).map((z, i) => turn(z, i * 1.9)) }, fibre: { op: "move", by: ["ox", "oy", "oz", "ow"], of: turn(Z[4], 4 * 1.9) } },
      view: UPW, show: ["ribbon", "fibres", "fibre"], check: [["fibre", "ribbon"], ["fibre", "fibres"]], ways: { name: "the fibre nearest the edge", params: ["ox", "oy", "oz", "ow"], reach: 1.5 },
      path: [{ ox: 0, oz: 0 }, { ox: 0.5, oz: 0 }, { ox: 0, oz: 0 }, { ox: 0, oz: 0.9 }, { ox: 0.5, oz: 0.9 }, { ox: 0, oz: 0.9 }, { ox: 0, oz: 0 }] }; })(),
  /* a sheath made by winding: three ribbons round the bundle, each in its own plane. On the cross-section's sphere
     each is a band; three bands close the sphere once they are wide enough, and leave its eight corners open before */
  wound: (() => { const band = (ax) => ({ op: "intersect", of: [{ op: "shell", t: 0.05, of: { op: "ball", dim: 3, r: 0.5 } }, { op: "box", size: [0, 1, 2].map((i) => (i === ax ? "2*b" : 3)) }] });
    return { title: "wound sheath", note: "A sheath with no spinneret: three ribbons wound round the bundle, each in its own plane. On the cross-section they are three bands on a sphere. Wide enough (b about half the radius), they close it. Narrower, they leave eight holes at the corners, and a fibre walks out through one: slide b down and press run. One rod stands in for the bundle.",
      params: { b: 0.3, out: 0, side: 0 }, ranges: { b: [0.1, 0.5], out: [0, 0.7], side: [0, 0.7] },
      parts: { bandx: { op: "extrude", h: 0.35, of: band(0) }, bandy: { op: "extrude", h: 0.35, of: band(1) }, bandz: { op: "extrude", h: 0.35, of: band(2) }, sheath: { op: "union", of: ["bandx", "bandy", "bandz"] },
        rod: { op: "move", by: ["out+side", "out", "out", 0], of: strand(0.07, 1.1) } },
      view: UPW, show: ["bandx", "bandy", "bandz", "rod"], check: [["rod", "sheath"]], path: [{ out: 0, side: 0 }, { out: 0.7, side: 0 }, { out: 0, side: 0 }, { out: 0, side: 0.7 }, { out: 0, side: 0 }] }; })(),
  /* thirteen ropes in a jacket: each rope is thirteen filaments in its own hose. Telescoped, so every layer shows */
  cable: (() => { const D = 0.44, d = 0.105; return { title: "cable: thirteen ropes", note: "Ropes in a jacket: thirteen ropes, each thirteen filaments in its own hose, 169 filaments in all. Each layer is cut shorter than the one inside it so you can see them. On the bench a cable is worth about a tenth less per weight than its ropes: a rope is already uniform, and partly hollow, so the jacket is heavy for what it adds. With no twist there is no torque to balance either. A cable is for handling, not strength.",
      params: {}, parts: { fil: strand(0.045, 1.3), bundle: { op: "union", of: ["fil", ...FCC.map((c) => ({ op: "move", by: [f4(c[0] * d), f4(c[1] * d), f4(c[2] * d), 0], of: "fil" }))] }, skin: hoseOf(0.175, 0.02, 0.85),
        filaments: { op: "union", of: ["bundle", ...FCC.map((c) => ({ op: "move", by: [f4(c[0] * D), f4(c[1] * D), f4(c[2] * D), 0], of: "bundle" }))] },
        hoses: { op: "union", of: ["skin", ...FCC.map((c) => ({ op: "move", by: [f4(c[0] * D), f4(c[1] * D), f4(c[2] * D), 0], of: "skin" }))] }, jacket: hoseOf(0.68, 0.04, 0.4) },
      view: UPW, show: ["filaments", "hoses", "jacket"], check: [["filaments", "hoses"], ["hoses", "jacket"]] }; })(),
};

/* BRAIDS. Threads don't braid in 4D and flat ribbons slide off each other's edges. Close a ribbon into a hose and it
   has no edge: in cross-section a hose is a loop, and one loop can pass through another. Draw any 3D braid in the
   half-plane of (radius, y) along the length and revolve it: each thread becomes a hose, each crossing one hose
   passing through the next. `lace` is the three-strand plait: three points chasing round a figure of eight */
const BRAIDS = (() => { const A = 0.36, B = 0.15, t = 0.06, L = 1.5, N = 36, turns = 1.5;
  const lace = (j, mid) => { const pts = []; for (let k = 0; k <= N; k++) { const u = k / N, a = 2 * Math.PI * (turns * u + j / 3); pts.push([f4(mid + A * Math.sin(a)), f4(B * Math.sin(2 * a)), f4(-L + 2 * L * u)]); } return { op: "wire", dim: 3, r: t, pts }; };
  const hose = (j) => ({ op: "rotate", plane: [2, 3], deg: 90, of: { op: "revolve", axis: 0, of: lace(j, 0.85) } });
  const ribbon = (j) => ({ op: "rotate", plane: [2, 3], deg: 90, of: { op: "extrude", h: "width", of: lace(j, 0) } });
  const ways = { params: ["ox", "oy", "oz", "ow"], reach: 2.5 }, P = { ox: 0, oy: 0, oz: 0, ow: 0 }, by = ["ox", "oy", "oz", "ow"];
  return {
    hosebraid: { title: "hose braid", note: "A braid that holds in 4D. Threads pass each other freely here, and a flat ribbon slides off its neighbour's edge, so close each ribbon into a hose: it has no edge. This is the ordinary three-strand plait, drawn in a half-plane and revolved, so every strand is a hose and every crossing is one hose passing through another. In this slice you see each hose twice, left and right, as two threads of an ordinary plait; turn the slice into z and they join into rings. One hose cannot be moved off the others in any direction across the braid.",
      params: { ...P }, ranges: { ox: [-1, 1], oy: [-1, 1], oz: [-1, 1], ow: [-1, 1] },
      parts: { one: hose(0), two: hose(1), others: { op: "union", of: ["one", "two"] }, third: { op: "move", by, of: hose(2) } },
      view: UPW, show: ["one", "two", "third"], check: [["third", "others"], ["one", "two"]], ways: { name: "one hose", ...ways },
      path: [{ ...P }, { ...P, ox: 0.8 }, { ...P }, { ...P, oy: 0.8 }, { ...P }, { ...P, oz: 0.8 }, { ...P }] },
    ribbonbraid: { title: "ribbon braid", note: "The same plait in flat ribbons, each wide across z. In this slice it is a plait of three threads and looks sound. It is not a braid: a ribbon has edges. Slide one along z by the ribbons' width and it is past the others' edges and comes away untouched. Wide ribbons make that a long way to slip, which is all that holds it, the way a wide ribbon holds a yarn's twist. Narrow the ribbons and press run.",
      params: { width: 0.5, ...P }, ranges: { width: [0.1, 0.8], ox: [-1, 1], oy: [-1, 1], oz: [-2, 2], ow: [-1, 1] },
      parts: { one: ribbon(0), two: ribbon(1), others: { op: "union", of: ["one", "two"] }, third: { op: "move", by, of: ribbon(2) } },
      view: UPW, show: ["one", "two", "third"], check: [["third", "others"], ["one", "two"]], ways: { name: "one ribbon", ...ways },
      path: [{ ...P }, { ...P, ox: 0.8 }, { ...P }, { ...P, oz: 1.3 }, { ...P, oz: 1.3, ox: 0.9 }, { ...P, oz: 1.3 }, { ...P }] },
  }; })();

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
  cloth: { title: "cloth: ribbon on ribbon", note: "4D cloth is a 3D slab, and this is its plain weave: two families of sheets crossing along lines, each going ana of one neighbour and kata of the next. You start looking across it (y, z and w): it is our own plain weave, and every thread you see is a sheet running off along x. A sheet is bound every way but along x, where it only slides.",
    params: { sx: 0, sy: 0, sz: 0, sw: 0, h: 0.14 }, ranges: { sx: [-1.5, 1.5], sy: [-1.2, 1.2], sz: [-1.2, 1.2], sw: [-1, 1], h: [0.1, 0.2] },
    parts: {
      /* a sheet is a crimped line (in the three directions that aren't x) extruded along x. Warp sheets lie in x–y
         at z = ±0.5 and crimp along y; weft sheets lie in x–z at y = ±0.5 and crimp along z; where two cross, one is
         at w = +h and the other at −h, chequered */
      warp0: { op: "product", of: [{ op: "interval", h: 1.2 }, { op: "wire", dim: 3, r: 0.05, pts: [[-1.5, -0.5, "0-h"], [-0.5, -0.5, "h"], [0.5, -0.5, "0-h"], [1.5, -0.5, "h"]] }] },
      warp1: { op: "product", of: [{ op: "interval", h: 1.2 }, { op: "wire", dim: 3, r: 0.05, pts: [[-1.5, 0.5, "h"], [-0.5, 0.5, "0-h"], [0.5, 0.5, "h"], [1.5, 0.5, "0-h"]] }] },
      warp: { op: "union", of: ["warp0", "warp1"] },
      weft: { op: "product", of: [{ op: "interval", h: 1.2 }, { op: "wire", dim: 3, r: 0.05, pts: [[-0.5, -1.5, "h"], [-0.5, -0.5, "0-h"], [-0.5, 0.5, "h"], [-0.5, 1.5, "0-h"]] }] },
      /* the sheet we try to take out */
      sheet: { op: "move", by: ["sx", "sy", "sz", "sw"], of: { op: "product", of: [{ op: "interval", h: 1.2 }, { op: "wire", dim: 3, r: 0.05, pts: [[0.5, -1.5, "0-h"], [0.5, -0.5, "h"], [0.5, 0.5, "0-h"], [0.5, 1.5, "h"]] }] } },
    },
    view: [[0, 1, 0, 0], [0, 0, 0, 1], [0, 0, 1, 0], [1, 0, 0, 0]],
    show: ["warp", "weft", "sheet"], check: [["sheet", "warp"], ["sheet", "weft"]], ways: { name: "one weft sheet", params: ["sx", "sy", "sz", "sw"], reach: 3.2 },
    path: [{ sw: 0, sy: 0, sx: 0 }, { sw: 0.6, sy: 0, sx: 0 }, { sw: 0, sy: 0, sx: 0 }, { sw: -0.6, sy: 0, sx: 0 }, { sw: 0, sy: 0, sx: 0 }, { sw: 0, sy: 0.8, sx: 0 }, { sw: 0, sy: 0, sx: 0 }, { sw: 0, sy: 0, sx: 1.2 }, { sw: 0, sy: 0, sx: 0 }] },
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
  rope: { title: "rope", note: "The 4D rope: a bundle of fibres in a woven sheath. The sheath is the cloth rolled into a hose: hoops that are spheres, woven with bands that run the rope's length, each hoop outside one band and inside the next. No fibre can leave sideways; the hoops cannot slide along the bands. Along its length a fibre is held by friction alone, as in ours.",
    params: { ox: 0, oy: 0, oz: 0, ow: 0 }, ranges: { ox: [-1.2, 1.2], oy: [-1.2, 1.2], oz: [-1.2, 1.2], ow: [-1.6, 1.6] },
    parts: {
      one: { op: "wire", r: 0.12, pts: [[0, 0, 0, -1.2], [0, 0, 0, 1.2]] },
      core: { op: "union", of: ["one", { op: "move", by: [-0.27, 0, 0, 0], of: "one" }, { op: "move", by: [0, 0.27, 0, 0], of: "one" }, { op: "move", by: [0, -0.27, 0, 0], of: "one" }, { op: "move", by: [0, 0, 0.27, 0], of: "one" }, { op: "move", by: [0, 0, -0.27, 0], of: "one" }] },
      fibre: { op: "move", by: ["0.27+ox", "oy", "oz", "ow"], of: "one" },
      hoops: SHEATH.hoops, bands: SHEATH.bands,
    },
    view: [[1, 0, 0, 0], [0, 0, 0, 1], [0, 1, 0, 0], [0, 0, 1, 0]],
    show: ["core", "fibre", "hoops", "bands"], check: [["fibre", "hoops"], ["fibre", "bands"], ["fibre", "core"], ["hoops", "bands"]], ways: { name: "one fibre", params: ["ox", "oy", "oz", "ow"], reach: 3 },
    path: [{ ox: 0, oy: 0, ow: 0 }, { ox: 0.8, oy: 0, ow: 0 }, { ox: 0, oy: 0, ow: 0 }, { ox: 0, oy: 0.8, ow: 0 }, { ox: 0, oy: 0, ow: 0 }, { ox: 0, oy: 0, ow: 1.3 }, { ox: 0, oy: 0, ow: 0 }] },
  pulley: { title: "pulley", note: "A wheel that turns in a plane (x–y) on a pin that is a plane (z–w), and a rope over it. A rope on a rim can slip sideways two ways, not one, so the groove has to be a cup: curved across z and across w. Open the groove along w and it is our pulley's groove; the rope walks off through w. Take the flange away and the block's cheeks are all that hold it: ours has two, across z, and a 4D block needs two more across w (guard).",
    params: { flange: 0.17, open: 0, guard: 1, turn: 0, rx: 0, ry: 0, rz: 0, rw: 0 }, ranges: { flange: [0, 0.2], guard: [0, 1], open: [0, 0.7], turn: [0, 360], rx: [-1, 1], ry: [-1, 1], rz: [-1, 1], rw: [-1, 1] },
    parts: {
      /* the rope's seat: everything within 0.15 of the circle the rope's middle runs on (radius 1), stretched by
         `open` along w. open = 0 is a cup, a ring-shaped groove closed on both sides; open wide and it is a trough */
      seat: { op: "round", r: 0.15, of: { op: "product", of: [circle(1), { op: "product", of: [{ op: "interval", h: 0 }, { op: "interval", h: "open" }] }] } },
      /* the wheel: a disc times a square, its rim `flange` above the bottom of the seat, lightened by four holes
         (so you can see it turn), bored for the pin */
      blank: { op: "product", of: [{ op: "disc", r: "0.85+flange" }, { op: "rect", size: [0.6, 0.6] }] },
      hole: { op: "move", by: [0.5, 0], of: { op: "disc", r: 0.17 } },
      wheel: { op: "rotate", plane: [0, 1], deg: "turn", of: { op: "cut", of: ["blank", "seat", { op: "disc", r: 0.18 }, "hole", { op: "rotate", plane: [0, 1], deg: 90, of: "hole" }, { op: "rotate", plane: [0, 1], deg: 180, of: "hole" }, { op: "rotate", plane: [0, 1], deg: 270, of: "hole" }] } },
      /* the pin, a disc in x–y and a square in z–w, and the block: two cheeks either side in z, joined over the top */
      pin: { op: "product", of: [{ op: "disc", r: 0.15 }, { op: "rect", size: [1.1, 1.1] }] },
      cheek: { op: "cut", of: [{ op: "move", by: [0, 0.75, 0, 0], of: { op: "box", size: [0.5, 2.1, 0.12, 1] } }, { op: "disc", r: 0.15 }] },
      /* and two more either side in w, which ours has no need of: `guard` 1 brings them in, 0 stands them off out of reach */
      wcheek: { op: "cut", of: [{ op: "move", by: [0, 0.75, 0, 0], of: { op: "box", size: [0.5, 2.1, 1, 0.12] } }, { op: "disc", r: 0.15 }] },
      block: { op: "union", of: [{ op: "move", by: [0, 0, 0.44, 0], of: "cheek" }, { op: "move", by: [0, 0, -0.44, 0], of: "cheek" }, { op: "move", by: [0, 0, 0, "0.44+3*(1-guard)"], of: "wcheek" }, { op: "move", by: [0, 0, 0, "0-0.44-3*(1-guard)"], of: "wcheek" }, { op: "move", by: [0, 1.74, 0, 0], of: { op: "box", size: [0.5, 0.12, 1, 1] } }] },
      /* the rope: up one side, half way round at radius 1, down the other */
      rope: { op: "move", by: ["rx", "ry", "rz", "rw"], of: { op: "wire", r: 0.1, pts: [[1, -2.2, 0, 0], [1.0, 0.0, 0, 0], [0.9749, 0.2225, 0, 0], [0.901, 0.4339, 0, 0], [0.7818, 0.6235, 0, 0], [0.6235, 0.7818, 0, 0], [0.4339, 0.901, 0, 0], [0.2225, 0.9749, 0, 0], [0.0, 1.0, 0, 0], [-0.2225, 0.9749, 0, 0], [-0.4339, 0.901, 0, 0], [-0.6235, 0.7818, 0, 0], [-0.7818, 0.6235, 0, 0], [-0.901, 0.4339, 0, 0], [-0.9749, 0.2225, 0, 0], [-1.0, 0.0, 0, 0], [-1, -2.2, 0, 0]] } },
    },
    show: ["wheel", "rope", "block", "pin"], check: [["rope", "wheel"], ["rope", "block"], ["wheel", "pin"], ["wheel", "block"]], ways: { name: "the rope", params: ["rx", "ry", "rz", "rw"], reach: 1.6 },
    path: [{ turn: 0, rz: 0, rw: 0 }, { turn: 180, rz: 0, rw: 0 }, { turn: 180, rz: 0.7, rw: 0 }, { turn: 180, rz: 0, rw: 0 }, { turn: 180, rz: 0, rw: 0.7 }, { turn: 180, rz: 0, rw: 0 }] },
  tackle: TACKLE,
  room: { title: "room", note: "A room: a floor that is a volume (x, z, w), six walls round it and a ceiling, eight in all, each a 3D slab. The doorway is a 3D hole and the door a slab that covers it, hung on a pin that is a plane (y–w) and swinging in x–z. Two windows, and a table on four legs, the fewest that stand on a 3D floor. Walk through it at kata.mino.mobi/house/.",
    params: { open: 25 }, ranges: { open: [0, 110] },
    parts: {
      ground: { op: "move", by: [0, -0.2, 0, 0], of: { op: "box", size: [18, 0.4, 18, 18] } },
      /* the shell: 4 across inside and 2.6 high, walls 0.2 thick; a doorway in the +x wall (0.9 wide in z, 1.2 in w, 2
         high), a window in the −x wall and one in the +w wall. (The cutters run well past the wall: a
         cutter's own end face would otherwise read as a surface in mid-air to anything that asks how far the nearest wall is.) */
      house: { op: "cut", of: [{ op: "move", by: [0, 1.4, 0, 0], of: { op: "box", size: [4.4, 2.8, 4.4, 4.4] } }, { op: "move", by: [0, 1.3, 0, 0], of: { op: "box", size: [4, 2.6, 4, 4] } },
        { op: "move", by: [2.1, 1, 0, 0], of: { op: "box", size: [3, 2, 0.9, 1.2] } }, { op: "move", by: [-2.1, 1.5, 0, 0], of: { op: "box", size: [3, 0.9, 1.6, 1.6] } }, { op: "move", by: [0, 1.5, 0, 2.1], of: { op: "box", size: [1.6, 0.9, 1.6, 3] } }] },
      /* the door lies on the wall's outer face, a little larger than the hole, and turns about its outer edge */
      leaf: { op: "move", by: [-0.04, 1.04, 0.5, 0], of: { op: "box", size: [0.06, 2.04, 1, 1.3] } },
      door: { op: "move", by: [2.28, 0, -0.5, 0], of: { op: "rotate", plane: [2, 0], deg: "open", of: "leaf" } },
      pin: { op: "move", by: [2.28, 1.02, -0.5, 0], of: { op: "rotate", plane: [1, 2], deg: 90, of: { op: "product", of: [{ op: "disc", r: 0.035 }, { op: "rect", size: [2.04, 1.3] }] } } },
      /* a table: four legs under a top, at the corners of a tetrahedron in the floor's three directions */
      leg: { op: "wire", r: 0.04, pts: [[0, 0, 0, 0], [0, 0.72, 0, 0]] },
      table: { op: "move", by: [-0.9, 0, -0.7, 0.6], of: { op: "union", of: [{ op: "move", by: [0, 0.75, 0, 0], of: { op: "box", size: [1.2, 0.06, 1.2, 1.2] } }, { op: "move", by: [0.4, 0, 0.4, 0.4], of: "leg" }, { op: "move", by: [0.4, 0, -0.4, -0.4], of: "leg" }, { op: "move", by: [-0.4, 0, 0.4, -0.4], of: "leg" }, { op: "move", by: [-0.4, 0, -0.4, 0.4], of: "leg" }] } },
    },
    show: ["ground", "house", "door", "pin", "table"], check: [["door", "house"], ["door", "ground"]], path: [{ open: 0 }, { open: 110 }] },
  spinneret: SPIN,
  ...ROPES,
  ...BRAIDS,
};
export const ORDER = ["ball", "tesseract", "spherinder", "cubinder", "duocylinder", "tiger", "ring", "bracket", "hinge", "chain", "lock", "links", "tigers", "weave", "cloth", "hoop", "ringed", "rope", "hoserope", "ribbonyarn", "wound", "cable", "hosebraid", "ribbonbraid", "pulley", "tackle", "spinneret", "room"];
