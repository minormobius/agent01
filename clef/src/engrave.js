// engrave.js — turn a parsed score into engraved SVG.
//
// Engraving is not "draw a note at x". It is a sequence of decisions that
// depend on each other, and the order below is the order they have to be made
// in, because each one needs the last one's answer:
//
//   1. RESOLVE   — walk each voice carrying clef/key/metre state forward, and
//                  decide which notes show an accidental. Accidentals change
//                  horizontal space, so nothing can be measured before this.
//   2. MEASURE   — cut the timeline into bars. Bars, not notes, are what break
//                  across systems.
//   3. COLUMN    — collect every onset tick in a bar into one column shared by
//                  every staff and voice. THIS IS THE LOAD-BEARING IDEA: a
//                  column is why the left hand lines up with the right hand,
//                  and why a triplet in one voice does not shove the other
//                  voice's downbeat sideways.
//   4. SPACE     — give each column a width from the shortest note in it, on a
//                  compressive curve: a half note gets more room than a quarter
//                  but nowhere near twice as much.
//   5. BREAK     — fill systems with bars, then justify each full system by
//                  stretching the springs, never the glyphs.
//   6. DRAW      — stems, beams, ties, slurs, and only then the ink.
//
// Every drawn note carries `data-ev`, an index into the returned event table,
// which is what lets the page map a click on a notehead back to the character
// range in the source that produced it.

import {
  WHOLE, PPQ, staffPos, clefDef, keyAlterations, keySignaturePositions,
  timeTicks, beatGroups, noteValueOrNearest, midiOf, diatonicOf,
} from './model.js';
import { glyphSVG, GLYPHS, articGlyph, bracePath } from './glyphs.js';

// Everything is quoted in staff spaces. One constant sets the size of the page.
const DEFAULTS = {
  staffSpace: 8,
  width: 900,
  marginX: 18,
  marginTop: 16,
  marginBottom: 16,
  staffGap: 9,        // between staves of one system, in staff spaces
  braceGap: 11,       // between staves bound by a brace (piano)
  systemGap: 8,       // between systems
  titleSize: 2.9,     // in staff spaces
  minSystemFill: 0.62, // don't justify a system emptier than this
  // Draw a one-staff score on a grand staff, with an empty partner. See the
  // note where the phantom staff is built.
  grandStaff: true,
};

const STAFF_LINE = 0.11;
const STEM_WIDTH = 0.13;
const BEAM_THICK = 0.5;
const BEAM_SPACING = 0.75;
const STEM_LENGTH = 3.5;
const LEDGER_EXTRA = 0.34;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const r2 = (n) => (Math.round(n * 100) / 100).toString();

// --------------------------------------------------------------- 1. resolve --

/**
 * Walk a voice's events forward, carrying notation state, and decide the things
 * that depend on history rather than on the note itself: which clef it is read
 * in, whether it needs an accidental, whether it is tied to what follows.
 */
function resolveVoice(events, initial) {
  const state = {
    clef: initial.clef, fifths: initial.fifths,
    num: initial.num, den: initial.den, stemDir: 0,
  };
  const items = [];
  const marks = [];      // clef/key/time changes, barlines — staff-level
  let measureAcc = new Map(); // diatonic index -> alter, reset each bar
  let keyAlt = keyAlterations(state.fifths);
  let measureEnd = timeTicks(state.num, state.den);
  let partial = 0;

  const showsAccidental = (p) => {
    const dia = diatonicOf(p);
    const inForce = measureAcc.has(dia) ? measureAcc.get(dia) : (keyAlt.get(p.step) ?? 0);
    if (p.forced) return true;
    return p.alter !== inForce;
  };

  for (const e of events) {
    switch (e.kind) {
      case 'clef': state.clef = e.value; marks.push({ ...e, clef: e.value }); continue;
      case 'key':
        state.fifths = e.fifths;
        keyAlt = keyAlterations(e.fifths);
        measureAcc = new Map();
        marks.push(e);
        continue;
      case 'time':
        state.num = e.num; state.den = e.den;
        measureEnd = e.tick + timeTicks(e.num, e.den);
        marks.push(e);
        continue;
      case 'partial': partial = e.ticks; marks.push(e); continue;
      case 'voicedir':
        // `\voiceOne` / `\voiceTwo` say which way this voice's stems point.
        // They are usually redundant with the voice's position in the source,
        // but when a writer states it they mean it.
        state.stemDir = { voiceOne: 1, voiceThree: 1, voiceTwo: -1, voiceFour: -1, oneVoice: 0 }[e.which] ?? 0;
        marks.push(e);
        continue;
      case 'stemdir': state.stemDir = e.dir; marks.push(e); continue;
      case 'tempo': case 'barline': case 'barcheck': case 'break':
      case 'volta': case 'dynamic': case 'hairpin':
        marks.push(e);
        continue;
      case 'note': case 'rest': break;
      default: continue;
    }

    // A new bar wipes the accidental memory. Bars are found from the running
    // metre rather than from bar lines, because most input has no bar lines in
    // it at all — `|` is a check, and plenty of files omit even that.
    while (e.tick >= measureEnd) {
      measureAcc = new Map();
      measureEnd += timeTicks(state.num, state.den);
    }

    if (e.kind === 'rest') {
      items.push({ ...e, clef: state.clef, num: state.num, den: state.den, stemDir: state.stemDir ?? 0 });
      continue;
    }

    const heads = e.pitches.map((p) => {
      const show = showsAccidental(p);
      if (show || measureAcc.has(diatonicOf(p))) measureAcc.set(diatonicOf(p), p.alter);
      else if (p.alter !== (keyAlt.get(p.step) ?? 0)) measureAcc.set(diatonicOf(p), p.alter);
      return {
        ...p,
        pos: staffPos(p, state.clef),
        midi: midiOf(p) + clefDef(state.clef).sounds,
        accidental: show ? p.alter : null,
        cautionary: p.cautionary,
      };
    });
    heads.sort((a, b) => a.pos - b.pos);
    items.push({ ...e, clef: state.clef, num: state.num, den: state.den, heads, partial, stemDir: state.stemDir ?? 0 });
  }
  return { items, marks, end: state };
}

// --------------------------------------------------------------- 2. measures --

/**
 * Cut the score into bars.
 *
 * Metre changes mid-piece, and an upbeat makes the first bar short, so bar
 * boundaries are computed by walking rather than by dividing. Explicit `\bar`
 * marks decide only how a bar line is DRAWN — where the bars fall is the
 * metre's business.
 */
