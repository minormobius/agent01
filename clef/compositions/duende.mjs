#!/usr/bin/env node
// duende.mjs — writes duende.ly: "Duende", for piano and guitar (clef's two physical models).
//
// Bar by bar, four voices: the piano's right and left hands, the guitar's upper voice (melody,
// chords, rasgueado) and lower voice (its bass). Patterns are functions of a chord so a section
// is a progression and a figure; melodies and solos are written out. Every pitch is ABSOLUTE
// (c' = middle C, sounding: the guitar staff's treble_8 clef only draws it an octave up), and
// every bar is closed with `|`, so clef's bar checks verify each measure of the output.
//
// The design, all in A minor so the ballad and the flamenco share one centre:
//   intro      guitar harmonics; a flamenco E(b9); the piano's clusters underneath
//   head       piano sings, over the circle: Dm9 G13 Cmaj9 Fmaj7#11 Bm7b5 E7b9 Am(maj7); guitar comps
//   head'      the guitar sings it; the piano re-harmonises: tritone subs (Db7#11 for G7, Bb7#11
//              for E7), F#m7b5–B7 for Fmaj7, a backdoor Bb13 turnaround
//   trading    fours over Am9 Am9 Dm9 E7#9: guitar, piano, guitar (picado), piano (octaves)
//   duel       the Andalusian cadence Am G F E, six times: rasgueado alone; montuno joins; the
//              guitar's Phrygian-dominant runs; the piano answers them in octaves; both in unison;
//              clusters against open strings to a held E7(b9)
//   coda       the head with the roles swapped, ending unresolved on F Lydian: the piano's
//              Fmaj7#11 under the guitar's six open-string harmonics (E A D G B E: all of them
//              notes of F Lydian, so the open guitar IS the last chord)
//
//   node clef/compositions/duende.mjs   → clef/compositions/duende.ly
import { writeFileSync } from 'node:fs';

const bars = [];               // [{ prh, plh, gu, gl, mark? }]
const bar = (prh, plh, gu, gl, mark = '') => bars.push({ prh, plh, gu, gl, mark });
const R = 'r1', S = 's1';

