\version "2.24.0"

\header {
  title = "Rondo in G major"
  composer = "modulo"
  copyright = "CC0 1.0 — dedicated to the public domain"
}

%% ---------------------------------------------------------------- A ------
%% The rondo theme. A period: four bars asking, four answering.
themeR = {
  d''8.( e''16 d''8) g''8       |
  b''8 a''8 g''8 fis''8         |
  e''8.( fis''16 e''8) a''8     |
  a''8 g''8 fis''4              |
  d''8.( e''16 d''8) g''8       |
  b''8 a''8 g''8 fis''8         |
  e''8 d''8 c''8 a'8            |
  g'2                           |
}

themeL = {
  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |
  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |
  c16 a16 e16 a16 c16 a16 e16 a16       |
  d16 a16 fis16 a16 d16 a16 fis16 a16   |
  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |
  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |
  c16 a16 e16 a16 d16 c'16 fis16 a16    |
  g,16 d16 b,16 d16 g,4                 |
}

%% ------------------------------------------------------- A, decorated ----
%% The middle return. Same skeleton, same harmony, same bass — every beat still
%% lands on the note the plain theme lands on. What changes is the surface:
%% neighbour notes fill the dotted figure, and the descent in bar 2 picks up an
%% upper neighbour that touches the top C. A rondo whose returns are literal
%% repeats is an outline of a piece rather than a piece.
themeRvar = {
  d''16 e''16 d''16 c''16 d''8 g''8                    |
  b''16 c'''16 b''16 a''16 g''16 a''16 g''16 fis''16   |
  e''16 fis''16 e''16 d''16 e''8 a''8                  |
  a''16 g''16 fis''16 g''16 fis''4                     |
  d''16 e''16 d''16 c''16 d''8 g''8                    |
  b''16 c'''16 b''16 a''16 g''16 a''16 g''16 fis''16   |
  e''16 fis''16 e''16 d''16 c''16 d''16 c''16 a'16     |
  g'2                                                  |
}

%% ---------------------------------------------------------------- B ------
%% The dominant episode: long notes against the theme's running figures.
epiBR = {
  a'4 d''4                      |
  g''8 e''8 cis''4              |
  d''4 fis''4                   |
  e''8 d''8 cis''4              |
  fis''4 a''4                   |
  b''8 a''8 g''4                |
  g''8 fis''8 e''8 cis''8       |
  d''2                          |
}

epiBL = {
  d8 <fis a>8 d8 <fis a>8       |
  a,8 <cis g>8 a,8 <cis g>8     |
  d8 <fis a>8 d8 <fis a>8       |
  a,8 <cis e>8 a,8 <cis e>8     |
  d8 <fis a>8 d8 <fis a>8       |
  g,8 <b, d>8 g,8 <b, d>8       |
  a,8 <cis g>8 a,8 <cis g>8     |
  d16 a16 fis16 a16 d4          |
}

%% ---------------------------------------------------------------- C ------
%% The minor centre, and the two bars that lean back toward home.
epiCR = {
  b'8 e''8 g''8 fis''8          |
  e''8 dis''8 e''8 fis''8       |
  g''8 fis''8 e''8 dis''8       |
  e''4 b'4                      |
  b'8 e''8 g''8 b''8            |
  a''8 g''8 fis''8 e''8         |
  dis''8 e''8 fis''8 dis''8     |
  e''2                          |
  a''8 g''8 fis''8 e''8         |
  d''8 c''8 b'8 a'8             |
}

epiCL = {
  e,8 b,8 e8 g8                 |
  b,8 fis8 b8 dis8              |
  e,8 b,8 e8 g8                 |
  b,8 fis8 dis8 fis8            |
  e,8 b,8 e8 g8                 |
  a,8 e8 a8 c'8                 |
  b,8 fis8 dis8 fis8            |
  e,8 b,8 e8 b,8                |
  d16 a16 fis16 c'16 d16 a16 fis16 c'16 |
  d16 a16 fis16 c'16 d16 a16 fis16 c'16 |
}

%% ------------------------------------------------------------- coda ------
codaR = {
  g'16 a'16 b'16 c''16 d''16 e''16 fis''16 g''16       |
  a''16 b''16 c'''16 b''16 a''16 g''16 fis''16 e''16   |
  d''8 g''8 b''8 g''8           |
  <g' b' d'' g''>2              |
}

codaL = {
  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |
  %% The dominant seventh in FIRST INVERSION, not root position. In root
  %% position the outer voices ran G-D-G against D-A-D — bare parallel fifths
  %% straight through the coda's flourish. With F sharp in the bass the two
  %% lines move in contrary motion instead, and the bass rises a step into the
  %% tonic, which is the better cadence anyway.
  fis,16 d16 a16 c'16 fis,16 d16 a16 c'16 |
  g,16 d16 b,16 d16 g,16 d16 b,16 d16   |
  <g, g>2                     |
}

\score {
  \new PianoStaff <<
    \new Staff {
      \clef treble
      \key g \major
      \time 2/4
      \tempo "Allegretto grazioso" 4 = 108
      \themeR \epiBR \themeRvar \epiCR \themeR \codaR
      \bar "|."
    }
    \new Staff {
      \clef bass
      \key g \major
      \time 2/4
      \themeL \epiBL \themeL \epiCL \themeL \codaL
    }
  >>
}
