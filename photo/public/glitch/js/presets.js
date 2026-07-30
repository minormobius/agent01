// presets.js — starting points, not destinations.
//
// The reason good glitch art looks layered is that it *is* layered: three to
// six operators, each aimed somewhere different. Each preset below is just a
// recipe — the same object the URL carries and the stack editor edits — so
// loading one and then dragging a slider is the intended workflow, not a
// fallback for when the presets don't fit.

import { defaults, defaultField } from './glitch.js';

const L = (op, params = {}, field = null, opts = {}) => ({
  op,
  on: true,
  amount: opts.amount ?? 1,
  seed: opts.seed ?? 0,
  field: field
    ? { ...defaultField(field.type), ...field, params: { ...defaultField(field.type).params, ...(field.params || {}) } }
    : defaultField('all'),
  params: { ...defaults(op), ...params },
});

export const PRESETS = [
  {
    name: 'databend',
    note: 'the real thing: bytes hit inside a JPEG scan, plus the fringing of a signal that has been through something',
    recipe: {
      seed: 'rust',
      ops: [
        L('jpeg', { quality: 38, hits: 26, mode: 'bit flip', drift: 0.2 }),
        L('shift', { spread: 5, angle: 0, curve: 0.2 }, null, { amount: 0.7 }),
        L('blocks', { quality: 30, damage: 0.12, mode: 'dc drift', drift: 40 },
          { type: 'noise', params: { scale: 6, lo: 0.55, hi: 0.75 } }),
      ],
    },
  },
  {
    name: 'tape',
    note: 'a cassette that has been watched too many times: tracking wander, colour lagging behind, the head switch tearing the bottom',
    recipe: {
      seed: 'vhs-84',
      ops: [
        L('vhs', { jitter: 9, coherence: 10, chromaLag: 7, headSwitch: 0.05, dropouts: 0.2 }),
        L('ntsc', { phase: 12, drift: 2, lumaBW: 2, chromaBW: 11, crosstalk: 1.1 }, null, { amount: 0.8 }),
        L('slice', { axis: 'rows', count: 40, shift: 12, wrap: true },
          { type: 'noise', params: { scale: 4, lo: 0.6, hi: 0.72 } }, { amount: 0.9 }),
      ],
    },
  },
  {
    name: 'broadcast',
    note: 'analogue television doing its worst — rainbow moiré where the luma is busy, ghosts from a signal that bounced',
    recipe: {
      seed: 'uhf',
      ops: [
        L('ntsc', { phase: 60, drift: 7, lumaBW: 1, chromaBW: 6, crosstalk: 1.6 }),
        L('echo', { taps: 3, delay: 30, decay: 0.5, angle: 0 }, null, { amount: 0.6 }),
        L('bits', { plane: 2, mode: 'xor', channel: 'all', grain: 0.7 }, null, { amount: 0.35 }),
      ],
    },
  },
  {
    name: 'sorted horizon',
    note: 'pixel sorting kept to the bright half of the picture, so the sky smears and the ground stays put',
    recipe: {
      seed: 'asdf',
      ops: [
        L('sort', { axis: 'rows', key: 'brightness', lo: 0.45, hi: 1, maxRun: 400 },
          { type: 'luma', params: { lo: 0.5, hi: 1 } }),
        L('shift', { spread: 3, angle: 90 }, null, { amount: 0.5 }),
      ],
    },
  },
  {
    name: 'bloom',
    note: 'datamosh: invented motion vectors applied over and over until the picture flows out of itself',
    recipe: {
      seed: 'p-frame',
      ops: [
        L('mosh', { steps: 16, strength: 14, swirl: 0.65, block: 16, decay: 0.95 }),
        L('blocks', { quality: 22, damage: 0.45, mode: 'dc drift', drift: 70 },
          { type: 'edges', params: { gain: 2, spread: 8 } }, { amount: 0.8 }),
        L('shift', { spread: 6, angle: 20, curve: -0.3 }, null, { amount: 0.5 }),
      ],
    },
  },
  {
    name: 'tear',
    note: 'the frame slipping sideways in bands, with the predictor smearing whatever it catches',
    recipe: {
      seed: 'hsync',
      ops: [
        L('slice', { axis: 'rows', count: 18, shift: 90, bias: 0.2, wrap: true },
          { type: 'bands', params: { count: 9, duty: 0.45, soft: 0 } }),
        L('unfilter', { mode: 'sub', rate: 0.5, bleed: 0.6 },
          { type: 'bands', params: { count: 9, duty: 0.45, soft: 0.02, phase: 0.5 } }),
        L('stride', { skew: 0.6, roll: 0 }, null, { amount: 0.35 }),
      ],
    },
  },
  {
    name: 'melt',
    note: 'PNG predictors integrating downward until the image runs like wet ink',
    recipe: {
      seed: 'paeth',
      ops: [
        L('unfilter', { mode: 'up', rate: 0.6, bleed: 0.9 },
          { type: 'gradient', params: { angle: 90, lo: 0.25, hi: 0.95 } }),
        L('sort', { axis: 'columns', key: 'brightness', lo: 0.2, hi: 0.7, maxRun: 160 }, null, { amount: 0.8 }),
      ],
    },
  },
  {
    name: 'dead memory',
    note: 'a bit plane gone bad — the picture survives as posterised continents in a field of sand',
    recipe: {
      seed: '0xdead',
      ops: [
        L('bits', { plane: 6, mode: 'xor', channel: 'green', grain: 0.2 },
          { type: 'noise', params: { scale: 10, lo: 0.45, hi: 0.6 } }),
        L('posterize', { levels: 5, dither: 0.8, matrix: '4×4', palette: 'none' }, null, { amount: 0.7 }),
        L('slice', { axis: 'columns', count: 60, shift: 14 }, null, { amount: 0.6 }),
      ],
    },
  },
  {
    name: 'printout',
    note: 'four colours, a hard dither, and paper feeding crooked',
    recipe: {
      seed: 'lp0',
      ops: [
        L('posterize', { levels: 3, dither: 1, matrix: '8×8', palette: 'teletext' }),
        L('slice', { axis: 'rows', count: 90, shift: 8, bias: 0.6, wrap: false },
          { type: 'noise', params: { scale: 3, lo: 0.5, hi: 0.62 } }),
        L('unfilter', { mode: 'mixed', rate: 0.15, bleed: 0.5 }, null, { amount: 0.6 }),
      ],
    },
  },
  {
    name: 'soft rot',
    note: 'restrained: compression eating the shadows, colour drifting a little, nothing you could name',
    recipe: {
      seed: 'patina',
      ops: [
        L('blocks', { quality: 28, damage: 0.3, mode: 'coarsen' },
          { type: 'luma', params: { lo: 0, hi: 0.35 } }),
        L('shift', { spread: 2.5, angle: 135, curve: 0.4 }, null, { amount: 0.6 }),
        L('echo', { taps: 1, delay: 12, decay: 0.4 }, { type: 'edges', params: { gain: 3, spread: 4 } }, { amount: 0.5 }),
      ],
    },
  },
];

export const presetByName = (name) => PRESETS.find((p) => p.name === name);
