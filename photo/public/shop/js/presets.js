// presets.js — starting points, not destinations.
//
// Every preset is just a stack: the same entries the editor writes when you add
// effects by hand, so loading one and taking it apart is the intended way to
// learn what the registry can do. Nothing here is a special case in the engine.
//
// They are also the argument for putting the four toolboxes in one stack — half
// of these reach across two or three of them, which is exactly the picture you
// could not make in /glass, /glitch or /lens alone.

const fx = (id, params = {}, extra = {}) => ({ fx: id, on: true, amount: 1, seed: 0, params, field: { type: 'all', params: {}, invert: false, paintMul: false }, ...extra });

/** A field spec, for presets that aim an effect rather than applying it flat. */
const field = (type, params = {}, invert = false) => ({ field: { type, params, invert, paintMul: false } });

export const PRESETS = [
  {
    name: 'cyanotype',
    note: 'The blueprint process: one pigment, wide tonal range, paper grain. A gradient map does the whole job — brightness re-mapped onto Prussian blue — and the grain sells the paper.',
    stack: [
      fx('adjust:mono', { r: 0.3, g: 0.6, b: 0.1, tint: '#ffffff', strength: 1 }),
      fx('adjust:levels', { channel: 'rgb', inLo: 0.05, inHi: 0.95, gamma: 1.1, outLo: 0, outHi: 1 }),
      fx('adjust:gradientMap', { shadow: '#04203f', mid: '#2a6ea8', high: '#e8f2f7', strength: 1 }),
      fx('filter:grain', { amount: 0.18, size: 1.5, chroma: 0, shadowBias: true }),
      fx('filter:vignette', { amount: 0.35, radius: 0.7, feather: 0.6, roundness: 1, color: '#0a1c2e' }),
    ],
  },
  {
    name: 'risograph',
    note: 'Two spot inks, coarse screen, deliberate misregistration. The aberration is doing the misregistration — a real riso drifts because the drum and the paper never quite agree.',
    stack: [
      fx('adjust:posterize', { levels: 5 }),
      fx('filter:halftone', { mode: 'cmyk', cell: 4, angle: 45, sharpness: 3, ink: '#000000', paper: '#f7f3e8' }),
      fx('filter:aberration', { lateral: 0, offset: 1.6, angle: 20 }),
      fx('adjust:hsl', { range: 'all', hue: 0, sat: 0.25, light: 0.05 }),
    ],
  },
  {
    name: 'wet plate',
    note: 'Collodion: blue-blind emulsion (so skies blow out and skin goes dark), heavy local contrast, and the edge falloff of an uncoated brass lens.',
    stack: [
      fx('adjust:mono', { r: 0.1, g: 0.35, b: 1.1, tint: '#f2e6cf', strength: 1 }),
      fx('filter:clarity', { amount: 0.45, radius: 40 }),
      fx('adjust:contrast', { brightness: -0.02, contrast: 0.22, pivot: 0.45 }),
      fx('filter:blur', { mode: 'zoom', radius: 6, angle: 0, cx: 0.5, cy: 0.5, steps: 16 }, field('radial', { cx: 0.5, cy: 0.5, radius: 0.35, feather: 0.5 }, true)),
      fx('filter:grain', { amount: 0.3, size: 2, chroma: 0, shadowBias: true }),
      fx('filter:vignette', { amount: 0.6, radius: 0.6, feather: 0.7, roundness: 1, color: '#100c06' }),
    ],
  },
  {
    name: 'tiny planet',
    note: 'z ↦ exp(z), the conformal one — the whole frame rolled into a ball with every face and doorway still the right shape. /lens measures K = 1 for it; nothing else in a filter menu can say that.',
    stack: [
      fx('lens:polar', { mode: 'roll up', spread: 0.44, twist: 0, rotate: 0, zoom: 1, edge: 'mirror' }),
      fx('filter:sharpen', { amount: 0.4, radius: 1.2, threshold: 0.02 }),
      fx('adjust:vibrance', { amount: 0.3, skin: true }),
    ],
  },
  {
    name: 'VHS dub',
    note: 'Third-generation tape: chroma bandwidth gone, head-switching noise at the bottom, dropouts. Seeded, so the same dub comes back — which real tape never managed.',
    stack: [
      fx('glitch:ntsc', {}),
      fx('glitch:vhs', {}),
      fx('filter:blur', { mode: 'motion', radius: 2, angle: 0, cx: 0.5, cy: 0.5, steps: 8 }),
      fx('filter:grain', { amount: 0.12, size: 1, chroma: 0.6, shadowBias: false }),
    ],
  },
  {
    name: 'cathedral',
    note: 'The stained-glass projection, cut from twelfth-century stock, then lit from behind. The bloom is what makes it read as glass rather than as a mosaic: light spilling through, not paint sitting on top.',
    stack: [
      fx('cut:glass', { pieces: 700, compactness: 20, iterations: 8, lead: 2, leadColor: '#141014', palette: 'chartres' }),
      fx('filter:bloom', { threshold: 0.55, radius: 30, strength: 0.7, tint: '#ffe6b0' }),
      fx('adjust:contrast', { brightness: -0.05, contrast: 0.15, pivot: 0.5 }),
    ],
  },
  {
    name: 'sorted sky',
    note: 'Pixel sort, but only where the picture is bright — the brightness field aims it at the sky and the source survives byte for byte everywhere else. The whole argument for "where is separate from what", in one preset.',
    stack: [
      fx('glitch:sort', { axis: 'columns', key: 'brightness', lo: 0.45, hi: 1, maxRun: 400, reverse: false, byMask: false },
        field('luma', { lo: 0.55, hi: 1 })),
      fx('adjust:vibrance', { amount: 0.25, skin: false }),
    ],
  },
  {
    name: 'droste',
    note: 'The picture inside itself, forever, on a logarithmic spiral. Conformal, so the recursion keeps its shape all the way down instead of smearing at the join.',
    stack: [
      fx('lens:droste', { edge: 'tile' }),
      fx('filter:clarity', { amount: 0.3, radius: 25 }),
    ],
  },
  {
    name: 'kodachrome',
    note: 'The slide-film look done as a curve, not a colour cast: shoulder in the highlights, toe in the shadows, reds pushed and cyans held back.',
    stack: [
      fx('adjust:curves', { channel: 'rgb', curve: [[0, 0.02], [0.25, 0.2], [0.5, 0.52], [0.75, 0.82], [1, 0.98]] }),
      fx('adjust:hsl', { range: 'reds', hue: -4, sat: 0.22, light: 0 }),
      fx('adjust:hsl', { range: 'cyans', hue: 6, sat: -0.15, light: -0.03 }),
      fx('adjust:temperature', { temp: 0.12, tint: -0.04 }),
      fx('filter:grain', { amount: 0.08, size: 1, chroma: 0.15, shadowBias: true }),
    ],
  },
  {
    name: 'ink & wash',
    note: 'Kuwahara flattens the interiors into brush strokes while keeping edges sharp; Sobel then draws the lines on top. Two filters that would each look like a gimmick alone.',
    stack: [
      fx('filter:kuwahara', { radius: 4 }),
      fx('filter:edges', { mode: 'outline', gain: 1.4, angle: 135, invert: true }, { amount: 0.55 }),
      fx('adjust:levels', { channel: 'rgb', inLo: 0.08, inHi: 0.92, gamma: 1, outLo: 0, outHi: 1 }),
    ],
  },
  {
    name: 'dot matrix',
    note: 'Two levels, one Bayer matrix, no grey anywhere — every apparent tone is spatial. Zoom in and there is nothing but black and white.',
    stack: [
      fx('adjust:contrast', { brightness: 0, contrast: 0.2, pivot: 0.5 }),
      fx('filter:dither', { mode: 'ordered', levels: 2, matrix: '8', mono: true }),
    ],
  },
  {
    name: 'melted',
    note: 'A bulge where the picture is brightest, a spiral everywhere else, then the glass cut over the top. Three tools, one stack — the reason this page exists.',
    stack: [
      fx('lens:bulge', { edge: 'mirror' }),
      fx('lens:spiral', { edge: 'mirror' }, { amount: 0.6 }),
      fx('cut:mosaic', { bands: 14, saturate: 1.3 }, { amount: 0.5 }),
      fx('filter:sharpen', { amount: 0.5, radius: 1.5, threshold: 0.01 }),
    ],
  },
];

export const presetByName = (name) => PRESETS.find((p) => p.name === name);
