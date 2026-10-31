// city.js — the city, read off the score. Pure data; no drawing.
//
// World units: x in BEATS along the street, y in FLOORS up from the quay, one
// floor per semitone (E2 is the ground floor). A note is a window at (its beat,
// its pitch). Bar b is building b: eight columns of windows, one per eighth
// note, as tall as the highest note in the bar plus a roof. Notes below E2 are
// under the city: they light the lamps along the quay instead.

import { written, sec, BARS } from './score.js';
import { hash } from '../lib/paint.js';

export const GROUND = 40;                  // E2: floor 0
const KEY = new Set([1, 3, 5, 6, 8, 10, 0]);   // D-flat major (and B-flat minor): the notes that belong

export const ROOFS = ['flat', 'tank', 'setback', 'spire', 'dome', 'pitched', 'setback', 'flat'];

export function buildCity() {
  const buildings = [];
  for (let b = 1; b <= BARS; b++) {
    const start = (b - 1) * 4;
    const notes = written.filter((n) => {
      const on = n.written ?? n.beat;
      return on >= start && on < start + 4 && n.midi >= GROUND;
    });
    const top = notes.length ? Math.max(...notes.map((n) => n.midi - GROUND)) : 6;
    const floors = Math.max(8, top + 1);
    const roofKind = ROOFS[Math.floor(hash(b, 17) * ROOFS.length)];
    const extra = roofKind === 'flat' ? 1 : 2 + Math.floor(hash(b, 23) * 4);   // floors above the music
    const windows = new Map();
    for (const n of notes) {
      const on = n.written ?? n.beat;
      const col = Math.min(7, Math.floor((on - start) * 2 + 1e-6));
      const floor = n.midi - GROUND;
      const key = `${col}:${floor}`;
      const at = sec(n.beat);
      // a window struck twice keeps its first light
      if (!windows.has(key) || windows.get(key).at > at) {
        windows.set(key, { col, floor, at, cool: !KEY.has(n.midi % 12), vel: n.vel, tag: n.tag });
      }
    }
    buildings.push({
      bar: b, x0: start + 0.12, x1: start + 4 - 0.12, start,
      floors, extra, roofKind,
      tone: hash(b, 5),                      // a little variety in the ink wash
      windows: [...windows.values()].sort((a, c) => a.at - c.at),
      // the pen draws each building in the eight beats before its bar, so the
      // city is always being drawn a little ahead of the music
      ...(() => { const from = sec(Math.max(0, start - 8)); return { drawFrom: from, drawTo: Math.max(from + 1.8, sec(Math.max(0, start - 0.5))) }; })(),
    });
  }
  const lamps = written.filter((n) => n.midi < GROUND).map((n) => ({
    x: n.written ?? n.beat, at: sec(n.beat), bar: Math.floor((n.written ?? n.beat) / 4) + 1, deep: n.midi < 30,
  }));
  return { buildings, lamps, width: BARS * 4, tallest: Math.max(...buildings.map((b) => b.floors + b.extra)) };
}

/** Column centre in world x. */
export const colX = (bld, col) => bld.start + 0.25 + col * 0.5;

/** Beat at time t: the inverse of the score's tempo map. */
export function beatAt(t) {
  let lo = 0, hi = BARS * 4 + 12;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (sec(mid) < t) lo = mid; else hi = mid; }
  return lo;
}
