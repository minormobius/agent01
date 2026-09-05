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
