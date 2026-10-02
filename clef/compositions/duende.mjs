#!/usr/bin/env node
// duende.mjs — writes duende.ly: "Duende", for piano and guitar (clef's two physical models).
//
// One idea runs the whole piece. A swung 4/4 bar is twelve triplet eighths; a bulería compás
// is twelve counts. So the piece is written in 12/8 from the first bar to the last, and the
// jazz and the flamenco are the SAME grid, accented differently: swing leans on pulses 4 and
// 10 (beats two and four), the bulería on counts 3, 6, 8, 10 and 12. The middle of the piece
// is the grid turning from one to the other under the players' hands.
//
// And one argument runs the harmony. A7(b9) is the dominant of D minor: to the piano it is a
// question that wants D. To the guitar, playing por medio, A with its Bb is not a question at
// all: it is HOME (A Phrygian dominant: A Bb C# D E F G). The piano spends the piece trying
// to resolve A to D; the guitar refuses. The cry that opens it (A Bb A G F E) is both a jazz
// line over Dm and a flamenco quejío over A, and it is the motif of every section.
//
//   I    Soleá       guitar alone, slow: the cry, a Bb–A rasgueado, a tremolo
//   II   Nocturne    piano alone: the cry re-harmonised in D minor, ending on A7(b9) held as a
//                    question; the guitar answers it with Bb–A, as if A were already home
//   III  Blues       a D minor blues, swung: the cry as a head, a walking bass, comping guitar
//   IV   Trading     the blues again: a guitar chorus, a piano chorus, and in the last four
//                    bars the accents slide onto the compás and the tempo climbs
//   V    Bulería     llamada; the piano's jazz voicings on the compás over a 3/4 bass (the
//                    bulería's own hemiola); a picado falseta with the piano in canon one count
//                    behind; a hocket, one sixteenth each, rising four octaves; the fists
//                    (piano on the 3+3+2+2+2 group starts, guitar on their ends); the remate
//                    in three octaves, a cierre on 10, and silence
//   VI   Duende      the piano asks once more (Em7b5 A7b9), deceives itself onto Bb, and the
//                    guitar's tremolo walks Bb down to A. The piano accepts A as home: a low A,
//                    open-string harmonics, and the cry's last Bb–A, high
//
// Every pitch is ABSOLUTE and sounding (the guitar's treble_8 clef only draws it an octave
// up); every bar is closed with `|` so clef's bar checks verify each measure.
//
//   node clef/compositions/duende.mjs   → clef/compositions/duende.ly
import { writeFileSync } from 'node:fs';

const bars = [];               // [{ prh, plh, gu, gl, mark }]
const bar = (prh, plh, gu, gl = S, mark = '') => bars.push({ prh, plh, gu, gl, mark });
const R = 'r1.', S = 's1.';

