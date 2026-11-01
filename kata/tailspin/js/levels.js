/* TAILSPIN's ten levels, hand made, each teaching one thing, getting harder (the selftest holds the difficulty to rising,
   and every level to the oracle finishing it). A segment: { len (m), r (bend radius, m), dir (where the bend goes, and
   the stick: 0 right, 90 ana (up), 180 left, 270 kata (down)), twist (degrees a metre the bend's direction turns) }.
   R is the track's radius (m); score is the oracle's difficulty (oracle.js), stored so the menu needn't ride every level
   on load, and held to the oracle by the selftest. */
export const LEVELS = [
  { name: "First lean", score: 0.18, R: 3, lesson: "Push the stick right and the cat leans right, and the bike turns right. That's all a bicycle is.",
    segs: [{ len: 25 }, { len: 30, r: 22, dir: 0 }, { len: 25 }] },
  { name: "Both ways", score: 1.08, R: 3, lesson: "Right, then left. Lean into each bend, and come back upright between them.",
    segs: [{ len: 20 }, { len: 26, r: 18, dir: 0 }, { len: 12 }, { len: 26, r: 18, dir: 180 }, { len: 20 }] },
  { name: "Ana", score: 1.7, R: 3, lesson: "This bend goes up, out of the space you can see: into ana. Push the stick up and the cat leans ana. Watch the kerbs: teal is where the track leaves your slice ana.",
    segs: [{ len: 25 }, { len: 34, r: 20, dir: 90 }, { len: 25 }] },
  { name: "Kata", score: 2.58, R: 3, lesson: "Now down, into kata. Rose kerbs: the track is leaving your slice kata. Stick down.",
    segs: [{ len: 20 }, { len: 30, r: 18, dir: 270 }, { len: 12 }, { len: 26, r: 18, dir: 90 }, { len: 20 }] },
  { name: "Four ways", score: 2.8, R: 3, lesson: "Right, ana, left, kata: one bend each way your stick goes.",
    segs: [{ len: 12 }, { len: 18, r: 12, dir: 0 }, { len: 5 }, { len: 18, r: 12, dir: 90 }, { len: 5 }, { len: 18, r: 12, dir: 180 }, { len: 5 }, { len: 18, r: 12, dir: 270 }, { len: 12 }] },
  { name: "In between", score: 2.99, R: 3, lesson: "Bends between the ways: right and ana at once, left and kata. The stick goes on the diagonal.",
    segs: [{ len: 12 }, { len: 18, r: 14, dir: 45 }, { len: 6 }, { len: 18, r: 14, dir: 225 }, { len: 6 }, { len: 18, r: 14, dir: 135 }, { len: 6 }, { len: 18, r: 14, dir: 315 }, { len: 12 }] },
  { name: "Corkscrew", score: 3.65, R: 3, lesson: "A bend whose direction turns as you ride it: torsion, which no road on our ground has. Hold the lean and turn the stick round with it.",
    segs: [{ len: 15 }, { len: 60, r: 13, dir: 0, twist: 3 }, { len: 15 }] },
  { name: "Narrow", score: 4.61, R: 2.2, lesson: "The same tricks on a track two-thirds as wide.",
    segs: [{ len: 12 }, { len: 22, r: 12, dir: 300 }, { len: 8 }, { len: 22, r: 12, dir: 120 }, { len: 8 }, { len: 30, r: 13, dir: 30, twist: 4 }, { len: 12 }] },
  { name: "Helix", score: 4.73, R: 2, lesson: "A long corkscrew, the bend's direction going right round: keep the stick on the circle.",
    segs: [{ len: 12 }, { len: 90, r: 11, dir: 90, twist: 5.5 }, { len: 12 }] },
  { name: "Tailspin", score: 5.22, R: 2, lesson: "Everything at once, tighter, and the twist the other way. The cat's tail is earning its keep.",
    segs: [{ len: 10 }, { len: 18, r: 10, dir: 0 }, { len: 18, r: 10, dir: 200, twist: -6 }, { len: 6 }, { len: 22, r: 11, dir: 70 }, { len: 26, r: 12, dir: 250, twist: 7 }, { len: 10 }] },
];
