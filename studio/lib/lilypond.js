// lilypond.js — a studio score, written out as LilyPond for clef to engrave.
//
// A score here is a list of notes as WRITTEN (onset and length in beats, the
// spelling the composer used). Sheet music is a stricter thing: each staff is
// one or two VOICES, and each voice is a gapless run of notes, chords and rests
// whose lengths are notatable values that do not cross a barline without a tie.
// This file is that translation, and nothing else:
//
//   hands     right hand above middle C, left below — except lines tagged as
//             inner parts ('ost', 'tenor'), which stay in the left hand;
//   voices    at most two per staff. Notes struck together with the same
//             length are one chord; a note that cannot fit in either voice
//             shortens the note before it (the pedal holds the sound anyway —
//             the page shows the attack, the pedal the resonance);
//   rhythm    lengths split at barlines with ties, and on the beat within a
//             bar, so a note never hides a downbeat;
//   marks     key changes, tempi, section names over the staff, dynamics from
//             each section's loudness, and \arpeggio on rolled chords.
//
// The selftest parses the result with clef's own parser and checks every note
// comes back at the right time and pitch.

const Q = 8;                                  // onsets snap to 1/8 of a beat
const snap = (x) => Math.round(x * Q) / Q;

const VALUES = [                              // [beats, lily, alignment within the bar]
  [4, '1', 4], [3, '2.', 1], [2, '2', 2], [1.5, '4.', 0.5], [1, '4', 0.5],
  [0.75, '8.', 0.25], [0.5, '8', 0.5], [0.25, '16', 0.25], [0.125, '32', 0.125],
];