function buildMeasures(staffData, totalTicks) {
  // The metre map: every time change anywhere, in tick order.
  const changes = [];
  let partial = 0;
  for (const s of staffData) {
    for (const m of s.marks) {
      if (m.kind === 'time') changes.push({ tick: m.tick, num: m.num, den: m.den });
      if (m.kind === 'partial') partial = Math.max(partial, m.ticks);
    }
  }
  changes.sort((a, b) => a.tick - b.tick);
  if (!changes.length || changes[0].tick > 0) changes.unshift({ tick: 0, num: 4, den: 4 });

  const barStyles = new Map();
  const voltas = [];
  for (const s of staffData) {
    for (const m of s.marks) {
      if (m.kind === 'barline') barStyles.set(m.tick, m.style);
      if (m.kind === 'volta') voltas.push(m);
    }
  }

  const measures = [];
  let t = 0;
  let ci = 0;
  let cur = changes[0];
  // An upbeat is a short first bar: it ends where the first full bar would
  // start had the piece begun `partial` earlier.
  if (partial > 0) {
    measures.push({ start: 0, end: partial, num: cur.num, den: cur.den, pickup: true });
    t = partial;
  }
  let guard = 0;
  while (t < totalTicks && guard++ < 20000) {
    while (ci + 1 < changes.length && changes[ci + 1].tick <= t) { ci++; cur = changes[ci]; }
    let len = timeTicks(cur.num, cur.den);
    // A metre change mid-bar truncates the bar it lands in.
    if (ci + 1 < changes.length && changes[ci + 1].tick > t && changes[ci + 1].tick < t + len) {
      len = changes[ci + 1].tick - t;
    }
    measures.push({ start: t, end: t + len, num: cur.num, den: cur.den });
    t += len;
  }
  if (!measures.length) measures.push({ start: 0, end: timeTicks(4, 4), num: 4, den: 4 });

  for (const m of measures) {
    m.barStyle = barStyles.get(m.end) ?? (barStyles.has(m.start) && m.start === 0 ? null : 'single');
    m.openStyle = barStyles.get(m.start) === 'repeat-start' ? 'repeat-start' : null;
  }
  measures[measures.length - 1].barStyle = barStyles.get(measures[measures.length - 1].end) ?? 'final';
  return { measures, voltas };
}

// ------------------------------------------------------- 3 & 4. columns/space --

const QUARTER = WHOLE / 4;

/** How much room a duration earns. Compressive: doubling the note value adds
 *  about 40%, not 100% — which is what keeps a page of half notes from being
 *  mostly paper and a page of sixteenths from being unreadable. */
function spring(ticks, sp) {
  const rel = Math.max(ticks, 1) / QUARTER;
  return sp * 4.0 * Math.pow(rel, 0.48);
}

function accidentalGlyph(alter) {
  return { '-2': 'accidentalDoubleFlat', '-1': 'accidentalFlat', 0: 'accidentalNatural',
    1: 'accidentalSharp', 2: 'accidentalDoubleSharp' }[alter] ?? 'accidentalNatural';
}

function restGlyph(denom) {
  if (denom <= 1) return 'restWhole';
  if (denom === 2) return 'restHalf';
  if (denom === 4) return 'restQuarter';
  if (denom === 8) return 'rest8';
  if (denom === 16) return 'rest16';
  if (denom === 32) return 'rest32';
  return 'rest64';
}

// --------------------------------------------------------------- the engraver --

/**
 * Engrave a parsed score.
 *
 * Returns `{ svg, height, events, systems, warnings }`. `events` is the click
 * map: index -> { src: [start,end], tick, midi[], x, y }.
 */
