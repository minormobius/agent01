// library.js — the pieces that ship with the site.
//
// A notation tool with an empty text box is a tool nobody uses twice. These are
// here so the first thing a visitor sees is real music they can hear, edit, and
// take away — and so the file format is demonstrated rather than documented.
//
// Everything here is public domain (traditional melodies, and composers dead
// well over a century) or written for this site. The two exceptions to
// "traditional repertoire" are deliberate: `tour` is a feature demonstration,
// and `chorale` was written for this page rather than transcribed, so that the
// grand-staff example is one whose every note can be vouched for rather than
// half-remembered.
//
// Every piece in here is checked by test/library.selftest.mjs: it must parse
// with no diagnostics AND pass its own bar checks. A transcription that does
// not add up is a bug, and the `|` marks are what catch it.

export const LIBRARY = [
  {
    id: 'tour',
    title: 'What this reads',
    composer: 'notation tour',
    blurb: 'Every notation feature the engraver knows, in eight bars.',
    source: `\\header {
  title = "What this reads"
  composer = "notation tour"
}

\\score {
  \\new Staff \\relative c' {
    \\clef treble
    \\key d \\major
    \\time 4/4
    \\tempo "Andante" 4 = 88

    % beams follow the beat; slurs, ties and dots are all read
    d8( e fis g) a4 b |
    <d, fis a>2 cis4. b8 |
    \\tuplet 3/2 { d8 e fis } g4 fis2 |
    r4 a,8 b16 cis d8 e fis4 |

    % accidentals hold for the rest of the bar, then lapse
    ais4 ais a a |
    \\clef bass d,,2 fis |
    \\key f \\major \\time 3/4
    bes4 c d |
    f2.\\fermata
    \\bar "|."
  }
}`,
  },

  {
    id: 'twinkle',
    title: 'Twinkle, Twinkle, Little Star',
    composer: 'traditional',
    blurb: 'The first tune anyone plays. Twelve bars, C major, nothing in the way.',
    source: `\\header {
  title = "Twinkle, Twinkle, Little Star"
  composer = "traditional"
}

\\score {
  \\new Staff \\relative c' {
    \\clef treble
    \\key c \\major
    \\time 4/4
    \\tempo 4 = 100

    c4 c g' g | a a g2 |
    f4 f e e | d d c2 |
    g'4 g f f | e e d2 |
    g4 g f f | e e d2 |
    c4 c g' g | a a g2 |
    f4 f e e | d d c2
    \\bar "|."
  }
}`,
  },

  {
    id: 'ode',
    title: 'Ode to Joy',
    composer: 'Ludwig van Beethoven',
    blurb: 'The theme from the finale of the Ninth Symphony, 1824.',
    source: `\\header {
  title = "Ode to Joy"
  composer = "Ludwig van Beethoven"
}

\\score {
  \\new Staff \\relative c' {
    \\clef treble
    \\key d \\major
    \\time 4/4
    \\tempo 4 = 120

    fis4 fis g a | a g fis e |
    d d e fis | fis4. e8 e2 |
    fis4 fis g a | a g fis e |
    d d e fis | e4. d8 d2 |

    e4 e fis d | e fis8( g) fis4 d |
    e fis8( g) fis4 e | d e a,2 |
    fis'4 fis g a | a g fis e |
    d d e fis | e4. d8 d2
    \\bar "|."
  }
}`,
  },

  {
    id: 'grace',
    title: 'Amazing Grace',
    composer: 'traditional (New Britain)',
    blurb: 'A pentatonic hymn tune in 3/4, and a demonstration of an upbeat.',
    source: `\\header {
  title = "Amazing Grace"
  composer = "traditional (New Britain)"
}

\\score {
  \\new Staff \\relative c' {
    \\clef treble
    \\key g \\major
    \\time 3/4
    \\tempo 4 = 92

    \\partial 4 d4 |
    g2 b8( g) | b2 a4 |
    g2 e4 | d2 d4 |
    g2 b8( g) | b2 a4 |
    d'2. | b2 d4 |
    d2 b8( d) | b2 a4 |
    g2 e4 | d2 d4 |
    g2 b8( g) | b2 a4 |
    g2.~ | g2.
    \\bar "|."
  }
}`,
  },

  {
    id: 'frere',
    title: 'Frère Jacques',
    composer: 'traditional',
    blurb: 'A round, written out as two voices on one staff — the second enters two bars late.',
    source: `\\header {
  title = "Frère Jacques"
  composer = "traditional"
}

\\score {
  \\new Staff <<
    \\new Voice \\relative c' {
      \\voiceOne
      \\clef treble
      \\key c \\major
      \\time 4/4
      \\tempo 4 = 108

      c4 d e c | c d e c |
      e f g2 | e4 f g2 |
      g8 a g f e4 c | g'8 a g f e4 c |
      c4 g c2 | c4 g c2
    }
    \\new Voice \\relative c' {
      \\voiceTwo
      r1 | r1 |
      c4 d e c | c d e c |
      e f g2 | e4 f g2 |
      g8 a g f e4 c | g'8 a g f e4 c |
      c4 g c2 | c4 g c2
      \\bar "|."
    }
  >>
}`,
  },

  {
    id: 'elise',
    title: 'Für Elise (opening)',
    composer: 'Ludwig van Beethoven',
    blurb: 'Bagatelle in A minor, WoO 59, 1810. Sixteenths, accidentals, and a grand staff.',
    source: `\\header {
  title = "Für Elise"
  subtitle = "opening"
  composer = "Ludwig van Beethoven"
}

\\score {
  \\new PianoStaff <<
    \\new Staff \\relative c'' {
      \\clef treble
      \\key a \\minor
      \\time 3/8
      \\tempo "Poco moto" 4 = 72

      \\partial 8 e16 dis |
      e dis e b d c | a8 r16 c, e a |
      b8 r16 e, gis b | c8 r16 e, e' dis |
      e dis e b d c | a8 r16 c, e a |
      b8 r16 e, c' b | a4 r8
      \\bar "|."
    }
    \\new Staff {
      \\clef bass
      \\key a \\minor
      \\time 3/8

      % Absolute octaves, not \\relative: chord members resolve against each
      % other in relative mode, which makes a three-note left-hand voicing
      % surprisingly easy to write an octave wrong. Here \`a,\` is A2 and the
      % voicing is unambiguous on the page.
      \\partial 8 r8 |
      r4. | <a, e a>8 r r |
      <e, e gis>8 r r | <a, e a>8 r r |
      r4. | <a, e a>8 r r |
      <e, e gis>8 r r | <a, e a>8 r r
    }
  >>
}`,
  },

  {
    id: 'chorale',
    title: 'Chorale in C',
    composer: 'written for clef',
    blurb: 'Four voices on two staves: what a hymn-book page looks like.',
    source: `\\header {
  title = "Chorale in C"
  composer = "written for clef"
}

\\score {
  \\new PianoStaff <<
    \\new Staff <<
      \\clef treble
      \\key c \\major
      \\time 4/4
      \\tempo 4 = 76
      \\new Voice \\relative c'' { \\voiceOne
        e4 e d c | d2 c2 |
        e4 f g g | a2 g2 |
        g4 f e d | c2 d2 |
        e4 d c b | c1
        \\bar "|."
      }
      \\new Voice \\relative c' { \\voiceTwo
        c4 c b g | a2 g2 |
        c4 c d e | f2 e2 |
        e4 d c b | g2 a2 |
        c4 b g g | g1
      }
    >>
    \\new Staff <<
      \\clef bass
      \\key c \\major
      \\time 4/4
      \\new Voice \\relative c' { \\voiceOne
        g4 g g e | fis2 g2 |
        g4 a b c | c2 c2 |
        c4 a g g | e2 fis2 |
        g4 g e d | e1
      }
      \\new Voice \\relative c { \\voiceTwo
        c4 c g c | d2 g,2 |
        c4 f g c, | f2 c2 |
        c4 d e g | c,2 d2 |
        c4 g c g | c1
      }
    >>
  >>
}`,
  },

  {
    id: 'rondo',
    title: 'Rondo in G major',
    composer: 'modulo',
    blurb: 'Written here, not transcribed: an original rondo in the classical style — theme, dominant episode, decorated return, a turn to the minor, and a coda.',
    source: "\\version \"2.24.0\"\n\n\\header {\n  title = \"Rondo in G major\"\n  composer = \"modulo\"\n  copyright = \"CC0 1.0 \u2014 dedicated to the public domain\"\n}\n\n%% ---------------------------------------------------------------- A ------\n%% The rondo theme. A period: four bars asking, four answering.\nthemeR = {\n  d''8.( e''16 d''8) g''8       |\n  b''8 a''8 g''8 fis''8         |\n  e''8.( fis''16 e''8) a''8     |\n  a''8 g''8 fis''4              |\n  d''8.( e''16 d''8) g''8       |\n  b''8 a''8 g''8 fis''8         |\n  e''8 d''8 c''8 a'8            |\n  g'2                           |\n}\n\nthemeL = {\n  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |\n  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |\n  c16 a16 e16 a16 c16 a16 e16 a16       |\n  d16 a16 fis16 a16 d16 a16 fis16 a16   |\n  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |\n  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |\n  c16 a16 e16 a16 d16 c'16 fis16 a16    |\n  g,16 d16 b,16 d16 g,4                 |\n}\n\n%% ------------------------------------------------------- A, decorated ----\n%% The middle return. Same skeleton, same harmony, same bass \u2014 every beat still\n%% lands on the note the plain theme lands on. What changes is the surface:\n%% neighbour notes fill the dotted figure, and the descent in bar 2 picks up an\n%% upper neighbour that touches the top C. A rondo whose returns are literal\n%% repeats is an outline of a piece rather than a piece.\nthemeRvar = {\n  d''16 e''16 d''16 c''16 d''8 g''8                    |\n  b''16 c'''16 b''16 a''16 g''16 a''16 g''16 fis''16   |\n  e''16 fis''16 e''16 d''16 e''8 a''8                  |\n  a''16 g''16 fis''16 g''16 fis''4                     |\n  d''16 e''16 d''16 c''16 d''8 g''8                    |\n  b''16 c'''16 b''16 a''16 g''16 a''16 g''16 fis''16   |\n  e''16 fis''16 e''16 d''16 c''16 d''16 c''16 a'16     |\n  g'2                                                  |\n}\n\n%% ---------------------------------------------------------------- B ------\n%% The dominant episode: long notes against the theme's running figures.\nepiBR = {\n  a'4 d''4                      |\n  g''8 e''8 cis''4              |\n  d''4 fis''4                   |\n  e''8 d''8 cis''4              |\n  fis''4 a''4                   |\n  b''8 a''8 g''4                |\n  g''8 fis''8 e''8 cis''8       |\n  d''2                          |\n}\n\nepiBL = {\n  d8 <fis a>8 d8 <fis a>8       |\n  a,8 <cis g>8 a,8 <cis g>8     |\n  d8 <fis a>8 d8 <fis a>8       |\n  a,8 <cis e>8 a,8 <cis e>8     |\n  d8 <fis a>8 d8 <fis a>8       |\n  g,8 <b, d>8 g,8 <b, d>8       |\n  a,8 <cis g>8 a,8 <cis g>8     |\n  d16 a16 fis16 a16 d4          |\n}\n\n%% ---------------------------------------------------------------- C ------\n%% The minor centre, and the two bars that lean back toward home.\nepiCR = {\n  b'8 e''8 g''8 fis''8          |\n  e''8 dis''8 e''8 fis''8       |\n  g''8 fis''8 e''8 dis''8       |\n  e''4 b'4                      |\n  b'8 e''8 g''8 b''8            |\n  a''8 g''8 fis''8 e''8         |\n  dis''8 e''8 fis''8 dis''8     |\n  e''2                          |\n  a''8 g''8 fis''8 e''8         |\n  d''8 c''8 b'8 a'8             |\n}\n\nepiCL = {\n  e,8 b,8 e8 g8                 |\n  b,8 fis8 b8 dis8              |\n  e,8 b,8 e8 g8                 |\n  b,8 fis8 dis8 fis8            |\n  e,8 b,8 e8 g8                 |\n  a,8 e8 a8 c'8                 |\n  b,8 fis8 dis8 fis8            |\n  e,8 b,8 e8 b,8                |\n  d16 a16 fis16 c'16 d16 a16 fis16 c'16 |\n  d16 a16 fis16 c'16 d16 a16 fis16 c'16 |\n}\n\n%% ------------------------------------------------------------- coda ------\ncodaR = {\n  g'16 a'16 b'16 c''16 d''16 e''16 fis''16 g''16       |\n  a''16 b''16 c'''16 b''16 a''16 g''16 fis''16 e''16   |\n  d''8 g''8 b''8 g''8           |\n  <g' b' d'' g''>2              |\n}\n\ncodaL = {\n  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |\n  %% The dominant seventh in FIRST INVERSION, not root position. In root\n  %% position the outer voices ran G-D-G against D-A-D \u2014 bare parallel fifths\n  %% straight through the coda's flourish. With F sharp in the bass the two\n  %% lines move in contrary motion instead, and the bass rises a step into the\n  %% tonic, which is the better cadence anyway.\n  fis,16 d16 a16 c'16 fis,16 d16 a16 c'16 |\n  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |\n  <g, g>2                     |\n}\n\n\\score {\n  \\new PianoStaff <<\n    \\new Staff {\n      \\clef treble\n      \\key g \\major\n      \\time 2/4\n      \\tempo \"Allegretto grazioso\" 4 = 108\n      \\themeR \\epiBR \\themeRvar \\epiCR \\themeR \\codaR\n      \\bar \"|.\"\n    }\n    \\new Staff {\n      \\clef bass\n      \\key g \\major\n      \\time 2/4\n      \\themeL \\epiBL \\themeL \\epiCL \\themeL \\codaL\n    }\n  >>\n}\n",
  },
  {
    id: 'guitar',
    title: 'Open Strings',
    composer: 'for guitar',
    blurb: 'Notation over tablature: harmonics, Travis picking, a hammer-on and a pull-off, strummed chords, a rolled G. Play it on the physical guitar.',
    source: `\\header {
  title = "Open Strings"
  composer = "for guitar"
}

global = { \\key g \\major \\time 4/4 \\tempo 4 = 84 }

% the fingers: harmonics, then off-beats over the thumb, then strums
upper = {
  % natural harmonics: the 12th fret on the four low strings, the 7th on three
  e4\\6\\harmonic a\\5\\harmonic d'\\4\\harmonic g'\\3\\harmonic |
  a4\\4\\harmonic d'\\3\\harmonic fis'\\2\\harmonic e''\\1\\harmonic |
  % open strings ringing into each other
  e,8 b, fis g b e' b g |
  c8 e g d' g' d' g e |
  % Travis picking: the top two strings held at the third fret through every chord
  g'8 d' s g' s g s d' |
  fis'8 d' s fis' s a s d' |
  g'8 d' s g' s g s d' |
  g'8 d' s g' s g s d' |
  % again, with a hammer-on on the G string
  g'8 d' s g' s g16( a) s8 d' |
  fis'8 d' s fis' s a s d' |
  g'8 d' s g' s g s d' |
  g'8 d' s g' s g s d' |
  % strummed: down, down-up, up-down-up
  \\f <a, e g c' e'>4 q8 q r q q q |
  <c e g d' g'>4 q8 q r q q q |
  <g, b, d g d' g'>4 q8 q r q q q |
  <d a d' fis'>4 q8 q r q q q |
  % a rolled G, and harmonics over the top
  \\mf <g, b, d g d' g'>1\\arpeggio |
  g'4\\3\\harmonic b'\\2\\harmonic e''\\1\\harmonic s4 \\bar "|."
}

% the thumb: alternating bass, with a hammer-on and a pull-off the second time
lower = {
  s1*4 |
  g,4 d g, d |
  fis,4 d fis, d |
  e,4 e e, e |
  c4 e c e |
  g,4 d g, d |
  fis,4 d fis, d |
  e,4 e b,8( a,) e4 |
  c4 d16( e8.) c4 e |
  s1*5 |
  s2. g,4\\6 |
}

\\score {
  \\new StaffGroup <<
    \\new Staff \\with { instrumentName = "Guitar" midiInstrument = "acoustic guitar (nylon)" }
      << \\global \\clef "treble_8" \\upper \\\\ \\lower >>
    \\new TabStaff << \\global \\upper \\\\ \\lower >>
  >>
}`,
  },

  {
    id: 'duende',
    title: 'Duende',
    composer: 'for piano and guitar',
    blurb: 'A jazz ballad that turns into a flamenco duel, for the two physical models together: the circle of fifths, tritone subs, trading fours, six rounds of the Andalusian cadence, and an ending on F Lydian made of open-string harmonics.',
    source: `\\header {
  title = "Duende"
  composer = "for piano and guitar"
}

global = { \\key a \\minor \\time 4/4 \\tempo 4 = 132 }

pianoRH = {
    \\mark "Intro" r1 |
    r1 |
    r2 <e'' f''>2\\pp |
    r1 |
    <a' b' c'' e''>1 |
    r2 <gis' d''>2 |
    \\mark "Head" \\mp r4 a'4 f''2 |
    e''4. d''8 c''2 |
    b'4 c''4 d''4 e''4 |
    f''2 e''2 |
    d''4. c''8 b'2 |
    g'1 |
    a'4 b'4 c''4 e''4 |
    e''2. d''4 |
    c''4 d''4 f''2 |
    f''4. e''8 d''2 |
    gis'4 b'4 d''4 f''4 |
    e''2 d''2 |
    c''4 b'4 gis'2 |
    a'1 |
    c''2 a'2 |
    g''4 f''4 e''4 d''4 |
    \\mark "Head, the guitar sings" \\p r4 <c' e' f' g'>4 r4 <c' e' f' g'>4 |
    r2 r8 e'''8 d''' c''' |
    r4 <ces' f' g' bes'>4 r4 <ces' f' g' bes'>4 |
    r2 <ces' f' g' bes'>2 |
    r4 <b d' e' g'>4 r4 <b d' e' g'>4 |
    r4 b''8 a'' g''4 e''4 |
    r4 <a c' e'>4 r4 <a c' e'>4 |
    r2 <a c' e'>2 |
    r4 <a d' f'>4 r4 <a d' f'>4 |
    r2 <a d' f'>2 |
    r4 <aes d' e' g'>4 r4 <aes d' e' g'>4 |
    r2 <aes d' e' g'>2 |
    r4 <gis b c' e'>4 r4 <gis b c' e'>4 |
    r4 c'''8 b'' gis''4 e''4 |
    r4 <aes d' g'>4 r4 <aes d' g'>4 |
    r2 <gis d' g'>2 |
    \\mark "Guitar" \\mp r8 <c'' e'' g'' b''>4 r8 q4 r4 |
    r8 <c'' e'' g'' b''>4 r8 q4 r4 |
    r8 <c'' e'' f'' a''>4 r8 q4 r4 |
    r8 <gis' d'' g''>4 r8 q4 r4 |
    \\mark "Trading fours" \\f r8 e''8 c''' b'' a'' gis'' a'' e'' |
    c'''8 b'' a'' g'' fis'' e'' dis'' e'' |
    f''8 a'' d''' c''' \\tuplet 3/2 { b''8 c''' b'' } a''4 |
    gis''8 b'' d''' f''' e'''4 r4 |
    \\mark "Guitar" \\mp r8 <c'' e'' g'' b''>4 r8 q4 r4 |
    r8 <c'' e'' g'' b''>4 r8 q4 r4 |
    r8 <c'' e'' f'' a''>4 r8 q4 r4 |
    r8 <gis' d'' g''>4 r8 q4 r4 |
    \\mark "Piano" \\f <a' a''>8 <c'' c'''> <e'' e'''> <a'' a'''>4 <g'' g'''>8 <e'' e'''> <c'' c'''> |
    <b' b''>8 <a' a''> <gis' gis''>4 <a' a''>2 |
    <d'' d'''>8 <f'' f'''> <a'' a'''> <f'' f'''> <d'' d'''>4 <a' a''>4 |
    <gis' gis''>8 <b' b''> <d'' d'''> <f'' f'''> <e'' e'''>4 r4 |
    \\mark "Duel" r1 |
    r1 |
    r1 |
    r1 |
    \\mark "" \\mf r8 <c'' e''>8 a'8 <c'' e''>8 r8 <c'' e''>8 a'8 <c'' e''>8 |
    r8 <b' d''>8 g'8 <b' d''>8 r8 <b' d''>8 g'8 <b' d''>8 |
    r8 <a' c''>8 f'8 <a' c''>8 r8 <a' c''>8 f'8 <a' c''>8 |
    r8 <gis' d''>8 e'8 <gis' d''>8 r8 <gis' d''>8 e'8 <gis' d''>8 |
    \\mark "Picado" <a' b' c'' e''>8-> r8 r8 <a' b' c'' e''>8-> r2 |
    <g' a' b' d''>8-> r8 r8 <g' a' b' d''>8-> r2 |
    <f' g' a' c''>8-> r8 r8 <f' g' a' c''>8-> r2 |
    <e' f' gis' b'>8-> r8 r8 <e' f' gis' b'>8-> r2 |
    \\mark "The answer" \\ff <e''' e''''>16 <d''' d''''> <c''' c''''> <b'' b'''> <a'' a'''> <gis'' gis'''> <a'' a'''> <b'' b'''> <c''' c''''>8 <e''' e''''> <a''' a''''>4 |
    <g''' g''''>16 <f''' f''''> <e''' e''''> <d''' d''''> <c''' c''''> <b'' b'''> <a'' a'''> <g'' g'''> <b'' b'''>8 <d''' d''''> <g''' g''''>4 |
    <f''' f''''>16 <e''' e''''> <d''' d''''> <c''' c''''> <a'' a'''> <gis'' gis'''> <f'' f'''> <e'' e'''> <f'' f'''>8 <a'' a'''> <c''' c''''>4 |
    <e'' e'''>16 <f'' f'''> <gis'' gis'''> <a'' a'''> <b'' b'''> <c''' c''''> <d''' d''''> <e''' e''''> <f''' f''''>8 <e''' e''''> <gis''' gis''''>4 |
    \\mark "Unison" <a' a''>16 <b' b''> <c'' c'''> <d'' d'''> <e'' e'''> <f'' f'''> <gis'' gis'''> <a'' a'''> <b'' b'''>8 <c''' c''''> <e''' e''''>4 |
    <g' g''>16 <a' a''> <b' b''> <c'' c'''> <d'' d'''> <e'' e'''> <f'' f'''> <g'' g'''> <a'' a'''>8 <b'' b'''> <d''' d''''>4 |
    <f' f''>16 <gis' gis''> <a' a''> <b' b''> <c'' c'''> <d'' d'''> <e'' e'''> <f'' f'''> <gis'' gis'''>8 <a'' a'''> <c''' c''''>4 |
    <e' e''>16 <f' f''> <gis' gis''> <a' a''> <b' b''> <c'' c'''> <d'' d'''> <e'' e'''> <f'' f'''>8 <gis'' gis'''> <b'' b'''>4 |
    \\mark "Fists" \\fff <a' b' c'' e''>8-> <a' b' c'' e''> <a' b' c'' e''> <a' b' c'' e''>-> <a' b' c'' e''> <a' b' c'' e''> <a' b' c'' e''>-> <a' b' c'' e''> |
    <g' a' b' d''>8-> <g' a' b' d''> <g' a' b' d''> <g' a' b' d''>-> <g' a' b' d''> <g' a' b' d''> <g' a' b' d''>-> <g' a' b' d''> |
    <f' g' a' c''>8-> <f' g' a' c''> <f' g' a' c''> <f' g' a' c''>-> <f' g' a' c''> <f' g' a' c''> <f' g' a' c''>-> <f' g' a' c''> |
    <gis' b' d'' f'' gis''>1\\fermata |
    r1 |
    \\mark "Coda, the roles swapped" \\pp r4 <f' c''>4 r8 <f' c''>8 r4 |
    r2 <f' c''>4. <f' c''>8 |
    r4 <f' b' e''>4 r8 <f' b' e''>8 r4 |
    r2 <f' b' e''>4. <f' b' e''>8 |
    r4 <e' b' d''>4 r8 <e' b' d''>8 r4 |
    r2 <e' b' d''>4. <e' b' d''>8 |
    r4 <a' e'' b''>4 r8 <a' e'' b''>8 r4 |
    r2 <a' e'' b''>4. <a' e'' b''>8 |
    \\pp <a' c'' e'' b''>1\\arpeggio~ |
    <a' c'' e'' b''>1 |
    b''1\\fermata \\bar "|."
}
pianoLH = {
    r1 |
    r1 |
    e,,1 |
    r1 |
    a,,1 |
    e,1 |
    <f a c' e'>1 |
    r4 <f a c' e'>2. |
    <f b e'>1 |
    r4 <f b e'>2. |
    <e g b d'>1 |
    r4 <e g b d'>2. |
    <e a b>1 |
    r4 <e a b>2. |
    <a d' f'>1 |
    r4 <a d' f'>2. |
    <gis d' f'>1 |
    r4 <gis d' f'>2. |
    <c' e' gis'>1 |
    r4 <c' e' gis'>2. |
    <c' fis' a'>1 |
    <gis d' g'>1 |
    d,1 |
    d,1 |
    des,1 |
    des,1 |
    c,1 |
    c,1 |
    fis,1 |
    fis,2 b,,2 |
    b,,1 |
    b,,1 |
    bes,,1 |
    bes,,1 |
    a,,1 |
    a,,1 |
    bes,,1 |
    bes,,2 e,2 |
    a,,4. e,8 r4 a,,4 |
    a,,4. e,8 r4 a,,4 |
    d,4. a,8 r4 d,4 |
    e,4. b,8 r4 e,4 |
    a,,4. e,8 r4 a,,4 |
    a,,4. e,8 r4 a,,4 |
    d,4. a,8 r4 d,4 |
    e,4. b,8 r4 e,4 |
    a,,4. e,8 r4 a,,4 |
    a,,4. e,8 r4 a,,4 |
    d,4. a,8 r4 d,4 |
    e,4. b,8 r4 e,4 |
    a,,4. e,8 r4 a,,4 |
    a,,4. e,8 r4 a,,4 |
    d,4. a,8 r4 d,4 |
    e,4. b,8 r4 e,4 |
    r1 |
    r1 |
    r1 |
    r1 |
    <a,, a,>8.-> <a,, a,>8. <a,, a,>8 <a,, a,>8.-> <a,, a,>8. <a,, a,>8 |
    <g,, g,>8.-> <g,, g,>8. <g,, g,>8 <g,, g,>8.-> <g,, g,>8. <g,, g,>8 |
    <f,, f,>8.-> <f,, f,>8. <f,, f,>8 <f,, f,>8.-> <f,, f,>8. <f,, f,>8 |
    <e,, e,>8.-> <e,, e,>8. <e,, e,>8 <e,, e,>8.-> <e,, e,>8. <e,, e,>8 |
    a,,2 a,,2 |
    g,,2 g,,2 |
    f,,2 f,,2 |
    e,,2 e,,2 |
    <a,, a,>8.-> <a,, a,>8. <a,, a,>8 <a,, a,>8.-> <a,, a,>8. <a,, a,>8 |
    <g,, g,>8.-> <g,, g,>8. <g,, g,>8 <g,, g,>8.-> <g,, g,>8. <g,, g,>8 |
    <f,, f,>8.-> <f,, f,>8. <f,, f,>8 <f,, f,>8.-> <f,, f,>8. <f,, f,>8 |
    <e,, e,>8.-> <e,, e,>8. <e,, e,>8 <e,, e,>8.-> <e,, e,>8. <e,, e,>8 |
    <a,, a,>8.-> <a,, a,>8. <a,, a,>8 <a,, a,>8.-> <a,, a,>8. <a,, a,>8 |
    <g,, g,>8.-> <g,, g,>8. <g,, g,>8 <g,, g,>8.-> <g,, g,>8. <g,, g,>8 |
    <f,, f,>8.-> <f,, f,>8. <f,, f,>8 <f,, f,>8.-> <f,, f,>8. <f,, f,>8 |
    <e,, e,>8.-> <e,, e,>8. <e,, e,>8 <e,, e,>8.-> <e,, e,>8. <e,, e,>8 |
    <a,, a,>8.-> <a,, a,>8. <a,, a,>8 <a,, a,>8.-> <a,, a,>8. <a,, a,>8 |
    <g,, g,>8.-> <g,, g,>8. <g,, g,>8 <g,, g,>8.-> <g,, g,>8. <g,, g,>8 |
    <f,, f,>8.-> <f,, f,>8. <f,, f,>8 <f,, f,>8.-> <f,, f,>8. <f,, f,>8 |
    <e,, e,>1\\fermata |
    r1 |
    d,1 |
    d,2 d,2 |
    g,,1 |
    g,,2 g,,2 |
    c,1 |
    c,2 c,2 |
    f,,1 |
    f,,2 f,,2 |
    <f,, c,>1~ |
    <f,, c,>1 |
    r1 \\bar "|."
}
guitarUp = {
    \\p e2\\6\\harmonic a2\\5\\harmonic |
    d'2\\4\\harmonic g'2\\3\\harmonic |
    <e, b, e gis b f'>1\\arpeggio |
    r4 f'8( e') d'4 c'8( b) |
    <a, e a c' e'>1\\arpeggio |
    r2 e'4( f') |
    \\mp r4 <f c'>4 r8 <f c'>8 r4 |
    r2 <f c'>4. <f c'>8 |
    r4 <f b e'>4 r8 <f b e'>8 r4 |
    r2 <f b e'>4. <f b e'>8 |
    r4 <e b d'>4 r8 <e b d'>8 r4 |
    r2 <e b d'>4. <e b d'>8 |
    r4 <a e' b'>4 r8 <a e' b'>8 r4 |
    r2 <a e' b'>4. <a e' b'>8 |
    r4 <a d' f'>4 r8 <a d' f'>8 r4 |
    r2 <a d' f'>4. <a d' f'>8 |
    r4 <gis d' f'>4 r8 <gis d' f'>8 r4 |
    r2 <gis d' f'>4. <gis d' f'>8 |
    r4 <c' e' gis'>4 r8 <c' e' gis'>8 r4 |
    r2 <c' e' gis'>4. <c' e' gis'>8 |
    r4 <c' fis' a'>4 r8 <c' fis' a'>8 r4 |
    r2 <gis d' g'>4. <gis d' g'>8 |
    \\f r4 a'4\\glissando f''2 |
    e''4.( d''8) c''2 |
    b'4 c''4 d''4 e''4 |
    f''2 e''2 |
    d''4. c''8 b'2 |
    g'1 |
    a'4 b'4 c''4 e''4 |
    e''2.( d''4) |
    c''4( d''4) f''2 |
    f''4. e''8 d''2 |
    gis'4 b'4 d''4 f''4 |
    e''2 d''2 |
    c''4( b'4) gis'2 |
    a'1 |
    c''2 a'2 |
    g''4 f''4 e''4 d''4 |
    \\f r8 a'8 c''8 e''8 g''4 f''8 e'' |
    \\tuplet 3/2 { d''8 e'' d'' } c''8 a' b'8 c'' a'4 |
    d''8 f'' a'' b'' a''4 f''8 d'' |
    gis''8 f'' e'' d'' \\tuplet 3/2 { c''8 b' a' } gis'4 |
    \\mp r8 <a, e g c' e'>8 r4 r8 <a, e g c' e'>8 <a, e g c' e'>4 |
    r8 <a, e g c' e'>8 r4 r8 <a, e g c' e'>8 <a, e g c' e'>4 |
    r8 <d a c' f'>8 r4 r8 <d a c' f'>8 <d a c' f'>4 |
    r8 <e gis d' g'>8 r4 r8 <e gis d' g'>8 <e gis d' g'>4 |
    \\f a'16 b' c'' d'' e'' d'' c'' b' a'8 e'' c''4 |
    \\tuplet 3/2 { e''8 f'' e'' } d''8 c'' b'16 c'' d'' e'' f''8 e'' |
    f''16 e'' d'' c'' a'8 d'' f''4 a''4 |
    gis''16 a'' gis'' f'' e''8 d'' c''8 b' gis'4 |
    \\mp r8 <a, e g c' e'>8 r4 r8 <a, e g c' e'>8 <a, e g c' e'>4 |
    r8 <a, e g c' e'>8 r4 r8 <a, e g c' e'>8 <a, e g c' e'>4 |
    r8 <d a c' f'>8 r4 r8 <d a c' f'>8 <d a c' f'>4 |
    r8 <e gis d' g'>8 r4 r8 <e gis d' g'>8 <e gis d' g'>4 |
    \\f <a, e a c' e'>8->\\arpeggio <a, e a c' e'>16 <a, e a c' e'> <a, e a c' e'>8 <a, e a c' e'>8-> r8 <a, e a c' e'>8 <a, e a c' e'>16 <a, e a c' e'> <a, e a c' e'>8 |
    <g, b, d g b g'>8->\\arpeggio <g, b, d g b g'>16 <g, b, d g b g'> <g, b, d g b g'>8 <g, b, d g b g'>8-> r8 <g, b, d g b g'>8 <g, b, d g b g'>16 <g, b, d g b g'> <g, b, d g b g'>8 |
    <f, c f a c' f'>8->\\arpeggio <f, c f a c' f'>16 <f, c f a c' f'> <f, c f a c' f'>8 <f, c f a c' f'>8-> r8 <f, c f a c' f'>8 <f, c f a c' f'>16 <f, c f a c' f'> <f, c f a c' f'>8 |
    <e, b, e gis b f'>8->\\arpeggio <e, b, e gis b f'>16 <e, b, e gis b f'> <e, b, e gis b f'>8 <e, b, e gis b f'>8-> r8 <e, b, e gis b f'>8 <e, b, e gis b f'>16 <e, b, e gis b f'> <e, b, e gis b f'>8 |
    <a, e a c' e'>8->\\arpeggio <a, e a c' e'>16 <a, e a c' e'> <a, e a c' e'>8 <a, e a c' e'>8-> r8 <a, e a c' e'>8 <a, e a c' e'>16 <a, e a c' e'> <a, e a c' e'>8 |
    <g, b, d g b g'>8->\\arpeggio <g, b, d g b g'>16 <g, b, d g b g'> <g, b, d g b g'>8 <g, b, d g b g'>8-> r8 <g, b, d g b g'>8 <g, b, d g b g'>16 <g, b, d g b g'> <g, b, d g b g'>8 |
    <f, c f a c' f'>8->\\arpeggio <f, c f a c' f'>16 <f, c f a c' f'> <f, c f a c' f'>8 <f, c f a c' f'>8-> r8 <f, c f a c' f'>8 <f, c f a c' f'>16 <f, c f a c' f'> <f, c f a c' f'>8 |
    <e, b, e gis b f'>8->\\arpeggio <e, b, e gis b f'>16 <e, b, e gis b f'> <e, b, e gis b f'>8 <e, b, e gis b f'>8-> r8 <e, b, e gis b f'>8 <e, b, e gis b f'>16 <e, b, e gis b f'> <e, b, e gis b f'>8 |
    \\ff e''16 d'' c'' b' a' gis' a' b' c''8 e'' a''4 |
    g''16 f'' e'' d'' c'' b' a' g' b'8 d'' g''4 |
    f''16 e'' d'' c'' a' gis' f' e' f'8 a' c''4 |
    e'16 f' gis' a' b' c'' d'' e'' f''8 e'' gis''4 |
    <a, e a c' e'>8->\\arpeggio <a, e a c' e'>16 <a, e a c' e'> <a, e a c' e'>8 <a, e a c' e'>8-> r8 <a, e a c' e'>8 <a, e a c' e'>16 <a, e a c' e'> <a, e a c' e'>8 |
    <g, b, d g b g'>8->\\arpeggio <g, b, d g b g'>16 <g, b, d g b g'> <g, b, d g b g'>8 <g, b, d g b g'>8-> r8 <g, b, d g b g'>8 <g, b, d g b g'>16 <g, b, d g b g'> <g, b, d g b g'>8 |
    <f, c f a c' f'>8->\\arpeggio <f, c f a c' f'>16 <f, c f a c' f'> <f, c f a c' f'>8 <f, c f a c' f'>8-> r8 <f, c f a c' f'>8 <f, c f a c' f'>16 <f, c f a c' f'> <f, c f a c' f'>8 |
    <e, b, e gis b f'>8->\\arpeggio <e, b, e gis b f'>16 <e, b, e gis b f'> <e, b, e gis b f'>8 <e, b, e gis b f'>8-> r8 <e, b, e gis b f'>8 <e, b, e gis b f'>16 <e, b, e gis b f'> <e, b, e gis b f'>8 |
    a16 b c' d' e' f' gis' a' b'8 c'' e''4 |
    g16 a b c' d' e' f' g' a'8 b' d''4 |
    f16 gis a b c' d' e' f' gis'8 a' c''4 |
    e16 f gis a b c' d' e' f'8 gis' b'4 |
    \\fff <a, e a c' e'>8->\\arpeggio <a, e a c' e'>16 <a, e a c' e'> <a, e a c' e'>8 <a, e a c' e'>8-> r8 <a, e a c' e'>8 <a, e a c' e'>16 <a, e a c' e'> <a, e a c' e'>8 |
    <g, b, d g b g'>8->\\arpeggio <g, b, d g b g'>16 <g, b, d g b g'> <g, b, d g b g'>8 <g, b, d g b g'>8-> r8 <g, b, d g b g'>8 <g, b, d g b g'>16 <g, b, d g b g'> <g, b, d g b g'>8 |
    <f, c f a c' f'>8->\\arpeggio <f, c f a c' f'>16 <f, c f a c' f'> <f, c f a c' f'>8 <f, c f a c' f'>8-> r8 <f, c f a c' f'>8 <f, c f a c' f'>16 <f, c f a c' f'> <f, c f a c' f'>8 |
    <e, b, e gis b f'>1\\arpeggio\\fermata |
    r1 |
    \\mp r4 a'4 f''2 |
    e''4. d''8 c''2 |
    b'4 c''4 d''4 e''4 |
    f''2 e''2 |
    d''4. c''8 b'2 |
    g'1 |
    a'4 b'4 c''4 e''4 |
    e''2. d''4 |
    <e\\6\\harmonic a\\5\\harmonic d'\\4\\harmonic g'\\3\\harmonic b'\\2\\harmonic e''\\1\\harmonic>1\\arpeggio |
    r1 |
    r1 \\bar "|."
}
guitarLow = {
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    d1 |
    d2 d2 |
    g,1 |
    g,2 g,2 |
    c1 |
    c2 c2 |
    f,1 |
    f,2 f,2 |
    b,1 |
    b,2 b,2 |
    e,1 |
    e,2 e,2 |
    a,1 |
    a,2 a,2 |
    a,1 |
    e,2 e,2 |
    d2 s2 |
    s1 |
    des2 s2 |
    s1 |
    c2 s2 |
    s1 |
    fis,2 s2 |
    s1 |
    b,2 s2 |
    s1 |
    bes,2 s2 |
    s1 |
    a,2 s2 |
    s1 |
    a,2 s2 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    a,2. r4 |
    a,2. r4 |
    d2. r4 |
    e,2. r4 |
    s1 |
    s1 |
    s1 |
    s1 |
    a,2. r4 |
    a,2. r4 |
    d2. r4 |
    e,2. r4 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 |
    s1 \\bar "|."
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
}`,
  },

  {
    id: 'scales',
    title: 'Scales & key signatures',
    composer: 'reference',
    blurb: 'A page to read against: every key signature, and what a scale looks like in it.',
    source: `\\header {
  title = "Scales & key signatures"
  composer = "reference"
}

\\score {
  \\new Staff \\relative c' {
    \\clef treble
    \\time 4/4
    \\tempo 4 = 132

    \\key c \\major   c8 d e f g a b c | c b a g f e d c |
    \\key g \\major   g8 a b c d e fis g | g fis e d c b a g |
    \\key d \\major   d8 e fis g a b cis d | d cis b a g fis e d |
    \\key f \\major   f8 g a bes c d e f | f e d c bes a g f |
    \\key bes \\major bes,8 c d ees f g a bes | bes a g f ees d c bes |
    \\key a \\minor   a,8 b c d e f gis a | a gis f e d c b a
    \\bar "|."
  }
}`,
  },
];

export const byId = (id) => LIBRARY.find((p) => p.id === id) ?? LIBRARY[0];

/** The piece a first-time visitor lands on. */
export const DEFAULT_PIECE = 'tour';
