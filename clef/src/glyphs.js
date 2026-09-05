// glyphs.js — the notation typeface, as SVG path data.
//
// Real engraving uses a SMuFL music font (Bravura, Petaluma, Emmentaler). We
// ship none: a font is a network request that can fail, a licence to carry, and
// ~400 KB for the dozen glyphs a score actually needs. So the glyphs are drawn
// here as outlines, in a coordinate system where **1 unit = 1 staff space** —
// the same unit engravers reason in, which is why every offset in engrave.js
// reads as a musical quantity rather than a pixel count.
//
// Conventions, held by every glyph:
//   • +y is DOWN (SVG native). "Above the staff" is negative.
//   • The origin sits at the glyph's REGISTRATION POINT, not its bounding box:
//     a notehead registers at its left edge, vertically centred on the line or
//     space it occupies; a clef registers on the staff line it names; an
//     accidental registers at its left edge on the pitch it alters.
//   • `w` is the advance width — how much horizontal room the glyph claims.
//
// Anything with a hole (hollow noteheads) declares `rule: 'evenodd'`. Glyphs
// built from overlapping strokes (sharps, naturals) rely on nonzero, which is
// the default, and is why they can be written as four plain quadrilaterals
// instead of one error-prone outline.

/** A rotated ellipse as four cubic segments — the basis of every notehead. */
function ellipse(cx, cy, rx, ry, deg = 0) {
  const k = 0.5522847498307936; // circle-to-bezier constant
  const t = (deg * Math.PI) / 180;
  const cos = Math.cos(t);
  const sin = Math.sin(t);
  const at = (x, y) => [cx + x * cos - y * sin, cy + x * sin + y * cos];
  const f = (n) => (Math.round(n * 10000) / 10000).toString();
  const pt = (p) => `${f(p[0])},${f(p[1])}`;
  const P = [at(rx, 0), at(0, ry), at(-rx, 0), at(0, -ry)];
  const C = [
    [at(rx, ry * k), at(rx * k, ry)],
    [at(-rx * k, ry), at(-rx, ry * k)],
    [at(-rx, -ry * k), at(-rx * k, -ry)],
    [at(rx * k, -ry), at(rx, -ry * k)],
  ];
  return `M${pt(P[0])}`
    + C.map((c, i) => `C${pt(c[0])} ${pt(c[1])} ${pt(P[(i + 1) % 4])}`).join('')
    + 'Z';
}

/** A quadrilateral, for the straight-edged parts of accidentals. */
const quad = (a, b, c, d) => `M${a[0]},${a[1]}L${b[0]},${b[1]}L${c[0]},${c[1]}L${d[0]},${d[1]}Z`;

// ------------------------------------------------------------- noteheads --
// Notehead proportions follow engraving practice: one staff space tall, a shade
// under 1.2 wide, tilted about 20° so consecutive seconds can sit side by side
// without their stems colliding.
const HEAD_RX = 0.62;
const HEAD_RY = 0.36;
const HEAD_TILT = -21;

const blackHead = ellipse(HEAD_RX, 0, HEAD_RX, HEAD_RY, HEAD_TILT);
const halfHead = blackHead + ellipse(HEAD_RX, 0, 0.44, 0.158, HEAD_TILT - 4);
// The semibreve is wider, barely tilted, and its counter is nearly upright —
// that steep inner ellipse is the whole reason a whole note reads as a whole
// note at a glance rather than as a fat half note. It has to be generous: a
// mean little slit of a counter reads as a black notehead with a scratch on it.
const wholeHead = ellipse(0.82, 0, 0.82, 0.40, 0)
  + ellipse(0.82, 0, 0.50, 0.235, -72);
const breveHead = wholeHead
  + quad([-0.14, -0.52], [-0.02, -0.52], [-0.02, 0.52], [-0.14, 0.52])
  + quad([1.66, -0.52], [1.78, -0.52], [1.78, 0.52], [1.66, 0.52]);

// ----------------------------------------------------------------- flags --
// One flag glyph, drawn for an up-stem and mirrored for a down-stem. Multiple
// flags are the same glyph repeated down the stem, so 16ths and 32nds need no
// extra outlines — engrave.js stacks them.
const flagUp =
  'M0,0C0.62,0.36 1.14,0.94 1.08,1.66C1.05,1.96 0.92,2.18 0.74,2.32'
  + 'C1.00,1.68 0.86,1.18 0.34,0.82C0.22,0.74 0.10,0.68 0,0.64Z';