export function engrave(score, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const sp = o.staffSpace;
  const warnings = [];

  // ---- resolve every voice, and find where the music ends ----
  const staffData = score.staves.map((st, si) => {
    const voices = st.voices.map((v) => resolveVoice(v, { clef: 'treble', fifths: 0, num: 4, den: 4 }));
    return {
      index: si,
      name: st.name,
      voices,
      marks: voices.flatMap((v) => v.marks),
      items: voices.map((v) => v.items),
    };
  });

  // ---- the empty half of a grand staff ----
  //
  // A one-staff score is drawn on a grand staff by default: treble on top, an
  // empty bass staff under it, braced. This is a PRESENTATION choice, not a
  // reading of the source — the source still says one staff, the phantom holds
  // no music, and nothing about it reaches playback or export.
  //
  // Why: piano paper has two staves whether or not the left hand is playing,
  // and a melody floating alone above white space reads as a fragment rather
  // than as a piece. A single-line instrument (a song, a flute part) genuinely
  // wants one staff, which is why this is a switch rather than a law — see
  // `grandStaff` in the options.
  if (o.grandStaff && staffData.length === 1 && score.braced !== false) {
    // It inherits the metre and key so its signature matches, and takes a bass
    // clef unless the real staff is already a bass one — in which case the
    // empty partner belongs above it, in treble.
    const realClef = staffData[0].marks.find((m) => m.kind === 'clef')?.value ?? 'treble';
    const lowReal = clefDef(realClef).middleDia <= clefDef('bass').middleDia;
    const inherited = staffData[0].marks
      .filter((m) => m.kind === 'key' || m.kind === 'time' || m.kind === 'partial')
      .map((m) => ({ ...m }));
    const empty = resolveVoice(
      [{ kind: 'clef', value: lowReal ? 'treble' : 'bass', tick: 0, src: [0, 0] }, ...inherited],
      { clef: 'treble', fifths: 0, num: 4, den: 4 },
    );
    const ghost = {
      index: staffData.length,
      name: '',
      phantom: true,
      voices: [empty],
      marks: empty.marks,
      items: [empty.items],
    };
    if (lowReal) staffData.unshift(ghost); else staffData.push(ghost);
    staffData.forEach((st, i) => { st.index = i; });
  }
  const totalTicks = Math.max(1, ...staffData.flatMap((s) =>
    s.items.flatMap((v) => v.map((e) => e.tick + (e.ticks || 0)))));

  const { measures, voltas } = buildMeasures(staffData, totalTicks);

  // ---- bar checks: the one correctness test the notation itself offers ----
  const barTicks = new Set(measures.map((m) => m.end));
  barTicks.add(0);
  for (const s of staffData) {
    for (const m of s.marks) {
      if (m.kind === 'barcheck' && !barTicks.has(m.tick)) {
        const near = measures.find((x) => x.start <= m.tick && m.tick < x.end);
        warnings.push({
          at: m.src?.[0] ?? 0,
          message: `bar check failed — bar ${near ? measures.indexOf(near) + 1 : '?'} is `
            + `${near ? ((m.tick - near.start) / QUARTER).toFixed(2) : '?'} quarter notes long, `
            + `not ${near ? ((near.end - near.start) / QUARTER).toFixed(2) : '?'}`,
        });
      }
    }
  }

  // ---- clef / key / time in force at the start of each measure, per staff ----
  const staffState = staffData.map((s) => {
    const timeline = [];
    let cur = { clef: 'treble', fifths: 0, num: 4, den: 4 };
    const sorted = [...s.marks].filter((m) => ['clef', 'key', 'time'].includes(m.kind))
      .sort((a, b) => a.tick - b.tick);
    let mi = 0;
    for (const m of measures) {
      while (mi < sorted.length && sorted[mi].tick <= m.start) {
        const x = sorted[mi];
        if (x.kind === 'clef') cur = { ...cur, clef: x.value };
        if (x.kind === 'key') cur = { ...cur, fifths: x.fifths };
        if (x.kind === 'time') cur = { ...cur, num: x.num, den: x.den };
        mi++;
      }
      timeline.push({ ...cur });
    }
    // Mid-bar changes are drawn where they happen rather than at the bar line.
    return { timeline, midBar: sorted.filter((x) => !measures.some((m) => m.start === x.tick)) };
  });

  // ---- columns per measure ----
  const measureLayout = measures.map((m, mi) => {
    const ticks = new Set();
    for (const s of staffData) {
      for (const v of s.items) {
        for (const e of v) if (e.tick >= m.start && e.tick < m.end) ticks.add(e.tick);
      }
    }
    if (!ticks.size) ticks.add(m.start);
    const sorted = [...ticks].sort((a, b) => a - b);

    const columns = sorted.map((tick, i) => {
      const next = i + 1 < sorted.length ? sorted[i + 1] : m.end;
      let minTicks = next - tick;
      let head = sp * 1.3;
      let accWidth = 0;
      let grace = 0;
      let graceCount = 0;
      for (const s of staffData) {
        for (const v of s.items) {
          for (const e of v) {
            if (e.tick !== tick) continue;
            // A grace note takes no time, so it must not shrink the column's
            // duration to nothing; it claims a slice of LEAD space instead, to
            // the left of the beat where it is actually drawn.
            if (e.grace) { grace = Math.max(grace, ++graceCount * sp * 1.05); continue; }
            minTicks = Math.min(minTicks, Math.max(e.ticks, 1));
            const val = noteValueOrNearest(e.written ? WHOLE / e.written.denom : e.ticks);
            if (e.kind === 'note') {
              head = Math.max(head, (GLYPHS[headGlyph(val)]?.w ?? 1.24) * sp);
              const accs = e.heads.filter((h) => h.accidental !== null);
              if (accs.length) {
                accWidth = Math.max(accWidth, accs.length > 1 ? sp * 1.9 : sp * 1.35);
              }
              // Seconds inside a chord stick a notehead out sideways.
              if (e.heads.some((h, k) => k > 0 && h.pos - e.heads[k - 1].pos === 1)) head += sp * 1.1;
            } else {
              head = Math.max(head, (GLYPHS[restGlyph(e.written?.denom ?? 4)]?.w ?? 1.2) * sp);
            }
            if (e.written?.dots) head += sp * 0.45 * e.written.dots;
          }
        }
      }
      const minWidth = accWidth + head + sp * 0.7 + grace;
      return {
        tick, minTicks, minWidth, grace,
        natural: Math.max(minWidth, spring(minTicks, sp)), x: 0,
      };
    });

    // Leading room for the clef/key/time when they are drawn inside this bar.
    return { measure: m, index: mi, columns, lead: 0, width: 0 };
  });

  // ---- how much a measure needs on the left for its clef/key/time ----
  const showAt = (mi) => {
    const need = staffData.map((_, si) => {
      const st = staffState[si].timeline[mi];
      const prev = mi > 0 ? staffState[si].timeline[mi - 1] : null;
      return {
        clef: !prev || prev.clef !== st.clef,
        key: !prev || prev.fifths !== st.fifths,
        time: !prev || prev.num !== st.num || prev.den !== st.den,
        st,
      };
    });
    return need;
  };

  const leadWidth = (need, atSystemStart) => {
    let w = 0;
    for (const n of need) {
      let x = 0;
      if (n.clef || atSystemStart) x += (GLYPHS[clefDef(n.st.clef).glyph]?.w ?? 2.6) * sp + sp * 0.5;
      const nAcc = Math.abs(n.st.fifths);
      if ((n.key || atSystemStart) && nAcc) x += nAcc * sp * 0.92 + sp * 0.5;
      if (n.time) x += sp * 2.2;
      w = Math.max(w, x);
    }
    return w;
  };

  for (const ml of measureLayout) {
    const need = showAt(ml.index);
    ml.need = need;
    ml.leadInner = leadWidth(need.map((n) => ({ ...n, clef: n.clef && ml.index > 0 })), false);
    ml.leadStart = leadWidth(need, true);
    ml.natural = ml.columns.reduce((a, c) => a + c.natural, 0);
    ml.minimum = ml.columns.reduce((a, c) => a + c.minWidth, 0);
  }

  // ---- 5. break into systems ----
  const usable = o.width - o.marginX * 2;
  const systems = [];
  {
    let cur = [];
    let acc = 0;
    const startExtra = (mi) => measureLayout[mi].leadStart + sp * 1.2;
    for (let i = 0; i < measureLayout.length; i++) {
      const ml = measureLayout[i];
      const lead = cur.length === 0 ? startExtra(i) : ml.leadInner;
      const need = lead + ml.natural + sp * 0.9;
      const forced = staffData.some((s) => s.marks.some((m) => m.kind === 'break' && m.tick === ml.measure.start));
      if (cur.length && (acc + need > usable || forced)) {
        systems.push(cur);
        cur = [];
        acc = 0;
      }
      const lead2 = cur.length === 0 ? startExtra(i) : ml.leadInner;
      cur.push(i);
      acc += lead2 + ml.natural + sp * 0.9;
    }
    if (cur.length) systems.push(cur);
  }

  // ---- assign x to every column ----
  const systemInfo = systems.map((mis, si) => {
    let natural = 0;
    let minimum = 0;
    for (let k = 0; k < mis.length; k++) {
      const ml = measureLayout[mis[k]];
      ml.lead = k === 0 ? measureLayout[mis[0]].leadStart + sp * 1.2 : ml.leadInner;
      natural += ml.lead + ml.natural + sp * 0.9;
      minimum += ml.lead + ml.minimum + sp * 0.9;
    }
    const last = si === systems.length - 1;
    // Justify unless this is a final short system, which reads better ragged.
    const stretch = (last && natural < usable * o.minSystemFill)
      ? 1
      : Math.max(0.72, (usable - (natural - naturalSprings(mis))) / Math.max(1, naturalSprings(mis)));
    let x = o.marginX;
    for (let k = 0; k < mis.length; k++) {
      const ml = measureLayout[mis[k]];
      ml.x = x;
      x += ml.lead;
      ml.musicStart = x;
      for (const c of ml.columns) {
        c.x = x;
        x += Math.max(c.minWidth, c.natural * stretch);
      }
      x += sp * 0.9;
      ml.right = x;
      ml.systemIndex = si;
    }
    return { measures: mis, right: x, minimum, natural };
  });

  function naturalSprings(mis) {
    let n = 0;
    for (const mi of mis) for (const c of measureLayout[mi].columns) n += c.natural;
    return n;
  }

  // ---- vertical layout ----
  const staffCount = staffData.length;
  const braced = staffCount > 1 && score.braced !== false;
  const staffStep = (braced ? o.braceGap : o.staffGap) + 4; // 4 spaces of staff + gap
  const systemHeight = (staffCount - 1) * staffStep * sp + 4 * sp;
  const titleH = (score.title ? o.titleSize * sp + sp * 1.2 : 0)
    + (score.composer ? sp * 1.9 : 0) + (score.title || score.composer ? sp * 1.6 : 0);

  const systemTops = [];
  let y = o.marginTop + titleH;
  for (let i = 0; i < systems.length; i++) {
    systemTops.push(y + 5 * sp); // headroom for ledger lines and marks above
    y += systemHeight + o.systemGap * sp + 5 * sp;
  }
  const height = y + o.marginBottom;

  // ---- 6. draw ----
  const out = [];
  const events = [];
  // Hit-test rectangles, one per staff per system. The page needs these to turn
  // a click on blank staff into a PITCH — which requires knowing not just the y
  // but the clef and key in force there, since clicking the top space in G major
  // should give F sharp, not F.
  const regions = [];

  if (score.title) {
    out.push(`<text class="cf-title" x="${r2(o.width / 2)}" y="${r2(o.marginTop + o.titleSize * sp)}"`
      + ` text-anchor="middle" font-size="${r2(o.titleSize * sp)}">${esc(score.title)}</text>`);
  }
  if (score.subtitle) {
    out.push(`<text class="cf-subtitle" x="${r2(o.width / 2)}" y="${r2(o.marginTop + o.titleSize * sp + sp * 1.7)}"`
      + ` text-anchor="middle" font-size="${r2(sp * 1.5)}">${esc(score.subtitle)}</text>`);
  }
  if (score.composer) {
    out.push(`<text class="cf-composer" x="${r2(o.width - o.marginX)}" y="${r2(o.marginTop + titleH - sp * 2.2)}"`
      + ` text-anchor="end" font-size="${r2(sp * 1.55)}">${esc(score.composer)}</text>`);
  }

  const staffY = (si, systemTop) => systemTop + si * staffStep * sp;
  const posY = (top, pos) => top + (2 - pos / 2) * sp; // pos 0 = middle line

  for (let si = 0; si < systems.length; si++) {
    const mis = systems[si];
    const systemTop = systemTops[si];
    const left = measureLayout[mis[0]].x;
    const right = measureLayout[mis[mis.length - 1]].right;

    // staff lines
    for (let st = 0; st < staffCount; st++) {
      const top = staffY(st, systemTop);
      const state = staffState[st].timeline[mis[0]];
      regions.push({
        system: si, staff: st, top, left, right, phantom: !!staffData[st].phantom,
        // The band a click counts as: the staff plus four ledger positions
        // either side, which is as far as anyone reads without an octave mark.
        hitTop: top - 4 * sp, hitBottom: top + 8 * sp,
        clef: state.clef, fifths: state.fifths, sp,
        lastTick: measureLayout[mis[mis.length - 1]].measure.end,
      });
      for (let l = 0; l < 5; l++) {
        out.push(`<line class="cf-staffline" x1="${r2(left)}" y1="${r2(top + l * sp)}" x2="${r2(right)}"`
          + ` y2="${r2(top + l * sp)}" stroke-width="${r2(STAFF_LINE * sp)}"/>`);
      }
    }
    // the system's left edge, and the brace that binds a grand staff
    if (staffCount > 1) {
      const top = staffY(0, systemTop);
      const bot = staffY(staffCount - 1, systemTop) + 4 * sp;
      out.push(`<line class="cf-barline" x1="${r2(left)}" y1="${r2(top)}" x2="${r2(left)}" y2="${r2(bot)}"`
        + ` stroke-width="${r2(0.16 * sp)}"/>`);
      if (braced) {
        out.push(`<path class="cf-brace" d="${bracePath(top, bot, left - sp * 0.55, sp)}" fill="none"`
          + ` stroke-width="${r2(0.28 * sp)}" stroke-linecap="round"/>`);
      }
    }

    for (let k = 0; k < mis.length; k++) {
      const mi = mis[k];
      const ml = measureLayout[mi];
      const atStart = k === 0;

      for (let st = 0; st < staffCount; st++) {
        const top = staffY(st, systemTop);
        const state = staffState[st].timeline[mi];
        const need = ml.need[st];
        let x = ml.x;

        if (need.clef || atStart) {
          const cd = clefDef(state.clef);
          const linePos = (cd.line - 3) * 2; // staff line 1..5 -> position
          out.push(glyphSVG(cd.glyph, x + sp * 0.35, posY(top, linePos), sp, { class: 'cf-clef' }));
          x += (GLYPHS[cd.glyph]?.w ?? 2.6) * sp + sp * 0.4;
        }
        if ((need.key || atStart) && state.fifths !== 0) {
          // `pos` is already in staff positions (half-spaces), the same unit
          // noteheads use — doubling it here put every bass-clef signature an
          // octave low, which looks almost right and is completely wrong.
          for (const a of keySignaturePositions(state.fifths, state.clef)) {
            out.push(glyphSVG(accidentalGlyph(a.alter), x, posY(top, a.pos), sp, { class: 'cf-key' }));
            x += sp * 0.92;
          }
          x += sp * 0.4;
        }
        if (need.time) {
          const cx = x + sp * 0.9;
          out.push(timeSigSVG(state.num, state.den, cx, top, sp));
          x += sp * 2.2;
        }
      }

      // ---- the notes ----
      for (let st = 0; st < staffCount; st++) {
        const top = staffY(st, systemTop);
        const nVoices = staffData[st].items.length;
        for (let vi = 0; vi < nVoices; vi++) {
          const voice = staffData[st].items[vi];
          const inBar = voice.filter((e) => e.tick >= ml.measure.start && e.tick < ml.measure.end);
          if (!inBar.length) continue;
          drawVoice({
            out, events, inBar, ml, top, sp, o, nVoices, vi, st,
            measure: ml.measure, staffCount, voice, systemTop,
          });
        }
      }

      // ---- bar line ----
      const tops = staffData.map((_, s) => staffY(s, systemTop));
      const bottom = staffY(staffCount - 1, systemTop) + 4 * sp;
      const bl = ml.measure.barStyle ?? 'single';
      if (bl !== 'invisible') drawBarline(out, ml.right - sp * 0.35, tops, bottom, bl, sp);
      if (ml.measure.openStyle === 'repeat-start') {
        drawBarline(out, ml.x + sp * 0.1, tops, bottom, 'repeat-start', sp);
      }
    }
  }

  // ---- volta brackets ----
  for (const v of voltas) {
    if (v.phase !== 'start') continue;
    const ml = measureLayout.find((m) => m.measure.start <= v.tick && v.tick < m.measure.end);
    if (!ml) continue;
    const top = systemTops[ml.systemIndex] - sp * 2.6;
    out.push(`<path class="cf-volta" d="M${r2(ml.x)},${r2(top + sp * 1.3)}L${r2(ml.x)},${r2(top)}`
      + `L${r2(ml.right)},${r2(top)}" fill="none" stroke-width="${r2(0.11 * sp)}"/>`
      + `<text class="cf-voltanum" x="${r2(ml.x + sp * 0.4)}" y="${r2(top + sp * 1.1)}"`
      + ` font-size="${r2(sp * 1.1)}">${v.number}.</text>`);
  }

  const svg = `<svg class="cf-score" xmlns="http://www.w3.org/2000/svg" width="${o.width}" height="${r2(height)}"`
    + ` viewBox="0 0 ${o.width} ${r2(height)}">${out.join('')}</svg>`;
  return {
    svg, width: o.width, height, events, regions, warnings,
    measures: measures.length, systems: systems.length, staffSpace: sp,
  };
}

