#!/usr/bin/env node
// shovel-mark.mjs — a deterministic woodcut-style mark: a garden shovel crossed with a quill,
// after the masthead Selene drew for The Delvetown Shovel. No randomness except a seeded PRNG
// for the small irregularities of a hand-cut block, so the same seed always gives the same bytes.
//
//   node shelf/shovel-mark.mjs [--seed N] [--out file.svg] [--ink #1b1712] [--red #a23b2a] [--paper #f3ead8]
//   node shelf/shovel-mark.mjs --selftest
//
// Written by Morphyx, 2026-10-18. The look is the editor's to take, change or leave.
import { writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function mulberry32(a) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const f = (x) => (Math.round(x * 100) / 100).toString();
const P = (pts) => pts.map(([x, y], i) => (i ? 'L' : 'M') + f(x) + ' ' + f(y)).join(' ');

export function mark({ seed = 1, ink = '#1b1712', red = '#a23b2a', paper = '#f3ead8', size = 512 } = {}) {
  const rnd = mulberry32(seed);
  const j = (s) => (rnd() - 0.5) * s;          // a gouge's wobble
  const C = 256;                                  // drawn on a 512 grid, scaled by viewBox
  const out = [];

  // Roundel: paper disc, a heavy rule and a thin one, like a printer's border.
  out.push(`<circle cx="${C}" cy="${C}" r="248" fill="${paper}"/>`);
  out.push(`<circle cx="${C}" cy="${C}" r="236" fill="none" stroke="${ink}" stroke-width="10"/>`);
  out.push(`<circle cx="${C}" cy="${C}" r="220" fill="none" stroke="${ink}" stroke-width="2.5"/>`);
  // A clod of turned earth at the foot, three short cuts under it.
  for (let k = 0; k < 3; k++) {
    const y = 420 + k * 11, w = 44 - k * 13;
    out.push(`<path d="${P([[C - w + j(3), y + j(1.5)], [C + w + j(3), y + j(1.5)]])}" stroke="${ink}" stroke-width="${4 - k}" stroke-linecap="round" fill="none"/>`);
  }

  // ---- Shovel, drawn upright along x=0 (top = grip), then rotated to lean right.
  const sh = [];
  // D-grip
  sh.push(`<path d="M -26 -196 L 26 -196 Q 30 -196 30 -190 L 30 -178 Q 30 -172 24 -170 L 9 -164 L 9 -150 L -9 -150 L -9 -164 L -24 -170 Q -30 -172 -30 -178 L -30 -190 Q -30 -196 -26 -196 Z M -18 -188 L 18 -188 L 18 -178 L -18 -178 Z" fill="${ink}" fill-rule="evenodd"/>`);
  // shaft with woodgrain cuts
  sh.push(`<rect x="-8" y="-152" width="16" height="200" fill="${ink}"/>`);
  for (let y = -140; y < 40; y += 15) sh.push(`<path d="${P([[-3 + j(2), y], [-1 + j(2), y + 9]])}" stroke="${paper}" stroke-width="1.6" stroke-linecap="round"/>`);
  // collar
  sh.push(`<path d="M -13 44 L 13 44 L 16 70 L -16 70 Z" fill="${ink}"/>`);
  // blade (garden spade: shoulders, then a rounded point), brick red with hatch
  const blade = 'M -16 68 Q -44 70 -46 82 L -44 150 Q -40 196 0 214 Q 40 196 44 150 L 46 82 Q 44 70 16 68 Z';
  sh.push(`<path d="${blade}" fill="${red}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`);
  sh.push(`<clipPath id="bl${seed}"><path d="${blade}"/></clipPath>`);
  const hatch = [];
  for (let x = -40; x <= 40; x += 8) hatch.push(P([[x + j(1.5), 92 + Math.abs(x) * 0.2], [x + j(1.5), 206 - Math.abs(x) * 0.9]]));
  sh.push(`<path d="${hatch.join(' ')}" stroke="${ink}" stroke-width="1.4" opacity="0.55" clip-path="url(#bl${seed})" fill="none"/>`);
  sh.push(`<path d="M 0 76 L 0 200" stroke="${ink}" stroke-width="3" fill="none"/>`);   // spine
  sh.push(`<path d="M -36 84 Q -34 78 -24 78" stroke="${paper}" stroke-width="3" fill="none" stroke-linecap="round"/>`); // highlight

  // ---- Quill, drawn upright (top = plume tip), rotated to lean left.
  const q = [];
  const L = 400, top = -205, nib = top + L;
  // vane outline: wide asymmetric feather, left side broader
  const vl = [], vr = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24, y = top + t * (L * 0.72);
    const w = Math.sin(Math.PI * Math.pow(t, 0.7)) ;
    vl.push([-62 * w + j(1.2), y]); vr.push([38 * w + j(1.2), y]);
  }
  const vane = P([...vl, ...vr.reverse()]) + ' Z';
  q.push(`<path d="${vane}" fill="${paper}" stroke="${ink}" stroke-width="4.5" stroke-linejoin="round"/>`);
  // barbs: woodcut strokes sweeping up from the rachis, with two notches in the vane
  const barbs = [];
  const notch = new Set([7, 15]);
  for (let i = 1; i < 34; i++) {
    const t = i / 34, y = top + 6 + t * (L * 0.68);
    const w = Math.sin(Math.PI * Math.pow(t, 0.7));
    if (notch.has(i)) continue;
    barbs.push(P([[-2, y], [-60 * w * (0.9 + j(0.08)), y - 26 * w + j(3)]]));
    barbs.push(P([[2, y], [36 * w * (0.9 + j(0.08)), y - 16 * w + j(3)]]));
  }
  q.push(`<path d="${barbs.join(' ')}" stroke="${ink}" stroke-width="2" stroke-linecap="round" fill="none"/>`);
  // rachis and bare calamus, tapering to a cut nib
  q.push(`<path d="M -1.5 ${top + 4} L 1.5 ${top + 4} L 5 ${nib - 46} L -5 ${nib - 46} Z" fill="${ink}"/>`);
  q.push(`<path d="M -5 ${nib - 48} L 5 ${nib - 48} L 3 ${nib - 6} L 0 ${nib} L -3 ${nib - 6} Z" fill="${red}" stroke="${ink}" stroke-width="2.5" stroke-linejoin="round"/>`);
  q.push(`<path d="M 0 ${nib - 20} L 0 ${nib - 4}" stroke="${ink}" stroke-width="1.5"/>`);  // nib slit

  const lean = 38;
  out.push(`<g transform="translate(${C} ${C - 6}) rotate(${-lean}) scale(0.9)">${q.join('')}</g>`);
  out.push(`<g transform="translate(${C} ${C - 6}) rotate(${lean}) scale(0.9)">${sh.join('')}</g>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}">` +
    `<title>The Delvetown Shovel: a shovel crossed with a quill (seed ${seed})</title>` + out.join('') + `</svg>\n`;
}

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function selftest() {
  const a = mark({ seed: 7 }), b = mark({ seed: 7 }), c = mark({ seed: 8 });
  const ok = [
    ['same seed, same bytes', a === b],
    ['different seed, different cut', a !== c],
    ['no NaN in the geometry', !/NaN|undefined/.test(a + c)],
    ['under 500 KB', Buffer.byteLength(a) < 500_000],
  ];
  for (const [n, v] of ok) console.log((v ? 'ok   ' : 'FAIL ') + n);
  if (ok.some(([, v]) => !v)) process.exit(1);
  console.log('seed 7 sha256/16:', sha(a));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (args.includes('--selftest')) selftest();
  else {
    const svg = mark({ seed: +get('--seed', 1), ink: get('--ink'), red: get('--red'), paper: get('--paper') });
    const out = get('--out');
    if (out) { writeFileSync(out, svg); console.log(out, sha(svg)); } else process.stdout.write(svg);
  }
}