// ----------------------------------------------------------- accidentals --
// Four overlapping quadrilaterals, unioned by the nonzero winding rule. The
// two verticals are offset from each other vertically and the two crossbars
// slant up to the right — both are what stop a sharp reading as a hash mark.
const sharp =
  quad([0.22, -1.10], [0.36, -1.14], [0.36, 1.14], [0.22, 1.18])
  + quad([0.62, -1.24], [0.76, -1.28], [0.76, 1.00], [0.62, 1.04])
  + quad([0.02, -0.30], [0.96, -0.58], [0.96, -0.26], [0.02, 0.02])
  + quad([0.02, 0.52], [0.96, 0.24], [0.96, 0.56], [0.02, 0.84]);

const flat =
  'M0.10,-1.86L0.28,-1.90L0.28,-0.34'
  + 'C0.60,-0.66 1.00,-0.44 0.98,0.02'
  + 'C0.96,0.44 0.62,0.72 0.16,1.00L0.10,0.94'
  + 'C0.52,0.62 0.72,0.30 0.66,0.02'
  + 'C0.60,-0.24 0.40,-0.22 0.10,0.10Z';

const natural =
  quad([0.16, -1.34], [0.30, -1.34], [0.30, 0.84], [0.16, 0.84])
  + quad([0.62, -0.48], [0.76, -0.48], [0.76, 1.34], [0.62, 1.34])
  + quad([0.16, -0.18], [0.76, -0.44], [0.76, -0.14], [0.16, 0.12])
  + quad([0.16, 0.54], [0.76, 0.28], [0.76, 0.58], [0.16, 0.84]);

// The double sharp is a squat saltire — four arms meeting at a small square.
const dblSharp = (() => {
  const a = 0.52, t = 0.16, o = 0.52;
  return `M${o - a},${-a}L${o - a + t},${-a}L${o},${-t}L${o + a - t},${-a}L${o + a},${-a}`
    + `L${o + a},${-a + t}L${o + t},${0}L${o + a},${a - t}L${o + a},${a}`
    + `L${o + a - t},${a}L${o},${t}L${o - a + t},${a}L${o - a},${a}`
    + `L${o - a},${a - t}L${o - t},${0}L${o - a},${-a + t}Z`;
})();

const dblFlat = flat + flat.replace(/(-?\d+\.?\d*),(-?\d+\.?\d*)/g,
  (_, x, y) => `${(Number(x) + 0.74).toFixed(2)},${y}`);

// ----------------------------------------------------------------- rests --
// Whole and half rests are the same block; what distinguishes them is which
// side of the staff line it touches, so they register at that line.
const wholeRest = quad([0, 0], [1.28, 0], [1.28, 0.56], [0, 0.56]);
const halfRest = quad([0, -0.56], [1.28, -0.56], [1.28, 0], [0, 0]);

// The quarter rest: a zigzag of three strokes closing into a hook. Drawn as a
// stroked path rather than an outline — the modulation a filled version would
// give is not worth ninety hand-placed control points.
const quarterRest = {
  stroke: 'M0.62,-1.44C0.36,-1.02 0.08,-0.80 0.08,-0.50'
    + 'C0.08,-0.20 0.52,-0.02 0.52,0.26'
    + 'C0.52,0.52 0.14,0.60 0.14,0.60'
    + 'C0.48,0.52 0.82,0.72 0.82,1.06'
    + 'C0.82,1.26 0.72,1.42 0.58,1.52',
  width: 0.22,
};

/** Eighth-and-shorter rests: a slanted stroke hung with `n` teardrop hooks. */
function flagRest(n) {
  const parts = [];
  const top = -0.55 - (n - 1) * 0.78;
  parts.push({
    stroke: `M0.72,${(top + 0.10).toFixed(2)}C0.60,${(top + 0.90).toFixed(2)} `
      + `0.34,${(top + n * 0.78 + 0.55).toFixed(2)} 0.14,${(top + n * 0.78 + 0.98).toFixed(2)}`,
    width: 0.17,
  });
  for (let k = 0; k < n; k++) {
    const y = top + k * 0.78;
    parts.push({
      fill: ellipse(0.24, y + 0.10, 0.25, 0.20, -18)
        + `M0.34,${(y - 0.06).toFixed(2)}C0.52,${(y - 0.10).toFixed(2)} `
        + `0.70,${(y - 0.02).toFixed(2)} 0.78,${(y + 0.10).toFixed(2)}`
        + `L0.72,${(y + 0.24).toFixed(2)}C0.62,${(y + 0.10).toFixed(2)} `
        + `0.48,${(y + 0.06).toFixed(2)} 0.32,${(y + 0.12).toFixed(2)}Z`,
    });
  }
  return parts;
}