function headGlyph(val) {
  return { breve: 'noteheadBreve', whole: 'noteheadWhole', half: 'noteheadHalf', black: 'noteheadBlack' }[val.head]
    ?? 'noteheadBlack';
}

// ------------------------------------------------------------- one voice ---

function drawVoice(ctx) {
  const { out, events, inBar, ml, top, sp, nVoices, vi, st, measure } = ctx;
  const colX = new Map(ml.columns.map((c) => [c.tick, c.x]));
  const colByTick = new Map(ml.columns.map((c) => [c.tick, c]));

  // Stem direction. With one voice it follows the music; with two it follows
  // the convention that keeps them apart — upper voice up, lower voice down —
  // which is the only reason two-voice writing is readable at all.
  const declared = inBar.find((e) => e.stemDir)?.stemDir ?? 0;
  const forced = declared || (nVoices > 1 ? (vi === 0 ? 1 : -1) : 0);

  // Grace notes sit in the lead space to the LEFT of their column, in the order
  // they were written — which is the order they are played in.
  const graceSlot = new Map();
  for (const e of inBar) {
    if (!e.grace) continue;
    const n = (graceSlot.get(e.tick) ?? 0);
    graceSlot.set(e.tick, n + 1);
  }
  const graceSeen = new Map();

  const laid = inBar.map((e) => {
    const col = colByTick.get(e.tick);
    let x = colX.get(e.tick) ?? ml.musicStart;
    if (e.grace) {
      const total = graceSlot.get(e.tick) ?? 1;
      const k = graceSeen.get(e.tick) ?? 0;
      graceSeen.set(e.tick, k + 1);
      x -= (col?.grace ?? total * sp * 1.05) - k * sp * 1.05;
    }
    const val = noteValueOrNearest(
      e.written ? Math.round(WHOLE / e.written.denom) : (e.graceTicks || e.ticks));
    const dots = e.written?.dots ?? 0;
    if (e.kind === 'rest') return { e, x, val, dots, rest: true, grace: !!e.grace };
    // Stem direction follows the note FARTHEST from the middle line, not the
    // average of the chord — that is the engraving rule, and it is the one that
    // keeps the stem inside the staff instead of running the long way out of
    // it. A tie between the two extremes stems down, by convention.
    const positions = e.heads.map((h) => h.pos);
    const hi = Math.max(...positions);
    const lo = Math.min(...positions);
    const dir = forced || (Math.abs(hi) >= Math.abs(lo) ? -1 : 1);
    return {
      e, x, val, dots, rest: false, dir, grace: !!e.grace,
      top: Math.max(...positions), bottom: Math.min(...positions),
    };
  });

  // ---- beam groups ----
  const groups = beamGroups(laid, measure);

  for (const item of laid) {
    if (item.rest) { drawRest(ctx, item); continue; }
    drawChord(ctx, item, groups.get(item) ?? null);
  }
  for (const g of new Set(groups.values())) {
    if (g && g.members.length > 1 && !g.drawn) { g.drawn = true; drawBeam(ctx, g); }
  }
  drawTuplets(ctx, laid, groups);
  drawTiesAndSlurs(ctx, laid, colX);
  void out; void events; void top; void sp; void st;
}