/** Move a LilyPond absolute pitch (or a chord of them) by octaves. */
function up(p, n) {
  return p.replace(/(?<![\\a-z])([a-g](?:isis|eses|is|es|s)?)([',]*)(?![a-z])/g, (_, name, marks) => {
    const o = (marks.match(/'/g) || []).length - (marks.match(/,/g) || []).length + n;
    return name + (o > 0 ? "'".repeat(o) : ','.repeat(-o));
  });
}
/** LilyPond absolute name for a MIDI note spelled with `name` (c' = 60). */
const lily = (midi, name) => {
  const o = Math.floor(midi / 12) - 4;
  return name + (o > 0 ? "'".repeat(o) : ','.repeat(-o));
};
// A Phrygian dominant, degree 0 = a' (69): the guitar's home scale and the remate's
const PD = { pcs: [0, 1, 4, 5, 7, 8, 10], names: ['a', 'bes', 'cis', 'd', 'e', 'f', 'g'] };
const deg = (i) => {
  const k = ((i % 7) + 7) % 7, o = Math.floor(i / 7), midi = 69 + 12 * o + PD.pcs[k];
  return { midi, p: lily(midi, PD.names[k]) };
};
/** Sixteenths from a list of degrees; the first carries the duration. */
const sixteenths = (degs, extra = '') => degs.map((d, i) => deg(d).p + (i === 0 ? '16' + extra : '')).join(' ');
/** Attach marks (dynamics, hairpins) to the first note or chord of a passage, LilyPond style. */
const dyn = (s, ...marks) => s.replace(/(?<![\\a-z])(<[^>]*>|[a-g](?:isis|eses|is|es|s)?[',]*|q)(\d+\.*)?/, (m) => m + marks.map((k) => '\\' + k).join(''));
const pitchesOf = (chord) => chord.replace(/[<>]/g, '').trim().split(/\s+/);
const top = (chord, n) => `<${pitchesOf(chord).slice(-n).join(' ')}>`;

// ---------------------------------------------------------------------- the instruments' chords --
const G = {   // guitar shapes, flamenco por medio
  A: "<a, e a cis' e'>", Bb: "<bes, f bes d' f'>", Dm: "<d a d' f'>", C: "<c e g c' e'>",
};
const P = {   // the piano's jazz colours on the same roots (rootless, right hand)
  A: "<g' cis'' e'' bes''>", Bb: "<d'' e'' f'' a''>", Dm: "<c'' e'' f'' a''>", C: "<bes' e'' a''>",
};
const ROOT = { A: '<a,, a,>', Bb: '<bes,, bes,>', Dm: '<d, d>', C: '<c, c>' };
const COMPAS = [2, 5, 7, 9, 11];   // counts 3 6 8 10 12, as eighths from 0

/**
 * A bar of rasgueado. `harm` gives a chord name per eighth (0–11, null = silence). Accented
 * counts are a full down-stroke; the rest two strokes, down and up (the up-stroke on the top
 * three strings, high to low). `dense` makes every eighth two sixteenths.
 */
function rasgueado(harm, { accents = COMPAS, cut = 12, first = '' } = {}) {
  const out = [];
  for (let s = 0; s < 12; s++) {
    const c = s < cut ? harm[s] : null;
    const pre = out.length === 0 ? first : '';
    if (!c) { out.push('r8'); continue; }
    if (accents.includes(s)) out.push(`${G[c]}8->${pre}`);
    else out.push(`${G[c]}16${pre} ${top(G[c], 3)}16\\upbow`);
  }
  return out.join(' ');
}
/** Chord names per eighth from [name, eighths] runs. */
const runs = (...rs) => rs.flatMap(([c, n]) => Array(n).fill(c));
/** Piano right hand: its voicing struck on the given eighths, silent between. */
function stabs(harm, at, first = '', art = '->') {
  const out = [];
  for (let s = 0; s < 12; s++) {
    if (at.includes(s) && harm[s]) out.push(`${P[harm[s]]}8${art}`);
    else out.push('r8');
  }
  return first ? dyn(out.join(' '), first.replace(/^\\/, '')) : out.join(' ');
}
/** Piano left hand in 3/4 against the 6/8: six quarter notes, octaves on each one's root. */
const hemiola = (harm, first = '') => [0, 2, 4, 6, 8, 10].map((s, i) => `${ROOT[harm[s]]}4${i ? '' : first}`).join(' ');

// ------------------------------------------------------------------------------ I. Soleá (4) --
// the guitar alone, slow; the cry over A, then over Bb, a tremolo, a Bb–A rasgueado
bar(R, R, dyn("r8 a'4.( bes'4) a'8 g'4 f'8 e'4", 'mp'), "a,2. <e a cis'>2.\\arpeggio", '\\tempo 4. = 46 \\mark "I  Soleá"');
bar(R, R, "d''4. c''8 bes'8 a'8 bes'4.\\< a'4.\\!", "bes,2. <f bes d'>2.\\arpeggio");
{
  const bass = ['a,', 'e', 'a', "cis'", 'e', 'a'], mel = ["e''", "e''", "f''", "e''", "d''", "cis''"];
  bar(R, R, dyn(mel.map((m) => `r16 ${m}16 ${m} ${m}`).join(' '), 'p'), bass.map((b) => `${b}8 r8`).join(' '));
}
bar(R, R, `${G.Bb}16->\\f q16\\upbow q16 q16\\upbow q8-> ${G.A}8~\\arpeggio q2. r4`, S);

// ---------------------------------------------------------------------------- II. Nocturne (4) --
// the piano alone: the cry on top of D minor's colours, then A7(b9) held: a question
bar("<f' cis'' e'' a''>2.\\p <f' a' d'' bes''>4. <f' a' d'' a''>4 <e' bes' d'' g''>8",
  'd,2. g,,2.', R, S, '\\tempo 4. = 44 \\mark "II  Nocturne"');
bar("<a' d'' e'' f''>2. <g' bes' d'' e''>4. <g' bes' d''>4.", 'bes,,2. e,4. a,,4.', R, S);
bar("cis''4.\\< e''4. g''4. bes''4.\\!", '<a,,, a,,>2. <g bes cis\' e\'>2.', R, S);
// …and the guitar answers it, as if A were already home: Bb falling to A
bar("<g' bes' cis'' a''>1.\\fermata", 'a,,1.', "r2. r8 bes'4(\\pp a'4.)", "s2. <a, e>2.");

// ------------------------------------------------------------------------- III. Blues (12) --
// D minor blues, swung (12/8: a beat is three eighths, a swung pair is 4 + 8)
const BLUES = [ // [guitar comp chord 1st half, 2nd half, walking bass (four beats)]
  ["<f a c' e'>",   "<f a c' e'>",    ['d,', 'f,', 'a,', 'aes,']],
  ["<bes d' f' a'>", "<bes d' f' a'>", ['g,', 'a,', 'bes,', 'b,']],
  ["<f a c' e'>",   "<f a c' e'>",    ['d,', 'e,', 'f,', 'fis,']],
  ["<g c' ees'>",    "<fis c' ees'>",   ['a,', 'c', 'd,', 'fis,']],
  ["<bes d' f' a'>", "<bes d' f' a'>", ['g,', 'bes,', 'd', 'bes,']],
  ["<bes e' a'>",   "<bes e' a'>",    ['c', 'e,', 'g,', 'bes,']],
  ["<f a c' e'>",   "<f a c' e'>",    ['d,', 'f,', 'a,', 'd']],
  ["<a d' f'>",     "<aes d' e'>",    ['b,', 'd', 'bes,', 'aes,']],
  ["<aes d' g'>",   "<aes d' g'>",    ['bes,,', 'd,', 'f,', 'aes,']],
  ["<g cis' f'>",   "<g bes cis' f'>", ['a,,', 'cis,', 'e,', 'g,']],
  ["<f b e'>",      "<aes d' f'>",    ['d,', 'f,', 'bes,,', 'aes,,']],
  ["<g bes d'>",    "<g cis' f'>",    ['e,', 'g,', 'a,,', 'cis,']],
];
const HEAD = [
  "r4 a'8 bes'4 a'8 g'4 f'8 e'4 d'8",
  "f'4. bes'4 d''8 f''4.~ f''4 e''8",
  "d''4 c''8 a'4 f'8 e'4 f'8 a'4 c''8",
  "ees''4. d''4 c''8 fis'4 a'8 c''4 ees''8",
  "d''4. bes'4 a'8 bes'4 d''8 f''4 a''8",
  "g''4 f''8 e''4 d''8 bes'4. g'4.",
  "a'2.~ a'4 r8 r4 a'8",
  "a'4 bes'8 d''4 f''8 aes''4. g''4 f''8",
  "e''4. d''4 c''8 bes'4 g'8 aes'4 c''8",
  "bes''4.-> a''4 g''8 f''4 e''8 cis''4 bes'8",
  "a'4. d''4 e''8 f''4. aes''4 g''8",
  "f''4 e''8 d''4 bes'8 a'4. r4.",
];
const walk = (b, first = '') => b.map((n, i) => `${n}4.${i ? '' : first}`).join(' ');
/** Four to the bar, short, leaning on two and four. */
const fourToBar = ([x, y], first = '') => `${x}4-.${first} r8 ${x}4-.-> r8 ${y}4-. r8 ${y}4-.-> r8`;
BLUES.forEach(([x, y, b], i) => {
  bar(i === 0 ? dyn(HEAD[i], 'mf') : HEAD[i], walk(b, i === 0 ? '\\mf' : ''), fourToBar([x, y], i === 0 ? '\\mp' : ''), S,
    i === 0 ? '\\tempo 4. = 76 \\mark "III  Blues"' : '');
});

// ------------------------------------------------------------------------- IV. Trading (12) --
const GTR_SOLO = [
  "r8 a8 d'8 f'4 a'8 c''4 e''8 d''4 a'8",
  "bes'8( a'8) g'8 f'4 d'8 e'8( f'8) g'8 bes'4 d''8",
  "f''8 e''8 d''8 cis''8 d''8 a'8 f'8 a'8 d''8 f''8 a''8 r8",
  "g''8( f''8) ees''8 c''8 a'8 g'8 fis'8 a'8 c''8 ees''8 d''8 c''8",
];
const PNO_SOLO = [
  "r8 d''8 f''8 a''8 bes''8 a''8 g''16 a''16 bes''16 a''16 g''8 f''8 d''8 bes'8",
  "e''8 g''8 bes''8 d'''8 c'''8 bes''8 a''8 g''8 e''8 c''8 bes'8 g'8",
  "a'16 bes'16 a'16 gis'16 a'8 d''8 f''8 a''8 c'''8 e'''8 d'''4 a''8 f''8",
  "aes''8 g''8 f''8 d''8 b'8 aes'8 g'8 aes'8 bes'8 d''8 f''8 aes''8",
];
/** The piano comping: pushes off the beat, Red Garland's left hand an octave up. */
const comp = ([x, y], first = '') => `r4 ${up(x, 1)}8${first} r4. r4 ${up(y, 1)}8 r4 ${up(y, 1)}8`;
for (let i = 0; i < 4; i++) {
  const [x, y, b] = BLUES[i];
  bar(comp([x, y], i === 0 ? '\\p' : ''), walk(b, i === 0 ? '\\mp' : ''), i === 0 ? dyn(GTR_SOLO[i], 'f') : GTR_SOLO[i], S,
    i === 0 ? '\\tempo 4. = 80 \\mark "IV  Trading: guitar"' : '');
}
for (let i = 0; i < 4; i++) {
  const [x, y, b] = BLUES[4 + i];
  bar(i === 0 ? dyn(PNO_SOLO[i], 'f') : PNO_SOLO[i], walk(b), fourToBar([x, y], i === 0 ? '\\mp' : ''), S, i === 0 ? '\\mark "piano"' : '');
}
// the last four bars of the form: the accents slide onto the compás, and the tempo climbs.
// 29: the guitar starts it, the piano still swings. 30: the piano's right hand joins.
// 31: the piano's bass goes to 3/4, and they disagree (the piano's Dm, the guitar's Bb).
// 32: both on A, the compás whole.
bar(comp(["<aes d' g'>", "<aes d' g'>"]), walk(BLUES[8][2]), rasgueado(runs(['Bb', 12]), { first: '\\f' }), S,
  '\\tempo 4. = 82 \\mark "the grid turns"');
bar(stabs(runs(['A', 12]), COMPAS, '\\f'), walk(BLUES[9][2]), rasgueado(runs(['A', 12])), S, '\\tempo 4. = 84');
bar(stabs(runs(['Dm', 12]), COMPAS, '\\<'), hemiola(runs(['Dm', 12]), '\\f'), rasgueado(runs(['Bb', 12]), { first: '\\<' }), S, '\\tempo 4. = 86');
bar(stabs(runs(['A', 12]), COMPAS, '\\ff'), hemiola(runs(['A', 12])), rasgueado(runs(['A', 12]), { first: '\\ff' }), S, '\\tempo 4. = 88');

// ----------------------------------------------------------------------- V. Bulería (19) --
const C1 = runs(['A', 2], ['Bb', 3], ['A', 2], ['Bb', 2], ['A', 3]);      // the compás por medio
const AND = runs(['Dm', 3], ['C', 3], ['Bb', 3], ['A', 3]);               // the Andalusian cadence
// llamada: the guitar alone, a call; the second bar closes on 10 (a cierre) and stops
bar(R, R, rasgueado(C1, { first: '\\ff' }), S, '\\mark "V  Bulería"');
bar(R, R, rasgueado(C1, { cut: 10 }), S);
// the piano joins: its jazz colours struck on the compás, the bass in 3/4 against it
[C1, C1, AND, AND].forEach((h, i) => {
  bar(stabs(h, COMPAS, i === 0 ? '\\f' : ''), hemiola(h, i === 0 ? '\\f' : ''), rasgueado(h, { first: i === 0 ? '\\mf' : '' }), S);
});
// falseta: picado runs in A Phrygian dominant; the piano follows in canon, a count behind and
// an octave up; both phrases close together on 10
const cellsDown = (x0, n) => Array.from({ length: n }, (_, k) => { const x = x0 - 2 * k; return [x, x - 1, x - 2, x - 3, x - 4, x - 3]; }).flat();
const cellsUp = (x0, n) => Array.from({ length: n }, (_, k) => { const x = x0 + 2 * k; return [x, x + 1, x + 2, x + 1, x + 2, x + 3]; }).flat();
const pdeg = (d) => deg(d + 7).p;   // the canon: an octave up
function falseta(seq1, seq2, hit, mark) {
  const g1 = sixteenths(seq1), g2 = sixteenths(seq2) + ` ${G[hit]}8-> r4`;
  const p1 = 'r8 ' + seq1.slice(0, 22).map((d, i) => pdeg(d) + (i === 0 ? '16' : '')).join(' ');
  const p2 = [...seq1.slice(22), ...seq2.slice(0, 16)].map((d, i) => pdeg(d) + (i === 0 ? '16' : '')).join(' ') + ` ${P[hit]}8-> r4`;
  bar(p1, '<a,,, a,,>2. <a,,, a,,>2.', g1, S, mark);
  bar(p2, `<a,,, a,,>2. r4. ${ROOT[hit]}8-> r4`, g2, S);
}
falseta(cellsDown(7, 4), [-1, -2, -3, -4, -5, -4, -3, -4, -5, -6, -7, -6, -5, -6, -7, -8, -7, -6], 'A', '\\mark "falseta, in canon"');
falseta(cellsUp(-14, 4), cellsUp(-6, 3), 'A', '');
// hocket: one line, a sixteenth each, guitar on the even ones and piano on the odd, rising
// from the guitar's low A through four octaves as it grows from piano to fortissimo
{
  const line = Array.from({ length: 12 }, (_, k) => [-14 + k, -13 + k, -12 + k, -11 + k]).flat();
  for (let b = 0; b < 2; b++) {
    const part = line.slice(b * 24, b * 24 + 24);
    const g = part.map((d, i) => (i % 2 === 0 ? deg(d).p : 'r') + '16').join(' ');
    const p = part.map((d, i) => (i % 2 === 1 ? deg(d).p : 'r') + '16').join(' ');
    bar(b === 0 ? dyn(p, 'p', '<') : p, R, b === 0 ? dyn(g, 'p', '<') : g, S, b === 0 ? '\\mark "hocket"' : '');
  }
}
// the fists: the piano on the starts of 3+3+2+2+2, the guitar on their ends, a full rasgueado
// between, the harmony speeding up (two chords a bar, then four)
const GROUP_STARTS = [0, 3, 6, 8, 10];
function fists(h, first = '') {
  const prh = stabs(h, GROUP_STARTS, first);
  const gtr = Array.from({ length: 12 }, (_, s) => {
    const c = G[h[s]];
    return COMPAS.includes(s) ? `${c}8->` : `${c}16 ${top(c, 3)}16\\upbow`;
  });
  gtr[0] = gtr[0].replace(/(8->|16)/, `$1${first}`);
  bar(prh, hemiola(h, first), gtr.join(' '), S, first ? '\\mark "the fists"' : '');
}
fists(runs(['Dm', 6], ['C', 6]), '\\ff');
fists(runs(['Bb', 6], ['A', 6]));
fists(AND);
fists(AND);
// remate: the cry, cascading, in three octaves at once: piano, guitar, piano. Then up, a
// silence of three counts, and the cierre on 10
{
  const fall = [8, 7, 6, 5, 4, 3, 2, 3, 4, 2, 1, 0, -1, -2, -3, -2, -1, -3, -4, -5, -6, -7, -8, -9];
  const rise = [-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1];
  const rh = (ds) => ds.map((d, i) => { const { p } = deg(d); return `<${p} ${up(p, 1)}>${i ? '' : '16'}`; }).join(' ');
  const lh = (ds) => ds.map((d, i) => { const { p, midi } = deg(d); return (midi - 24 >= 21 ? `<${up(p, -2)} ${up(p, -1)}>` : up(p, -1)) + (i ? '' : '16'); }).join(' ');
  bar(dyn(rh(fall), 'fff'), dyn(lh(fall), 'fff'), dyn(sixteenths(fall), 'fff'), S, '\\mark "remate"');
  bar(rh(rise) + ` r4. <g' cis'' e'' bes'' cis'''>8-> r4`, lh(rise) + ` r4. <a,,, a,,>8-> r4`, sixteenths(rise) + ` r4. ${G.A}8-> r4`, S);
}
bar(`${R}\\fermata`, R, R, S);

// ------------------------------------------------------------------------- VI. Duende (4) --
// the piano asks once more: Em7b5 to A7b9, the cry turned upward
bar("<g' bes' d'' e''>4.\\pp <g' bes' d'' f''>4. <g' cis'' f'' g''>4. <g' cis'' f'' a''>4.", 'e,2. a,,2.', R, S,
  '\\tempo 4. = 42 \\mark "VI  Duende"');
// …and deceives itself onto Bb, the bII: in D minor a deceptive cadence, in A Phrygian the
// chord before home. The guitar takes it from there, in tremolo: Bb walking down to A
{
  const trem = (bass, mel) => [bass.map((b) => `${b}8 r8`).join(' '), mel.map((m) => `r16 ${m}16 ${m} ${m}`).join(' ')];
  const [b1, m1] = trem(['bes,', 'f', 'bes', "d'", 'f', 'bes'], ["d''", "d''", "d''", "c''", "c''", "c''"]);
  const [b2, m2] = trem(['bes,', 'f', 'bes', 'a,', 'e', 'a'], ["bes'", "bes'", "bes'", "a'", "a'", "a'"]);
  bar("<a' d'' e'' f''>1.", 'bes,,1.', dyn(m1, 'p'), b1);
  bar("<a' d'' e''>2. <a' cis'' e''>2.", 'bes,,2. a,,2.', m2.replace(/r16 a'16/, "r16 a'16\\>"), b2);
}
// home: the piano's lowest A, the guitar's open strings ringing as harmonics, and the cry's
// last two notes, Bb to A, high
bar("r2. bes''8(\\ppp a''4.~ a''4)\\fermata", '<a,,, a,,>1.\\fermata',
  "<e\\6\\harmonic a\\5\\harmonic a'\\4\\harmonic e''\\1\\harmonic>1.\\arpeggio\\fermata", S);

// ------------------------------------------------------------------------------ the file --
const voice = (k) => bars.map((b) => (k === 'prh' && b.mark ? `${b.mark} ` : '') + b[k]).join(' |\n    ') + ' \\bar "|."';
const ly = `\\header {
  title = "Duende"
  composer = "for piano and guitar"
}

global = { \\key d \\minor \\time 12/8 }

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