// ----------------------------------------------------------------- clefs --
//
// The G clef registers on the line its spiral encircles (the second line up,
// G4 in treble). It is drawn as a stroked path — a spiral, a crossing loop, and
// a descending tail — because a stroked spline is a *stable* way to draw a
// spiral: nudging one control point moves the curve, where in a filled outline
// it puts a kink in an edge that has to be matched on the way back.
const gClef = [
  {
    stroke:
      // Top hook, down through the loop, round the crossing, into the spiral.
      'M1.06,-3.62C0.55,-3.20 0.30,-2.62 0.34,-2.00'
      + 'C0.38,-1.32 0.80,-0.78 1.22,-0.28'
      + 'C1.72,0.32 2.06,0.86 2.02,1.52'
      + 'C1.98,2.10 1.60,2.52 1.10,2.52'
      + 'C0.62,2.52 0.28,2.16 0.28,1.72'
      + 'C0.28,1.32 0.58,1.02 0.96,1.02'
      + 'C1.30,1.02 1.54,1.26 1.54,1.58'
      + 'C1.54,1.86 1.34,2.06 1.08,2.06',
    width: 0.24,
  },
  {
    stroke:
      // The long axis: up out of the spiral, through the loop, down the tail.
      'M1.06,-3.62C1.34,-2.90 1.46,-2.14 1.46,-1.30'
      + 'C1.46,-0.10 1.22,1.06 0.98,2.12'
      + 'C0.78,3.02 0.70,3.58 0.94,3.94'
      + 'C1.14,4.24 1.56,4.24 1.74,3.98',
    width: 0.22,
  },
  {
    // The loop that crosses the staff, and the terminal hook below it.
    stroke:
      'M1.46,-1.30C1.90,-1.02 2.24,-0.56 2.24,0.02'
      + 'C2.24,0.72 1.72,1.20 1.06,1.20',
    width: 0.20,
  },
];

// The F clef: a comma-shaped bowl whose flat side rests on the F line, plus the
// two dots that straddle it. The dots are what identify the line, so they are
// placed from the same origin rather than measured off the bowl.
const fClef = [
  {
    fill:
      'M0.28,-1.28C0.90,-1.36 1.62,-1.06 1.86,-0.46'
      + 'C2.10,0.16 1.86,0.94 1.34,1.52'
      + 'C0.92,1.98 0.36,2.30 -0.14,2.46'
      + 'L-0.24,2.26C0.30,2.00 0.86,1.56 1.14,1.00'
      + 'C1.42,0.44 1.44,-0.22 1.16,-0.62'
      + 'C0.98,-0.88 0.66,-1.00 0.42,-0.90'
      + 'C0.62,-0.76 0.72,-0.54 0.66,-0.32'
      + 'C0.58,-0.02 0.28,0.14 0.00,0.06'
      + 'C-0.28,-0.02 -0.44,-0.32 -0.36,-0.62'
      + 'C-0.30,-0.94 0.00,-1.24 0.28,-1.28Z',
  },
  { fill: ellipse(2.28, -0.50, 0.17, 0.17) + ellipse(2.28, 0.50, 0.17, 0.17) },
];

// The C clef: a thick and a thin bar, then two mirrored lobes that pinch at the
// line the clef names — which is why it registers dead centre and why the lobes
// are authored once and reflected, rather than drawn twice and left to drift.
const cLobe =
  'M0.62,-2.00'
  + 'C1.45,-1.98 2.22,-1.68 2.48,-1.08'
  + 'C2.72,-0.50 2.36,-0.02 1.88,-0.02'
  + 'C1.58,-0.02 1.40,-0.22 1.40,-0.48'
  + 'C1.40,-0.80 1.64,-0.98 1.90,-0.92'
  + 'C1.74,-1.24 1.30,-1.42 0.62,-1.44'
  + 'Z';