/**
 * Decide which notes are beamed together.
 *
 * Two rules, in order: an explicit `[ ]` in the source always wins, because the
 * writer meant something by it. Otherwise notes group by BEAT — never across
 * one — which is what makes a bar of sixteenths scan as beats instead of as a
 * hedge. A rest ends a group; so does a note long enough to have no flag.
 */
function beamGroups(laid, measure) {
  const map = new Map();
  const beats = beatGroups(measure.num, measure.den);
  const beatAt = (tick) => {
    let t = measure.start;
    for (let i = 0; i < beats.length; i++) {
      if (tick < t + beats[i]) return i;
      t += beats[i];
    }
    return beats.length;
  };

  let run = [];
  let explicit = false;
  const flush = () => {
    if (run.length > 1) {
      const g = { members: run, drawn: false };
      for (const it of run) map.set(it, g);
    } else if (run.length === 1) {
      map.set(run[0], null);
    }
    run = [];
  };

  for (const item of laid) {
    // An ornament is not part of the beat it decorates: beaming a grace note
    // to the note it ornaments draws a beam across the bar line of the beat.
    if (item.grace) { flush(); explicit = false; continue; }
    if (item.rest || item.val.flags === 0) { flush(); explicit = false; continue; }
    const b = item.e.beam;
    if (b === 'start') { flush(); explicit = true; run.push(item); continue; }
    if (b === 'both') { flush(); map.set(item, null); explicit = false; continue; }
    if (b === 'stop') { run.push(item); flush(); explicit = false; continue; }
    if (explicit) { run.push(item); continue; }
    if (run.length && beatAt(run[0].e.tick) !== beatAt(item.e.tick)) flush();
    run.push(item);
  }
  flush();
  return map;
}

const posYOf = (top, pos, sp) => top + (2 - pos / 2) * sp;

const GRACE_SCALE = 0.62;

