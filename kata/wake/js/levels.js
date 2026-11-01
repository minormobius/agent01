/* WAKE's courses, hand made, getting harder (the selftest holds them to rising, to the oracle getting round, and the
   stored par and difficulty to the oracle's). Positions are in the start's frame: [ahead, right, ana] metres from the
   lake's middle (lake.js place()); the boat sets off at `start` heading ahead. Round the buoys in order: pass within
   GATE (3.5 m) of each. boat: triad (steady), catamaran (fast, tender in w). */
export const LEVELS = [
  { name: "Cast off", boat: "triad", par: 21.7, score: 0.7, lesson: "The stick is the rudder: right turns right, up turns ana. Throttle on the right (or E and Q). Head for the gold buoy; the diamond on the gauge is where it lies.",
    start: [-65, 0, 0], buoys: [[-38, 0, 0], [-10, 6, 0], [18, 18, 0], [45, 26, 0]] },
  { name: "Round the island", boat: "triad", par: 29.6, score: 1.46, lesson: "An island in the way. Go round it, buoy by buoy, and watch your wake fan out behind you: a V, Kelvin's.",
    start: [-65, 0, 0], islands: [{ c: [0, 0, 0], r: 13, h: 3 }], buoys: [[-38, -12, 0], [-8, -26, 0], [22, -22, 0], [34, 4, 0], [14, 28, 0]] },
  { name: "Into w", boat: "triad", par: 25, score: 2.83, lesson: "The next buoy isn't in your slice: it's ana. Push the stick up and the bow turns into w. The buoy's marker says how far out of the slice it is.",
    start: [-65, 0, 0], buoys: [[-40, 0, 0], [-16, 0, 10], [8, 0, 22], [34, 0, 16], [55, 0, 0]] },
  { name: "Every way", boat: "triad", par: 29.5, score: 3.18, lesson: "Right, ana, left, kata: buoys in every direction across your bow.",
    start: [-65, 0, 0], buoys: [[-40, 12, 0], [-16, 12, 14], [6, -10, 20], [30, -16, 0], [52, 0, -16]] },
  { name: "Ana, kata", boat: "triad", par: 32, score: 3.3, lesson: "Back and forth across w. Your wake, cut by your slice, stops being a V.",
    start: [-65, 0, 0], buoys: [[-42, 0, 10], [-18, 0, -10], [6, 0, 10], [30, 0, -10], [54, 0, 6]] },
  { name: "Catamaran", boat: "catamaran", par: 32.5, score: 3.48, lesson: "Two hulls: fast, and steady across, but only just steady in w. Turn left and right as hard as you like; into w, ease off or she goes over. The gold dot is your heel.",
    start: [-65, 0, 0], buoys: [[-40, 16, 0], [-14, -16, 0], [12, 14, 0], [36, 0, 10], [58, 0, 20]] },
  { name: "Archipelago", boat: "triad", par: 37.4, score: 3.63, lesson: "Islands in all four directions. Thread them.",
    start: [-65, 0, 0], islands: [{ c: [-24, 14, 6], r: 9, h: 3 }, { c: [0, -12, -8], r: 10, h: 4 }, { c: [24, 10, 14], r: 9, h: 2.5 }, { c: [-2, 22, -14], r: 8, h: 3 }],
    buoys: [[-44, -4, -6], [-18, -6, 18], [8, 18, 0], [24, -14, 8], [48, 6, -10]] },
  { name: "Tender in w", boat: "catamaran", par: 43.1, score: 4.34, lesson: "The catamaran again, and this time the course goes ana and kata. Throttle back before every turn into w.",
    start: [-65, 0, 0], buoys: [[-42, 0, 0], [-20, 0, 16], [2, 0, -6], [24, 0, 16], [48, 0, -4]] },
];
