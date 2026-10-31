// handref.js — reference measurements of real hands, for hand.js and checkHands.
//
// Two sources, both of adults:
//
//  BONES  Buryanov A. & Kotiuk V. (2010) Proportions of hand segments. Int. J. Morphol.
//         28(3):755–758, Table I. X-rays of 66 adults' right hands: each bone's length
//         between joints, and the soft tissue beyond the last bone (mm, mean ± SD).
//         https://scielo.conicyt.cl/pdf/ijmorphol/v28n3/art15.pdf
//
//  HANDS  Hsiao H. et al. (2015) Firefighter hand anthropometry and structural glove
//         sizing: a new perspective. Hum. Factors 57(8):1359–1377, Table 2. 855 men and
//         88 women (mm, mean ± SD). Digit lengths run from the crotch (the web) to the tip;
//         breadths are taken across the first joint past the palm (the thumb's IP joint,
//         each finger's middle knuckle).
//         https://pmc.ncbi.nlm.nih.gov/articles/PMC4681492/
//
// ANSUR II (lib/ansur2.js) has hand length, breadth and palm length but no digit.

export const BONES = {
  //        metacarpal       proximal         middle           distal           tip (soft tissue)
  thumb: { m: [46.22, 3.94], pp: [31.57, 3.13], pm: null, pd: [21.67, 1.6], tip: [5.67, 0.61] },
  index: { m: [68.12, 6.27], pp: [39.78, 4.94], pm: [22.38, 2.51], pd: [15.82, 2.26], tip: [3.84, 0.59] },
  middle: { m: [64.6, 5.38], pp: [44.63, 3.81], pm: [26.33, 3.0], pd: [17.4, 1.85], tip: [3.95, 0.61] },
  ring: { m: [58.0, 5.06], pp: [41.37, 3.87], pm: [25.65, 3.29], pd: [17.3, 2.22], tip: [3.95, 0.6] },
  pinky: { m: [53.69, 4.36], pp: [32.74, 2.77], pm: [18.11, 2.54], pd: [15.96, 2.45], tip: [3.73, 0.62] },
};

export const HANDS = {
  men: { n: 855, handLength: [197.6, 9.3], handBreadth: [97.2, 4.6], palmLength: [113.8, 5.8],
    length: { thumb: [70.8, 4.3], index: [75.8, 4.4], middle: [83.8, 4.6], ring: [79.6, 4.5], pinky: [65.2, 4.3] },
    breadth: { thumb: [24.4, 1.6], index: [22.7, 1.6], middle: [22.4, 1.7], ring: [21.7, 1.6], pinky: [19.8, 1.5] } },
  women: { n: 88, handLength: [182.7, 8.7], handBreadth: [87.4, 4.2], palmLength: [104.0, 5.7],
    length: { thumb: [64.8, 4.1], index: [71.3, 4.2], middle: [78.6, 4.5], ring: [74.0, 4.5], pinky: [60.4, 4.3] },
    breadth: { thumb: [21.5, 1.5], index: [20.5, 1.2], middle: [20.3, 1.3], ring: [19.4, 1.2], pinky: [17.5, 1.2] } },
};

const DIGITS = ['thumb', 'index', 'middle', 'ring', 'pinky'];
const mean = (a, b) => (a + b) / 2;

/** A digit's bones from its knuckle (MCP) to its tip, soft tissue included, in mm. */
export const reach = (d) => { const b = BONES[d]; return b.pp[0] + (b.pm ? b.pm[0] : 0) + b.pd[0] + b.tip[0]; };

/** Derived ratios, the numbers hand.js is built from and checkHands holds it to. */
export const RATIO = {
  // each digit's bones + tip, against the middle finger's
  reach: Object.fromEntries(DIGITS.map((d) => [d, reach(d) / reach('middle')])),
  // each bone's share of its digit (the last bone carries the tip)
  share: Object.fromEntries(DIGITS.map((d) => { const b = BONES[d], L = reach(d); return [d, b.pm ? [b.pp[0] / L, b.pm[0] / L, (b.pd[0] + b.tip[0]) / L] : [b.pp[0] / L, (b.pd[0] + b.tip[0]) / L]]; })),
  // the thumb's metacarpal (hidden in the palm's thenar pad), against the middle finger's reach
  thumbMetacarpal: BONES.thumb.m[0] / reach('middle'),
  // each digit's breadth against the index finger's: men and women averaged
  breadth: Object.fromEntries(DIGITS.map((d) => [d, mean(HANDS.men.breadth[d][0] / HANDS.men.breadth.index[0], HANDS.women.breadth[d][0] / HANDS.women.breadth.index[0])])),
  // the index finger's breadth, and the hand's (across the knuckles), against hand length
  indexBreadth: mean(HANDS.men.breadth.index[0] / HANDS.men.handLength[0], HANDS.women.breadth.index[0] / HANDS.women.handLength[0]),
  handBreadth: mean(HANDS.men.handBreadth[0] / HANDS.men.handLength[0], HANDS.women.handBreadth[0] / HANDS.women.handLength[0]),
};