function drawChord(ctx, item, group) {
  const { out, events, top, sp } = ctx;
  // An ornament is drawn at about five-eighths size. `gs` scales the GLYPHS and
  // the widths measured in glyph units; it must NEVER touch a vertical
  // position, because a position is a pitch and a pitch does not shrink. That
  // is why this is a separate factor rather than a smaller `sp` — shadowing the
  // staff space would silently squash every ornament onto the middle line.
  const gs = item.grace ? GRACE_SCALE : 1;
  const { e, x, val, dots } = item;
  const heads = e.heads;
  const dir = group ? (group.dir ?? item.dir) : item.dir;
  const glyph = headGlyph(val);
  const headW = (GLYPHS[glyph]?.w ?? 1.24) * sp * gs;

  // Accidentals stack leftward, tallest interval first, so they don't collide.
  const withAcc = heads.filter((h) => h.accidental !== null);
  let accX = x - sp * 0.35;
  const accSlots = new Map();
  for (const h of [...withAcc].sort((a, b) => b.pos - a.pos)) {
    const g = accidentalGlyph(h.accidental);
    accSlots.set(h, accX - (GLYPHS[g]?.w ?? 1) * sp * gs);
    accX -= (GLYPHS[g]?.w ?? 1) * sp * gs + sp * 0.12;
  }
  for (const [h, hx] of accSlots) {
    out.push(glyphSVG(accidentalGlyph(h.accidental), hx, posYOf(top, h.pos, sp),
      sp * gs, { class: 'cf-accidental' }));
  }

  // Seconds must not overlap: the second note of an adjacent pair crosses to
  // the far side of the stem. Walking from the stem end inward gets the
  // alternation right for clusters of three or more.
  const order = dir > 0 ? [...heads] : [...heads].reverse();
  const side = new Map();
  let flip = false;
  for (let i = 0; i < order.length; i++) {
    if (i > 0 && Math.abs(order[i].pos - order[i - 1].pos) === 1 && !flip) flip = true;
    else flip = false;
    side.set(order[i], flip ? 1 : 0);
  }

  const anyFlipped = [...side.values()].some((v) => v === 1);
  // The extremes of the CHORD, which is where its stem starts and ends. Seeding
  // these at 0 (the middle line) instead is a subtle and very visible bug: every
  // chord that sits entirely above or below the middle grows a stem back to it.
  let ledgerMin = Math.min(...heads.map((h) => h.pos));
  let ledgerMax = Math.max(...heads.map((h) => h.pos));

  for (const h of heads) {
    const hx = x + (side.get(h) ? (dir > 0 ? headW - sp * STEM_WIDTH : -headW + sp * STEM_WIDTH) : 0);
    // The GLYPH shrinks; the STAFF does not. Vertical position is a pitch, so
    // it is always measured in full staff spaces.
    const hy = posYOf(top, h.pos, sp);
    const idx = events.length;
    events.push({
      src: e.src, tick: e.tick, ticks: e.ticks, midi: heads.map((q) => q.midi),
      x: hx, y: hy, pos: h.pos, spelled: h,
    });
    out.push(glyphSVG(glyph, hx, hy, sp * gs,
      { class: item.grace ? 'cf-note cf-grace' : 'cf-note', attrs: `data-ev="${idx}"` }));

    // dots — pushed into the space above when the note sits on a line
    for (let d = 0; d < dots; d++) {
      const dp = h.pos % 2 === 0 ? h.pos + 1 : h.pos;
      out.push(glyphSVG('dot', x + headW + sp * gs * (0.42 + d * 0.42) + (anyFlipped && dir > 0 ? headW : 0),
        posYOf(top, dp, sp), sp * gs, { class: 'cf-dot' }));
    }
  }

  // ledger lines
  const lx = x - sp * gs * LEDGER_EXTRA;
  const lw = headW + sp * gs * LEDGER_EXTRA * 2;
  for (let p = 6; p <= ledgerMax; p += 2) {
    out.push(`<line class="cf-ledger" x1="${r2(lx)}" y1="${r2(posYOf(top, p, sp))}" x2="${r2(lx + lw)}"`
      + ` y2="${r2(posYOf(top, p, sp))}" stroke-width="${r2(STAFF_LINE * sp * 1.25)}"/>`);
  }
  for (let p = -6; p >= ledgerMin; p -= 2) {
    out.push(`<line class="cf-ledger" x1="${r2(lx)}" y1="${r2(posYOf(top, p, sp))}" x2="${r2(lx + lw)}"`
      + ` y2="${r2(posYOf(top, p, sp))}" stroke-width="${r2(STAFF_LINE * sp * 1.25)}"/>`);
  }

  // stem + flag (a beamed note's stem is drawn with its beam instead)
  if (val.stem) {
    const stemX = dir > 0 ? x + headW - sp * gs * STEM_WIDTH / 2 : x + sp * gs * STEM_WIDTH / 2;
    const anchor = dir > 0 ? ledgerMin : ledgerMax;
    const farPos = dir > 0 ? ledgerMax : ledgerMin;
    let endPos = farPos + dir * STEM_LENGTH * 2 * (item.grace ? 0.72 : 1);
    // A stem from far outside the staff is drawn back to the middle line.
    if (dir > 0 && farPos < -2) endPos = Math.max(endPos, 0);
    if (dir < 0 && farPos > 2) endPos = Math.min(endPos, 0);
    item.stemX = stemX;
    item.stemEnd = endPos;
    item.headAnchor = anchor;
    if (!group) {
      out.push(`<line class="cf-stem" x1="${r2(stemX)}" y1="${r2(posYOf(top, anchor, sp))}"`
        + ` x2="${r2(stemX)}" y2="${r2(posYOf(top, endPos, sp))}"`
        + ` stroke-width="${r2(STEM_WIDTH * sp * gs)}"/>`);
      for (let f = 0; f < val.flags; f++) {
        out.push(glyphSVG('flag', stemX - (dir > 0 ? sp * gs * STEM_WIDTH / 2 : -sp * gs * STEM_WIDTH / 2),
          posYOf(top, endPos, sp) + dir * f * sp * gs * 0.85 * -1, sp * gs,
          { class: 'cf-flag', scaleY: dir > 0 ? 1 : -1 }));
      }
      // The slash through an acciaccatura's flag is what distinguishes it from
      // an appoggiatura on the page.
      if (item.grace && e.grace === 'acciaccatura' && val.flags) {
        const ty = posYOf(top, endPos, sp);
        out.push(`<line class="cf-graceslash" x1="${r2(stemX - sp * 0.42)}" y1="${r2(ty + dir * sp * 0.55)}"`
          + ` x2="${r2(stemX + sp * 0.62)}" y2="${r2(ty - dir * sp * 0.25)}"`
          + ` stroke-width="${r2(0.1 * sp)}"/>`);
      }
    }
  }

  drawMarks(ctx, item, dir, ledgerMin, ledgerMax, headW);
}