/** Reflect a path in the horizontal axis — the lower lobe from the upper one. */
const mirrorY = (d) => d.replace(/(-?\d*\.?\d+),(-?\d*\.?\d+)/g,
  (_, x, y) => `${x},${(-Number(y)).toFixed(2)}`);

const cClef = [
  { fill: quad([0, -2.0], [0.30, -2.0], [0.30, 2.0], [0, 2.0]) },
  { fill: quad([0.42, -2.0], [0.54, -2.0], [0.54, 2.0], [0.42, 2.0]) },
  { fill: cLobe + mirrorY(cLobe) },
];

// ------------------------------------------------------------ ornaments ---
const fermata = [
  { stroke: 'M-0.90,0C-0.90,-1.05 0.90,-1.05 0.90,0', width: 0.16 },
  { fill: ellipse(0, -0.28, 0.17, 0.17) },
];
const accent = { stroke: 'M-0.62,-0.36L0.62,0L-0.62,0.36', width: 0.16 };
const marcato = { stroke: 'M-0.42,0.42L0,-0.42L0.42,0.42', width: 0.16 };
const tenuto = { stroke: 'M-0.46,0L0.46,0', width: 0.13 };
const staccato = { fill: ellipse(0, 0, 0.16, 0.16) };
const staccatissimo = { fill: 'M-0.16,-0.42L0.16,-0.42L0.06,0.30L-0.06,0.30Z' };
const trillMark = { text: 'tr', italic: true, size: 1.5 };

/**
 * The brace that binds a piano staff — built to a height rather than stored as
 * a glyph. A brace is the one mark on the page whose proportions are not fixed:
 * scaling a stored outline to span two staves would stretch its waist into a
 * ribbon. So it is drawn as a stroked spline whose pen width is constant and
 * whose waist stays put wherever the two staves happen to fall.
 */
export function bracePath(top, bottom, x, sp) {
  const h = bottom - top;
  const mid = (top + bottom) / 2;
  const belly = sp * 0.95;
  const waist = sp * 0.10;
  const p = (px, py) => `${(x + px).toFixed(2)},${py.toFixed(2)}`;
  return `M${p(0, top)}`
    + `C${p(-belly, top + h * 0.16)} ${p(waist + belly * 0.15, mid - h * 0.13)} ${p(waist, mid)}`
    + `C${p(waist + belly * 0.15, mid + h * 0.13)} ${p(-belly, bottom - h * 0.16)} ${p(0, bottom)}`;
}

// ------------------------------------------------------------ the table ---
// Each entry is a list of parts. A part is `{fill}` (a filled outline) or
// `{stroke, width}` (a centreline plus a pen width) or `{text,...}`.
export const GLYPHS = {
  noteheadBlack: { parts: [{ fill: blackHead }], w: 1.24, headWidth: 1.24 },
  noteheadHalf: { parts: [{ fill: halfHead, rule: 'evenodd' }], w: 1.24, headWidth: 1.24 },
  noteheadWhole: { parts: [{ fill: wholeHead, rule: 'evenodd' }], w: 1.64, headWidth: 1.64 },
  noteheadBreve: { parts: [{ fill: breveHead, rule: 'evenodd' }], w: 1.92, headWidth: 1.64 },

  flag: { parts: [{ fill: flagUp }], w: 1.1 },

  accidentalSharp: { parts: [{ fill: sharp }], w: 1.10 },
  accidentalFlat: { parts: [{ fill: flat }], w: 1.00 },
  accidentalNatural: { parts: [{ fill: natural }], w: 0.96 },
  accidentalDoubleSharp: { parts: [{ fill: dblSharp }], w: 1.14 },
  accidentalDoubleFlat: { parts: [{ fill: dblFlat }], w: 1.74 },

  restWhole: { parts: [{ fill: wholeRest }], w: 1.28 },
  restHalf: { parts: [{ fill: halfRest }], w: 1.28 },
  restQuarter: { parts: [quarterRest], w: 1.00 },
  rest8: { parts: flagRest(1), w: 1.00 },
  rest16: { parts: flagRest(2), w: 1.00 },
  rest32: { parts: flagRest(3), w: 1.10 },
  rest64: { parts: flagRest(4), w: 1.10 },

  // The G clef is authored at whatever size drew cleanly and then registered
  // here: `t` shifts its spiral eye onto the origin (which IS the G line — that
  // is what the clef means) and scales the whole figure to the ~6.5 staff
  // spaces a treble clef occupies. Doing it here rather than by editing sixty
  // control points keeps the authored curve editable.
  gClef: { parts: gClef, w: 2.5, t: { dy: -1.55, s: 0.82 } },
  fClef: { parts: fClef, w: 2.7 },
  cClef: { parts: cClef, w: 3.1 },

  fermata: { parts: fermata, w: 1.8 },
  accent: { parts: [accent], w: 1.3 },
  marcato: { parts: [marcato], w: 1.0 },
  tenuto: { parts: [tenuto], w: 1.0 },
  staccato: { parts: [staccato], w: 0.4 },
  staccatissimo: { parts: [staccatissimo], w: 0.4 },
  portato: { parts: [tenuto, { fill: ellipse(0, 0.44, 0.16, 0.16) }], w: 1.0 },
  trill: { parts: [trillMark], w: 1.4 },
  dot: { parts: [{ fill: ellipse(0, 0, 0.2, 0.2) }], w: 0.5 },
};