/** 'F#5' -> "fis''" (absolute octaves: c is the C below middle C). */
export function lilyPitch(name) {
  const r = /^([A-G])(#|b)?(-?\d)$/.exec(name);
  if (!r) throw new Error(`bad note ${name}`);
  const k = Number(r[3]) - 3;
  return r[1].toLowerCase() + (r[2] === '#' ? 'is' : r[2] === 'b' ? 'es' : '') + (k > 0 ? "'".repeat(k) : ','.repeat(-k));
}

/** Split `len` beats starting `pos` beats into its bar into notatable pieces. */
function pieces(pos, len) {
  const out = [];
  while (len > 1e-6) {
    const inBar = pos % 4;
    const room = 4 - inBar;
    const on = (x, al) => Math.abs(x / al - Math.round(x / al)) < 1e-6;
    // a value must start AND end on its own grid, so r8 e4 r8, never r8 e8.~e16
    const v = VALUES.find(([b, , al]) => b <= len + 1e-6 && b <= room + 1e-6 && on(inBar, al) && on(inBar + b, al))
      || VALUES[VALUES.length - 1];
    out.push(v);
    pos += v[0]; len -= v[0];
  }
  return out;
}

function assignVoices(notes) {
  // Two fixed voices: 0 is the upper (stems up), 1 the lower. A note goes to
  // the upper voice unless it is busy, or unless it sits below what the upper
  // voice is sounding at that moment.
  const voices = [[], []];
  const end = (v) => (v.length ? v.at(-1).on + v.at(-1).dur : 0);
  const low = (c) => Math.min(...c.notes.map((n) => n.midi));
  const high = (c) => Math.max(...c.notes.map((n) => n.midi));
  const sorted = [...notes].sort((a, b) => a.on - b.on || b.dur - a.dur || b.midi - a.midi);
  for (const nt of sorted) {
    const joined = voices.find((v) => v.length && v.at(-1).on === nt.on && v.at(-1).dur === nt.dur);
    if (joined) { joined.at(-1).notes.push(nt); continue; }
    const free = [0, 1].filter((k) => end(voices[k]) <= nt.on + 1e-6);
    let k;
    if (free.length === 2) k = 0;
    else if (free.length === 1) {
      k = free[0];
      // below a note still sounding in the upper voice? then it is the lower part
      if (k === 0 && voices[1].length && nt.midi > high(voices[1].at(-1))) k = 0;
    } else {
      const same = voices.find((v) => v.at(-1).on === nt.on);
      if (same) { const c = same.at(-1); c.dur = Math.min(c.dur, nt.dur); c.notes.push(nt); continue; }
      // both busy: the pedal holds what the page lets go
      k = end(voices[0]) <= end(voices[1]) ? 0 : 1;
      const last = voices[k].at(-1);
      last.dur = nt.on - last.on;
    }
    // keep the parts from crossing where it is cheap to: a note placed in the
    // upper voice below a note the lower voice is still sounding swaps down
    if (k === 0 && voices[1].length && end(voices[1]) > nt.on && nt.midi < low(voices[1].at(-1)) && end(voices[1]) <= nt.on) k = 1;
    voices[k].push({ on: nt.on, dur: nt.dur, notes: [nt] });
  }
  return voices[1].length ? voices : [voices[0]];
}

function dynamicFor(vel) {
  return vel < 0.2 ? '\\pp' : vel < 0.27 ? '\\p' : vel < 0.34 ? '\\mp' : vel < 0.44 ? '\\mf' : '\\f';
}

/**
 * @param piece  { title, subtitle, composer, written, notation }
 *               notation: { bars, keys: [[bar, tonic, mode]], tempos: [[bar, bpm]], sections: [[bar, name]] }
 */
export function toLily({ title, subtitle = '', composer = 'Claude', written, notation }) {
  const total = notation.bars * 4;
  const notes = written.map((n) => {
    const on = snap(n.written ?? n.beat);
    const dur = Math.max(0.25, snap(Math.min(n.dur, total - on)));
    const hand = n.tag === 'ost' || n.tag === 'tenor' ? 'l' : n.midi >= 60 ? 'r' : 'l';
    return { on, dur, midi: n.midi, name: n.name, hand, vel: n.vel };
  }).filter((n) => n.on < total);

  // Dynamics: one per section, from the loudest quarter of that section's attacks.
  const secStart = notation.sections.map(([bar]) => (bar - 1) * 4);
  const dynAt = new Map();
  notation.sections.forEach(([bar], k) => {
    const a = (bar - 1) * 4, b = secStart[k + 1] ?? total;
    const vs = notes.filter((n) => n.on >= a && n.on < b).map((n) => n.vel).sort((x, y) => y - x);
    if (vs.length) dynAt.set(a, dynamicFor(vs[Math.floor(vs.length / 4)]));
  });

  const barHead = (bar, voiceIdx, staff) => {
    let s = '';
    const key = notation.keys.find(([b]) => b === bar);
    if (key) s += `\\key ${key[1]} \\${key[2]} `;
    if (staff === 'r' && voiceIdx === 0) {
      const tempo = notation.tempos.find(([b]) => b === bar);
      if (tempo) s += `\\tempo 4 = ${tempo[1]} `;
    }
    return s;
  };

  // Bars where a staff's lower voice is silent get \\oneVoice in the upper, so
  // a single line has normal stems instead of all-up ones.
  let lowerBars = new Set();
  const emitVoice = (chords, voiceIdx, staff) => {
    const rest = voiceIdx === 0 ? 'r' : 's';
    const out = [];
    let cursor = 0;
    let usedDyn = new Set();
    const put = (text) => out.push(text);
    const barOf = (beat) => Math.floor(beat / 4) + 1;
    const emit = (pos, len, what, extra = () => '') => {
      const ps = pieces(pos, len);
      let p = pos;
      ps.forEach(([b, lily], i) => {
        if (p % 4 === 0) {
          if (p > 0) put('|\n');
          put(barHead(barOf(p), voiceIdx, staff));
          if (voiceIdx === 0 && lowerBars.size) put(lowerBars.has(barOf(p)) ? '\\voiceOne ' : '\\oneVoice ');
          if (staff === 'r' && voiceIdx === 0) {
            const sec = notation.sections.find(([bar]) => bar === barOf(p));
            if (sec) put(`\\mark "${sec[1]}" `);
          }
        }
        put(what(lily, i, ps.length) + (i === 0 ? extra() : '') + ' ');
        p += b;
      });
    };
    for (const c of chords) {
      if (c.on > cursor + 1e-6) emit(cursor, c.on - cursor, (lily) => rest + lily);
      const ps = [...new Set(c.notes.slice().sort((a, b) => a.midi - b.midi).map((n) => lilyPitch(n.name)))];
      const body = ps.length === 1 ? ps[0] : `<${ps.join(' ')}>`;
      emit(c.on, c.dur, (lily, i, n) => body + lily + (i < n - 1 ? '~' : ''), () => {
        let x = '';
        if (staff === 'r' && voiceIdx === 0) {
          for (const [at, d] of dynAt) if (!usedDyn.has(at) && at <= c.on && c.on < at + 16) { x += d; usedDyn.add(at); break; }
        }
        return x;
      });
      cursor = c.on + c.dur;
    }
    if (cursor < total) emit(cursor, total - cursor, (lily) => rest + lily);
    put('\\bar "|."');
    return out.join('').replace(/ +\n/g, '\n');
  };

  const staff = (hand, clef) => {
    const vs = assignVoices(notes.filter((n) => n.hand === hand));
    const head = `\\clef ${clef} \\time 4/4 `;
    lowerBars = new Set();
    if (vs.length <= 1) return `{ ${head}\n${emitVoice(vs[0] || [], 0, hand)}\n}`;
    for (const c of vs[1]) for (let bar = Math.floor(c.on / 4) + 1; bar <= Math.floor((c.on + c.dur - 1e-6) / 4) + 1; bar++) lowerBars.add(bar);
    return `{ ${head}\n<<\n{\n${emitVoice(vs[0], 0, hand)}\n}\n\\\\\n{\n${emitVoice(vs[1], 1, hand)}\n}\n>>\n}`;
  };

  return `\\version "2.24.0"
% ${title} — generated from studio/${title.toLowerCase()}/score.js by studio/tools/lily.mjs.
% Do not edit by hand: change the score and regenerate.

\\header {
  title = "${title}"
  subtitle = "${subtitle}"
  composer = "${composer}"
  tagline = "studio.mino.mobi"
}

\\score {
  \\new PianoStaff <<
    \\new Staff = "up" ${staff('r', 'treble')}
    \\new Staff = "down" ${staff('l', 'bass')}
  >>
  \\layout { }
  \\midi { }
}
`;
}