function drawMarks(ctx, item, dir, lo, hi, headW) {
  const { out, top, sp } = ctx;
  const { e, x } = item;
  // Articulations go opposite the stem, outside the staff when they must.
  let n = 0;
  for (const a of e.artics ?? []) {
    const g = articGlyph(a.name);
    if (!g) continue;
    const above = a.dir ? a.dir > 0 : dir < 0;
    const base = above ? Math.max(hi, 4) + 2 + n * 2 : Math.min(lo, -4) - 2 - n * 2;
    out.push(glyphSVG(g, x + headW / 2, posYOf(top, base, sp), sp,
      { class: 'cf-artic', scaleY: g === 'fermata' && !above ? -1 : 1 }));
    n++;
  }
  for (const t of e.texts ?? []) {
    const above = t.dir >= 0;
    const py = posYOf(top, above ? Math.max(hi, 4) + 4 : Math.min(lo, -4) - 4, sp);
    out.push(`<text class="cf-text" x="${r2(x + headW / 2)}" y="${r2(py)}" text-anchor="middle"`
      + ` font-size="${r2(sp * 1.5)}">${esc(t.text)}</text>`);
  }
  if (e.dynamic) {
    out.push(`<text class="cf-dyn" x="${r2(x)}" y="${r2(posYOf(top, Math.min(lo, -4) - 4, sp))}"`
      + ` font-size="${r2(sp * 1.9)}">${esc(e.dynamic)}</text>`);
  }
}

function drawRest(ctx, item) {
  const { out, events, top, sp, nVoices, vi } = ctx;
  const { e, x, val, dots } = item;
  if (e.invisible) return;
  const g = restGlyph(val.denom);
  // A whole rest hangs from the fourth line; a half rest sits on the third.
  // Everything else centres on the middle line. In two-voice writing the rests
  // move out of each other's way in the same direction the stems do.
  const offset = nVoices > 1 ? (vi === 0 ? 4 : -4) : 0;
  const base = g === 'restWhole' ? 2 : g === 'restHalf' ? 0 : 0;
  const y = posYOf(top, base + offset, sp);
  const idx = events.length;
  events.push({ src: e.src, tick: e.tick, ticks: e.ticks, midi: [], x, y, rest: true });
  out.push(glyphSVG(g, x, y, sp, { class: 'cf-rest', attrs: `data-ev="${idx}"` }));
  for (let d = 0; d < dots; d++) {
    out.push(glyphSVG('dot', x + sp * (1.5 + d * 0.42), posYOf(top, base + offset + 1, sp), sp, { class: 'cf-dot' }));
  }
}

/**
 * Draw a beam group: one stem per note, all ending on a common line, plus a
 * beam for every level of subdivision present.
 *
 * The slope comes from the first and last notes and is then clamped hard.
 * Engraved beams are much flatter than the notes they cover — a beam that
 * tracks the melody exactly looks like a ski jump and reads worse.
 */
function drawBeam(ctx, group) {
  const { out, top, sp } = ctx;
  const members = group.members;
  const votes = members.reduce((a, m) => a + m.dir, 0);
  const dir = group.dir = votes === 0 ? (members[0].dir) : (votes > 0 ? 1 : -1);

  const headW = (GLYPHS.noteheadBlack.w) * sp;
  for (const m of members) {
    m.stemX = dir > 0 ? m.x + headW - sp * STEM_WIDTH / 2 : m.x + sp * STEM_WIDTH / 2;
    m.far = dir > 0 ? Math.max(...m.e.heads.map((h) => h.pos)) : Math.min(...m.e.heads.map((h) => h.pos));
    m.near = dir > 0 ? Math.min(...m.e.heads.map((h) => h.pos)) : Math.max(...m.e.heads.map((h) => h.pos));
  }

  const first = members[0];
  const last = members[members.length - 1];
  const dx = last.stemX - first.stemX;
  let y1 = posYOf(top, first.far + dir * STEM_LENGTH * 2, sp);
  let y2 = posYOf(top, last.far + dir * STEM_LENGTH * 2, sp);
  const maxSlope = 0.22;
  const slope = Math.max(-maxSlope, Math.min(maxSlope, dx === 0 ? 0 : (y2 - y1) / dx));
  const midY = (y1 + y2) / 2;
  y1 = midY - (slope * dx) / 2;
  y2 = midY + (slope * dx) / 2;

  // Every stem must still reach its beam with at least a workable length.
  const beamAt = (x) => y1 + ((x - first.stemX) / (dx || 1)) * (y2 - y1);
  let shift = 0;
  for (const m of members) {
    const need = posYOf(top, m.far + dir * 2.6 * 2, sp);
    const have = beamAt(m.stemX);
    if (dir > 0 && have > need) shift = Math.min(shift, need - have);
    if (dir < 0 && have < need) shift = Math.max(shift, need - have);
  }
  y1 += shift; y2 += shift;

  for (const m of members) {
    out.push(`<line class="cf-stem" x1="${r2(m.stemX)}" y1="${r2(posYOf(top, m.near, sp))}"`
      + ` x2="${r2(m.stemX)}" y2="${r2(beamAt(m.stemX))}" stroke-width="${r2(STEM_WIDTH * sp)}"/>`);
  }

  const thick = BEAM_THICK * sp;
  const step = BEAM_SPACING * sp * (dir > 0 ? 1 : -1);
  const beamQuad = (xa, xb, level) => {
    const ya = beamAt(xa) + level * step;
    const yb = beamAt(xb) + level * step;
    const d = dir > 0 ? thick : -thick;
    out.push(`<path class="cf-beam" d="M${r2(xa)},${r2(ya)}L${r2(xb)},${r2(yb)}L${r2(xb)},${r2(yb + d)}`
      + `L${r2(xa)},${r2(ya + d)}Z"/>`);
  };

  const maxLevel = Math.max(...members.map((m) => m.val.flags));
  for (let level = 0; level < maxLevel; level++) {
    let runStart = -1;
    for (let i = 0; i <= members.length; i++) {
      const has = i < members.length && members[i].val.flags > level;
      if (has && runStart === -1) runStart = i;
      if (!has && runStart !== -1) {
        const a = members[runStart];
        const b = members[i - 1];
        if (a === b) {
          // A lone note at this level gets a stub, pointing at whichever
          // neighbour it shares the lower beam with.
          const back = runStart > 0;
          const len = sp * 1.05;
          beamQuad(back ? a.stemX - len : a.stemX, back ? a.stemX : a.stemX + len, level);
        } else {
          beamQuad(a.stemX, b.stemX, level);
        }
        runStart = -1;
      }
    }
  }
}

/**
 * Tuplet numbers, and the bracket that scopes them.
 *
 * The number is not decoration: three eighths written where two belong is
 * unreadable without it. The bracket, though, IS optional — when the group is
 * already beamed the beam does the scoping, and engravers drop the bracket.
 */
