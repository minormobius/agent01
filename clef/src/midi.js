// midi.js — write a Standard MIDI File.
//
// A score you cannot get out of the page is a score you do not own. LilyPond
// source is the primary export (it is the document), but MIDI is what every
// other piece of music software on earth can open, so it is the bridge out:
// import a piece here, edit it, take it to a DAW or a notation editor.
//
// Format 1, one track per staff, PPQ 960 — the same tick resolution the rest of
// this codebase counts in, so nothing is requantised on the way out and a
// triplet stays an exact triplet.

import { PPQ, WHOLE } from './model.js';

/** General MIDI program numbers for the patches the preview offers. */
export const GM_PROGRAM = {
  piano: 0, harpsichord: 6, musicbox: 10, organ: 19, strings: 48, flute: 73, sine: 80,
};

/** MIDI's variable-length quantity: 7 bits per byte, high bit = "more follows". */
function vlq(n) {
  const out = [n & 0x7f];
  let v = n >> 7;
  while (v > 0) { out.unshift((v & 0x7f) | 0x80); v >>= 7; }
  return out;
}

const bytes = (...b) => b.flat();
const be32 = (n) => [(n >> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const be16 = (n) => [(n >> 8) & 255, n & 255];
const ascii = (s) => [...s].map((c) => c.charCodeAt(0));

function chunk(id, data) {
  return bytes(ascii(id), be32(data.length), data);
}

function textEvent(type, s) {
  const d = ascii(String(s).slice(0, 250));
  return bytes([0x00, 0xff, type], vlq(d.length), d);
}

/**
 * Build a .mid file from a parsed score.
 *
 * `flat` is the output of scoreToNotes — already tie-merged, which matters:
 * two tied quarters must leave as one half-note-long MIDI note, not as two
 * notes with an audible seam.
 */
export function writeMidi(score, flat, opts = {}) {
  const program = GM_PROGRAM[opts.patch] ?? 0;
  const staffCount = Math.max(1, score.staves.length);
  const bpm = opts.bpm ?? score.tempo?.bpm ?? 84;
  const unit = opts.unit ?? score.tempo?.unit ?? WHOLE / 4;
  // MIDI tempo is microseconds per QUARTER note; `\tempo 2 = 60` means a half
  // note per second, which is 120 quarters per minute, not 60.
  const quartersPerMinute = bpm * (unit / (WHOLE / 4));
  const usPerQuarter = Math.round(60000000 / Math.max(1, quartersPerMinute));

  const tracks = [];

  // Track 0 carries the conductor data: title, tempo, metre, key.
  {
    const ev = [];
    if (score.title) ev.push(...textEvent(0x03, score.title));
    if (score.composer) ev.push(...textEvent(0x01, `composer: ${score.composer}`));
    ev.push(0x00, 0xff, 0x51, 0x03, (usPerQuarter >> 16) & 255, (usPerQuarter >> 8) & 255, usPerQuarter & 255);
    const firstTime = findFirst(score, 'time');
    if (firstTime) {
      // The denominator is stored as a power of two: 4 -> 2, 8 -> 3.
      const dd = Math.round(Math.log2(firstTime.den));
      const clocksPerBeat = firstTime.den >= 8 && firstTime.num % 3 === 0 ? 36 : 24;
      ev.push(0x00, 0xff, 0x58, 0x04, firstTime.num, dd, clocksPerBeat, 8);
    }
    const firstKey = findFirst(score, 'key');
    if (firstKey) ev.push(0x00, 0xff, 0x59, 0x02, firstKey.fifths & 255, 0x00);
    ev.push(0x00, 0xff, 0x2f, 0x00);
    tracks.push(chunk('MTrk', ev));
  }

  for (let si = 0; si < staffCount; si++) {
    const channel = si % 16 === 9 ? 10 % 16 : si % 16; // skip channel 10 (drums)
    const notes = flat.notes.filter((n) => n.staff === si);
    const ev = [];
    ev.push(...textEvent(0x03, score.staves[si]?.name || `Staff ${si + 1}`));
    ev.push(0x00, 0xc0 | channel, program & 0x7f);

    // Interleave note-ons and note-offs in absolute-tick order, then convert
    // to deltas in one pass — building deltas as you go is how off-by-one
    // timing bugs get into MIDI writers.
    const points = [];
    for (const n of notes) {
      const vel = Math.max(1, Math.min(127, Math.round((n.velocity ?? 0.72) * 127)));
      points.push({ tick: n.tick, order: 1, data: [0x90 | channel, n.midi & 0x7f, vel] });
      points.push({ tick: n.tick + Math.max(1, n.ticks - 8), order: 0, data: [0x80 | channel, n.midi & 0x7f, 0x40] });
    }
    points.sort((a, b) => a.tick - b.tick || a.order - b.order);
    let last = 0;
    for (const p of points) {
      ev.push(...vlq(Math.max(0, p.tick - last)), ...p.data);
      last = p.tick;
    }
    ev.push(...vlq(0), 0xff, 0x2f, 0x00);
    tracks.push(chunk('MTrk', ev));
  }

  const header = chunk('MThd', bytes(be16(1), be16(tracks.length), be16(PPQ)));
  const all = new Uint8Array(header.length + tracks.reduce((a, t) => a + t.length, 0));
  all.set(header, 0);
  let off = header.length;
  for (const t of tracks) { all.set(t, off); off += t.length; }
  return all;
}

function findFirst(score, kind) {
  for (const st of score.staves) {
    for (const v of st.voices) {
      for (const e of v) if (e.kind === kind) return e;
    }
  }
  return null;
}