/** Move a LilyPond absolute pitch (or a chord of them) by octaves. */
function up(p, n) {
  return p.replace(/([a-g](?:is|es|isis|eses)?)([',]*)/g, (_, name, marks) => {
    let o = (marks.match(/'/g) || []).length - (marks.match(/,/g) || []).length + n;
    return name + (o > 0 ? "'".repeat(o) : ','.repeat(-o));
  });
}
/** A run written as pitches and one duration per note → LilyPond, the first note carrying `d`. */
const run = (notes, d) => notes.map((p, i) => (i === 0 ? p + d : p)).join(' ');
/** The same run doubled in octaves (`k` octaves up), for the piano. */
const octaves = (notes, d, k) => notes.map((p, i) => `<${up(p, k)} ${up(p, k + 1)}>${i === 0 ? d : ''}`).join(' ');

// ------------------------------------------------------------------------------- intro (6 bars) --
bar(R, R, "\\p e2\\6\\harmonic a2\\5\\harmonic", S, '\\mark "Intro"');
bar(R, R, "d'2\\4\\harmonic g'2\\3\\harmonic", S);
bar("r2 <e'' f''>2\\pp", 'e,,1', "<e, b, e gis b f'>1\\arpeggio", S);
bar(R, R, "r4 f'8( e') d'4 c'8( b)", S);
bar("<a' b' c'' e''>1", 'a,,1', "<a, e a c' e'>1\\arpeggio", S);
bar("r2 <gis' d''>2", 'e,1', "r2 e'4( f')", S);

// -------------------------------------------------------------------------------- the head (16) --
// [chord, piano left hand (rootless), guitar bass, guitar shell, melody bar 1, melody bar 2]
const HEAD = [
  ['Dm9',      "<f a c' e'>", 'd',   "<f c'>",     "r4 a'4 f''2",            "e''4. d''8 c''2"],
  ['G13',      "<f b e'>",    'g,',  "<f b e'>",   "b'4 c''4 d''4 e''4",     "f''2 e''2"],
  ['Cmaj9',    "<e g b d'>",  'c',   "<e b d'>",   "d''4. c''8 b'2",         "g'1"],
  ['Fmaj7#11', "<e a b>",     'f,',  "<a e' b'>",  "a'4 b'4 c''4 e''4",      "e''2. d''4"],
  ['Bm7b5',    "<a d' f'>",   'b,',  "<a d' f'>",  "c''4 d''4 f''2",         "f''4. e''8 d''2"],
  ['E7b9',     "<gis d' f'>", 'e,',  "<gis d' f'>","gis'4 b'4 d''4 f''4",    "e''2 d''2"],
  ['Am(maj7)', "<c' e' gis'>",'a,',  "<c' e' gis'>","c''4 b'4 gis'2",        "a'1"],
  ['Am6 E7#9', "<c' fis' a'>",'a,',  "<c' fis' a'>","c''2 a'2",              "g''4 f''4 e''4 d''4"],
];
HEAD.forEach(([name, lh, gb, sh, m1, m2], i) => {
  const dyn = i === 0 ? '\\mp ' : '';
  // the last chord turns around: E7#9 in its second bar
  const lh2 = i === 7 ? "<gis d' g'>1" : `r4 ${lh}2.`, sh2 = i === 7 ? "<gis d' g'>" : sh, gb2 = i === 7 ? 'e,' : gb;
  bar(dyn + m1, `${lh}1`, `${dyn}r4 ${sh}4 r8 ${sh}8 r4`, `${gb}1`, i === 0 ? '\\mark "Head"' : '');
  bar(m2, lh2, `r2 ${sh2}4. ${sh2}8`, `${gb2}2 ${gb2}2`);
});

// ------------------------------------------------------- the head again: guitar sings, piano re-harmonises (16) --
// [root (piano LH), upper structure (piano RH), guitar bass, melody bar 1, melody bar 2, piano's answer in bar 2]
const HEAD2 = [
  ['d,',  "<c' e' f' g'>",    'd',  "r4 a'4\\glissando f''2",  "e''4.( d''8) c''2",  "r2 r8 e'''8 d''' c'''"],
  ['des,',"<ces' f' g' bes'>", 'des', "b'4 c''4 d''4 e''4",    "f''2 e''2",          ''],
  ['c,',  "<b d' e' g'>",     'c',  "d''4. c''8 b'2",          "g'1",                "r4 b''8 a'' g''4 e''4"],
  ['fis, b,,', "<a c' e'>",   'fis,', "a'4 b'4 c''4 e''4",     "e''2.( d''4)",       ''],
  ['b,,', "<a d' f'>",        'b,', "c''4( d''4) f''2",        "f''4. e''8 d''2",    ''],
  ['bes,,',"<aes d' e' g'>",  'bes,', "gis'4 b'4 d''4 f''4",   "e''2 d''2",          ''],
  ['a,,', "<gis b c' e'>",    'a,', "c''4( b'4) gis'2",        "a'1",                "r4 c'''8 b'' gis''4 e''4"],
  ['bes,, e,', "<aes d' g'>", 'a,', "c''2 a'2",                "g''4 f''4 e''4 d''4", ''],
];
HEAD2.forEach(([root, upper, gb, m1, m2, answer], i) => {
  const dyn = i === 0 ? '\\f ' : '';
  const [r1, r2] = root.split(' ');
  const rh1 = `${i === 0 ? '\\p ' : ''}r4 ${upper}4 r4 ${upper}4`;
  const rh2 = answer || `r2 ${i === 7 ? "<gis d' g'>" : upper}2`;
  bar(rh1, `${r1}1`, dyn + m1, `${gb}2 s2`, i === 0 ? '\\mark "Head, the guitar sings"' : '');
  bar(rh2, r2 ? `${r1}2 ${r2}2` : `${r1}1`, m2, S);
});

// ------------------------------------------------------------------------------ trading fours (16) --
const VAMP = [
  { pl: 'a,,4. e,8 r4 a,,4', pr: "r8 <c'' e'' g'' b''>4 r8 q4 r4", g: "<a, e g c' e'>", gb: 'a,' },
  { pl: 'a,,4. e,8 r4 a,,4', pr: "r8 <c'' e'' g'' b''>4 r8 q4 r4", g: "<a, e g c' e'>", gb: 'a,' },
  { pl: 'd,4. a,8 r4 d,4',   pr: "r8 <c'' e'' f'' a''>4 r8 q4 r4", g: "<d a c' f'>",    gb: 'd' },
  { pl: 'e,4. b,8 r4 e,4',   pr: "r8 <gis' d'' g''>4 r8 q4 r4",    g: "<e gis d' g'>",  gb: 'e,' },
];
const SOLO = {
  guitar1: [
    "r8 a'8 c''8 e''8 g''4 f''8 e''",
    "\\tuplet 3/2 { d''8 e'' d'' } c''8 a' b'8 c'' a'4",
    "d''8 f'' a'' b'' a''4 f''8 d''",
    "gis''8 f'' e'' d'' \\tuplet 3/2 { c''8 b' a' } gis'4",
  ],
  piano1: [
    "r8 e''8 c''' b'' a'' gis'' a'' e''",
    "c'''8 b'' a'' g'' fis'' e'' dis'' e''",
    "f''8 a'' d''' c''' \\tuplet 3/2 { b''8 c''' b'' } a''4",
    "gis''8 b'' d''' f''' e'''4 r4",
  ],
  guitar2: [
    "a'16 b' c'' d'' e'' d'' c'' b' a'8 e'' c''4",
    "\\tuplet 3/2 { e''8 f'' e'' } d''8 c'' b'16 c'' d'' e'' f''8 e''",
    "f''16 e'' d'' c'' a'8 d'' f''4 a''4",
    "gis''16 a'' gis'' f'' e''8 d'' c''8 b' gis'4",
  ],
  piano2: [
    "<a' a''>8 <c'' c'''> <e'' e'''> <a'' a'''>4 <g'' g'''>8 <e'' e'''> <c'' c'''>",
    "<b' b''>8 <a' a''> <gis' gis''>4 <a' a''>2",
    "<d'' d'''>8 <f'' f'''> <a'' a'''> <f'' f'''> <d'' d'''>4 <a' a''>4",
    "<gis' gis''>8 <b' b''> <d'' d'''> <f'' f'''> <e'' e'''>4 r4",
  ],
};
['guitar1', 'piano1', 'guitar2', 'piano2'].forEach((who, k) => {
  SOLO[who].forEach((line, j) => {
    const v = VAMP[j], first = j === 0;
    const mark = first ? `\\mark "${who.startsWith('guitar') ? 'Guitar' : 'Piano'}"` : '';
    if (who.startsWith('guitar')) {
      // the guitar solos; the piano comps: rooted bass, stabs off the beat
      bar(`${first ? '\\mp ' : ''}${v.pr}`, v.pl, `${first ? '\\f ' : ''}${line}`, S, mark);
    } else {
      // the piano solos; the guitar comps: a light strum with its own bass
      bar(`${first ? '\\f ' : ''}${line}`, v.pl, `${first ? '\\mp ' : ''}r8 ${v.g}8 r4 r8 ${v.g}8 ${v.g}4`, `${v.gb}2. r4`, k === 1 && j === 0 ? '\\mark "Trading fours"' : mark);
    }
  });
});

// ------------------------------------------------------------------------------- the duel (25) --
const AND = [
  { g: "<a, e a c' e'>",      root: 'a,,', oct: '<a,, a,>', mont: ["<c'' e''>", "a'"],  clus: "<a' b' c'' e''>" },
  { g: "<g, b, d g b g'>",    root: 'g,,', oct: '<g,, g,>', mont: ["<b' d''>", "g'"],   clus: "<g' a' b' d''>" },
  { g: "<f, c f a c' f'>",    root: 'f,,', oct: '<f,, f,>', mont: ["<a' c''>", "f'"],   clus: "<f' g' a' c''>" },
  { g: "<e, b, e gis b f'>",  root: 'e,,', oct: '<e,, e,>', mont: ["<gis' d''>", "e'"], clus: "<e' f' gis' b'>" },
];
const rasg = (c) => `${c}8->\\arpeggio ${c}16 ${c} ${c}8 ${c}8-> r8 ${c}8 ${c}16 ${c} ${c}8`;
const tresillo = (o) => `${o}8.-> ${o}8. ${o}8 ${o}8.-> ${o}8. ${o}8`;
const montuno = ([ch, low]) => `r8 ${ch}8 ${low}8 ${ch}8 r8 ${ch}8 ${low}8 ${ch}8`;
// the guitar's runs in E Phrygian dominant (A harmonic minor), descending then ascending
const DOWN = [
  [["e''", "d''", "c''", "b'", "a'", "gis'", "a'", "b'"], "c''8 e'' a''4"],
  [["g''", "f''", "e''", "d''", "c''", "b'", "a'", "g'"], "b'8 d'' g''4"],
  [["f''", "e''", "d''", "c''", "a'", "gis'", "f'", "e'"], "f'8 a' c''4"],
  [["e'", "f'", "gis'", "a'", "b'", "c''", "d''", "e''"], "f''8 e'' gis''4"],
];
const UP = [
  [['a', 'b', "c'", "d'", "e'", "f'", "gis'", "a'"], "b'8 c'' e''4"],
  [['g', 'a', 'b', "c'", "d'", "e'", "f'", "g'"], "a'8 b' d''4"],
  [['f', 'gis', 'a', 'b', "c'", "d'", "e'", "f'"], "gis'8 a' c''4"],
  [['e', 'f', 'gis', 'a', 'b', "c'", "d'", "e'"], "f'8 gis' b'4"],
];
const tailUp = (t, k) => t.replace(/([a-g](?:is|es)?[',]*)(\d*)/g, (_, p, d) => (k ? `<${up(p, k)} ${up(p, k + 1)}>` : p) + d);
for (let cycle = 0; cycle < 6; cycle++) {
  AND.forEach((c, j) => {
    const first = j === 0, mark = first ? `\\mark "${['Duel', '', 'Picado', 'The answer', 'Unison', 'Fists'][cycle] || ''}"` : '';
    let prh = R, plh = R, gu = rasg(c.g);
    if (cycle === 0) { if (first) gu = '\\f ' + gu; }
    if (cycle === 1) { prh = (first ? '\\mf ' : '') + montuno(c.mont); plh = tresillo(c.oct); }
    if (cycle === 2) {
      const [notes, tail] = DOWN[j];
      gu = (first ? '\\ff ' : '') + run(notes, '16') + ' ' + tail;
      prh = `${c.clus}8-> r8 r8 ${c.clus}8-> r2`; plh = `${c.root}2 ${c.root}2`;
    }
    if (cycle === 3) {
      const [notes, tail] = DOWN[j];
      prh = (first ? '\\ff ' : '') + octaves(notes, '16', 1) + ' ' + tailUp(tail, 1);
      plh = tresillo(c.oct); gu = rasg(c.g);
    }
    if (cycle === 4) {
      const [notes, tail] = UP[j];
      gu = run(notes, '16') + ' ' + tail;
      prh = octaves(notes, '16', 1) + ' ' + tailUp(tail, 1); plh = tresillo(c.oct);
    }
    if (cycle === 5) {
      if (j < 3) {
        const k = c.clus;
        prh = `${first ? '\\fff ' : ''}${k}8-> ${k} ${k} ${k}-> ${k} ${k} ${k}-> ${k}`;
        plh = tresillo(c.oct);
        if (first) gu = '\\fff ' + gu;
      } else {
        // the last E: everything at once, and held
        prh = "<gis' b' d'' f'' gis''>1\\fermata"; plh = '<e,, e,>1\\fermata'; gu = "<e, b, e gis b f'>1\\arpeggio\\fermata";
      }
    }
    bar(prh, plh, gu, S, mark);
  });
}
bar(R, R, R, S);

// ------------------------------------------------------------------------------- coda (11) --
// The head with the roles swapped: the guitar sings it high, the piano plays the guitar's comping.
const CODA = HEAD.slice(0, 4);
CODA.forEach(([name, lh, gb, sh, m1, m2], i) => {
  const dyn = i === 0 ? '\\mp ' : '';
  const shP = up(sh, 1);
  bar(`${i === 0 ? '\\pp ' : ''}r4 ${shP}4 r8 ${shP}8 r4`, `${up(gb, -1)}1`, dyn + m1, S, i === 0 ? '\\mark "Coda, the roles swapped"' : '');
  bar(`r2 ${shP}4. ${shP}8`, `${up(gb, -1)}2 ${up(gb, -1)}2`, m2, S);
});
// unresolved: F Lydian, the piano's Fmaj7#11 under the six open strings' harmonics
bar("\\pp <a' c'' e'' b''>1\\arpeggio~", '<f,, c,>1~', "<e\\6\\harmonic a\\5\\harmonic d'\\4\\harmonic g'\\3\\harmonic b'\\2\\harmonic e''\\1\\harmonic>1\\arpeggio", S);
bar("<a' c'' e'' b''>1", '<f,, c,>1', R, S);
bar("b''1\\fermata", R, R, S);

// ------------------------------------------------------------------------------- the file --
const voice = (k) => bars.map((b) => (k === 'prh' && b.mark ? `${b.mark} ` : '') + b[k]).join(' |\n    ') + ' \\bar "|."';
const ly = `\\header {
  title = "Duende"
  composer = "for piano and guitar"
}

global = { \\key a \\minor \\time 4/4 \\tempo 4 = 132 }

pianoRH = {
    ${voice('prh')}
}
pianoLH = {
    ${voice('plh')}
}
guitarUp = {
    ${voice('gu')}
}
guitarLow = {
    ${voice('gl')}
}

\\score {
  <<
    \\new PianoStaff \\with { instrumentName = "Piano" } <<
      \\new Staff << \\global \\pianoRH >>
      \\new Staff << \\global \\clef bass \\pianoLH >>
    >>
    \\new StaffGroup <<
      \\new Staff \\with { instrumentName = "Guitar" midiInstrument = "acoustic guitar (nylon)" }
        << \\global \\clef "treble_8" \\guitarUp \\\\ \\guitarLow >>
      \\new TabStaff << \\guitarUp \\\\ \\guitarLow >>
    >>
  >>
}
`;
writeFileSync(new URL('./duende.ly', import.meta.url), ly);
console.log(`duende.ly: ${bars.length} bars`);