function drawTuplets(ctx, laid, groups) {
  const { out, top, sp } = ctx;
  const byId = new Map();
  for (const item of laid) {
    const id = item.e.tupletId;
    if (!id) continue;
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(item);
  }
  const headW = GLYPHS.noteheadBlack.w * sp;
  for (const members of byId.values()) {
    const start = members.find((m) => m.e.tupletStart)?.e.tupletStart;
    if (!start || members.length < 2) continue;
    const beamed = groups.get(members[0]) && members.every((m) => groups.get(m) === groups.get(members[0]));
    const dir = members.find((m) => !m.rest)?.dir ?? 1;
    const above = dir > 0;
    const extreme = members.flatMap((m) => (m.rest ? [0] : m.e.heads.map((h) => h.pos)));
    const edge = above ? Math.max(...extreme, 2) + 5 : Math.min(...extreme, -2) - 5;
    const y = posYOf(top, edge, sp);
    const x0 = members[0].x - sp * 0.1;
    const x1 = members[members.length - 1].x + headW + sp * 0.1;
    const mid = (x0 + x1) / 2;
    if (!beamed) {
      const hook = above ? sp * 0.75 : -sp * 0.75;
      out.push(`<path class="cf-tupletbracket" d="M${r2(x0)},${r2(y + hook)}L${r2(x0)},${r2(y)}`
        + `L${r2(mid - sp * 0.62)},${r2(y)}M${r2(mid + sp * 0.62)},${r2(y)}L${r2(x1)},${r2(y)}`
        + `L${r2(x1)},${r2(y + hook)}" fill="none" stroke-width="${r2(0.1 * sp)}"/>`);
    }
    out.push(`<text class="cf-tupletnum" x="${r2(mid)}" y="${r2(y + sp * 0.42)}" text-anchor="middle"`
      + ` font-size="${r2(sp * 1.3)}">${start.num}</text>`);
  }
}

/** Ties join the same pitch; slurs join whatever they span. Both are arcs. */
function drawTiesAndSlurs(ctx, laid, colX) {
  const { out, top, sp } = ctx;
  const headW = GLYPHS.noteheadBlack.w * sp;

  for (let i = 0; i < laid.length; i++) {
    const a = laid[i];
    if (a.rest || !a.e.tie) continue;
    const b = laid[i + 1];
    const arcFor = (h) => {
      const y0 = posYOf(top, h.pos, sp);
      const up = h.pos < 0 ? 1 : -1; // arc away from the middle of the staff
      const x0 = a.x + headW + sp * 0.18;
      const x1 = b ? b.x - sp * 0.18 : a.x + headW + sp * 2.2;
      const bulge = up * sp * 0.9;
      const my = y0 + bulge;
      out.push(`<path class="cf-tie" d="M${r2(x0)},${r2(y0 + up * sp * 0.16)}`
        + `Q${r2((x0 + x1) / 2)},${r2(my)} ${r2(x1)},${r2(y0 + up * sp * 0.16)}" fill="none"`
        + ` stroke-width="${r2(0.1 * sp)}"/>`);
    };
    for (const h of a.e.heads) {
      if (!b || b.rest || b.e.heads.some((q) => q.pos === h.pos)) arcFor(h);
    }
  }

  // Slurs — one open at a time is enough for the writing this reads.
  let open = null;
  for (const item of laid) {
    if (item.rest) continue;
    const s = item.e.slur ?? item.e.phrase;
    if (s === 'start' || s === 'both') open = item;
    if ((s === 'stop' || s === 'both') && open) {
      const a = open;
      const b = item;
      const dir = (a.dir ?? 1) > 0 ? -1 : 1; // opposite the stems
      const pa = dir < 0 ? Math.max(...a.e.heads.map((h) => h.pos)) : Math.min(...a.e.heads.map((h) => h.pos));
      const pb = dir < 0 ? Math.max(...b.e.heads.map((h) => h.pos)) : Math.min(...b.e.heads.map((h) => h.pos));
      const x0 = a.x + headW / 2;
      const x1 = b.x + headW / 2;
      const y0 = posYOf(top, pa, sp) + dir * sp * 1.1;
      const y1 = posYOf(top, pb, sp) + dir * sp * 1.1;
      const cy = Math.min(y0, y1) + dir * sp * Math.min(2.2, 0.6 + Math.abs(x1 - x0) / (sp * 9));
      out.push(`<path class="cf-slur" d="M${r2(x0)},${r2(y0)}Q${r2((x0 + x1) / 2)},${r2(cy)} ${r2(x1)},${r2(y1)}"`
        + ` fill="none" stroke-width="${r2(0.11 * sp)}"/>`);
      open = null;
    }
  }
  void colX;
}

// -------------------------------------------------------------- furniture ---

function timeSigSVG(num, den, cx, top, sp) {
  const f = `font-size="${r2(sp * 2.5)}" text-anchor="middle" class="cf-timesig"`;
  return `<text x="${r2(cx)}" y="${r2(top + sp * 1.72)}" ${f}>${num}</text>`
    + `<text x="${r2(cx)}" y="${r2(top + sp * 3.72)}" ${f}>${den}</text>`;
}

/**
 * A bar line spans every staff of the system, but its repeat dots do NOT: they
 * belong to the second and third spaces of EACH staff. Drawing them once at the
 * midpoint of a grand staff puts them in the gap between the hands, where they
 * read as a stray colon rather than as a repeat.
 */
function drawBarline(out, x, tops, bottom, style, sp) {
  const top = tops[0];
  const thin = 0.12 * sp;
  const thick = 0.42 * sp;
  const line = (lx, w) => out.push(`<line class="cf-barline" x1="${r2(lx)}" y1="${r2(top)}"`
    + ` x2="${r2(lx)}" y2="${r2(bottom)}" stroke-width="${r2(w)}"/>`);
  const dots = (dx) => {
    for (const st of tops) {
      for (const dy of [1.5, 2.5]) {
        out.push(`<circle class="cf-repeatdot" cx="${r2(dx)}" cy="${r2(st + dy * sp)}" r="${r2(sp * 0.17)}"/>`);
      }
    }
  };
  switch (style) {
    case 'double': line(x - sp * 0.32, thin); line(x, thin); break;
    case 'final': line(x - sp * 0.42, thin); line(x, thick); break;
    case 'repeat-end': dots(x - sp * 0.95); line(x - sp * 0.55, thin); line(x, thick); break;
    case 'repeat-start': line(x, thick); line(x + sp * 0.55, thin); dots(x + sp * 0.95); break;
    case 'repeat-both':
      dots(x - sp * 1.1); line(x - sp * 0.7, thin); line(x, thick); line(x + sp * 0.7, thin); dots(x + sp * 1.1);
      break;
    case 'dashed':
      out.push(`<line class="cf-barline" x1="${r2(x)}" y1="${r2(top)}" x2="${r2(x)}" y2="${r2(bottom)}"`
        + ` stroke-width="${r2(thin)}" stroke-dasharray="${r2(sp * 0.5)} ${r2(sp * 0.4)}"/>`);
      break;
    default: line(x, thin);
  }
}

export { PPQ, WHOLE };