// Articulations that have no glyph of their own reuse a near neighbour rather
// than vanishing — a stopped note marked with a plus is better served by a
// marcato than by silence.
const ARTIC_ALIAS = {
  staccato: 'staccato', accent: 'accent', tenuto: 'tenuto',
  staccatissimo: 'staccatissimo', marcato: 'marcato', portato: 'portato',
  fermata: 'fermata', shortfermata: 'fermata', longfermata: 'fermata',
  trill: 'trill', prall: 'trill', mordent: 'trill', turn: 'trill',
  prallmordent: 'trill', prallprall: 'trill', downprall: 'trill', upprall: 'trill',
  lineprall: 'trill', prallup: 'trill', pralldown: 'trill', downmordent: 'trill',
  upmordent: 'trill', reverseturn: 'trill',
  espressivo: 'accent', stopped: 'marcato', open: 'staccato',
  upbow: 'marcato', downbow: 'tenuto', thumb: 'staccato', flageolet: 'staccato',
};

export function articGlyph(name) {
  return ARTIC_ALIAS[name] ?? null;
}

/**
 * Render a glyph to SVG markup.
 *
 * `sp` is the size of one staff space in user units — every glyph is authored
 * against a staff space, so this one number scales the entire typeface.
 */
export function glyphSVG(name, x, y, sp, opts = {}) {
  const g = GLYPHS[name];
  if (!g) return '';
  const cls = opts.class ? ` class="${opts.class}"` : '';
  const extra = opts.attrs ? ` ${opts.attrs}` : '';
  const sx = (opts.scaleX ?? 1) * sp;
  const sy = (opts.scaleY ?? 1) * sp;
  const t = g.t
    ? ` scale(${g.t.s ?? 1}) translate(${g.t.dx ?? 0},${g.t.dy ?? 0})`
    : '';
  const body = g.parts.map((p) => {
    if (p.text) {
      return `<text x="0" y="0" font-size="${p.size ?? 1}"`
        + ` font-family="Georgia,'Times New Roman',serif"`
        + `${p.italic ? ' font-style="italic"' : ''} text-anchor="middle">${p.text}</text>`;
    }
    if (p.stroke) {
      // The pen width is quoted in staff spaces like everything else, and the
      // group's scale carries it into user units — so a clef stays a clef at
      // any zoom instead of turning spidery or blobby.
      return `<path d="${p.stroke}" fill="none" stroke="currentColor"`
        + ` stroke-width="${p.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    return `<path d="${p.fill}" fill="currentColor"${p.rule ? ` fill-rule="${p.rule}"` : ''}/>`;
  }).join('');
  return `<g transform="translate(${x.toFixed(2)},${y.toFixed(2)}) scale(${sx.toFixed(4)},${sy.toFixed(4)})${t}"${cls}${extra}>${body}</g>`;
}

/** Advance width of a glyph, in user units. */
export function glyphWidth(name, sp) {
  return (GLYPHS[name]?.w ?? 1) * sp;
}

export const NOTEHEAD_WIDTH = HEAD_RX * 2;
