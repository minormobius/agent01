# The genome of a font — a sourced map of the design space

Research notes for `rite/font/` (the Roll generator). The question: *what are the
variables that define a Latin typeface, and which of them are objective vs.
irreducibly a matter of the designer's eye?* This is the map we use to decide
which parameters to expose in the genome and where we should not pretend to
automate judgment.

---

## 1. The two layers: continuous axes vs. discrete construction

Industry practice splits the design space the same way our engine does — a set
of **continuous axes** you can interpolate, and **discrete construction choices**
that swap one skeleton for another.

**The five *registered* OpenType variable-font axes** (Microsoft OpenType spec,
introduced in OpenType 1.8, Sept 14 2016, jointly by Apple/Google/Microsoft/Adobe):

| Axis | Tag | Range / units |
|------|-----|---------------|
| Weight | `wght` | 1–1000 (400 = Regular) |
| Width | `wdth` | percentage of normal, > 0 (100 = Regular) |
| Optical size | `opsz` | typographic points, > 0 (text ~10–16) |
| Slant | `slnt` | degrees from upright, > −90 and < 90 (0 = Regular) |
| Italic | `ital` | 0–1 (0 = roman, 1 = italic) |

Sources: learn.microsoft.com OpenType design-variation axis registry and the
per-axis pages (`dvaraxistag_wght`/`_wdth`/`_opsz`/`_slnt`/`_ital`);
opensource.googleblog.com "Introducing OpenType Font Variations".

**Common custom axes.** Foundries add axes with uppercase tags (registered axes
are lowercase, so they never collide). The important one:

- **Grade (`GRAD`)** — adjusts apparent weight *without changing glyph widths*, so
  text doesn't reflow; historically a press/ink-gain equalizer (Google Fonts
  Knowledge; web.dev "Introduction to variable fonts").
- **Roboto Flex** exposes, beyond wght/wdth/opsz/GRAD/slnt, seven *parametric*
  axes: counter width (`XTRA`), thin-stroke (`YOPQ`), and separate heights for
  lowercase/uppercase/ascender/descender/figures (`YTLC`/`YTUC`/`YTAS`/`YTDE`/
  `YTFI`) (Material Design 3 blog, "Roboto Flex now on Google Fonts").

**Axis vs. discrete.** An *axis* is continuous interpolation between masters; a
*discrete* stylistic choice (single- vs double-story a, alternate g) is handled
by the OpenType `STAT` table and stylistic sets, not by interpolation
(learn.microsoft.com `otvaroverview`, `stat`). **This is exactly the
sliders-vs-toggles split in our UI.**

**History worth knowing.** Adobe's *Multiple Master* (March 1991) was the first
interpolation-along-axes system; it failed commercially — apps were hard to
retrofit, support outside Adobe was thin, and designers preferred to ship
individually fine-tuned discrete weights — and was wound down late-90s after the
1996 OpenType announcement. Variable fonts (2016) revived the idea but apply
instances on demand from a single file instead of pre-generating them
(Wikipedia "Multiple master fonts", "Variable font").

---

## 2. Parametric / skeleton systems — our lineage

Our engine is a **skeleton + pen** model, which is the METAFONT lineage:

- **Knuth's METAFONT** draws with **finite-width pens swept along stroke paths**,
  then fills — *not* by defining outlines directly (Wikipedia "Metafont"). This
  is precisely our nib simulator.
- **Computer Modern is governed by 62 parameters** — widths, heights, serif
  presence, dot shape, numeral style, and "superness" (bowl curvature) — yielding
  "an essentially infinite variety" of fonts from one specification (Wikipedia
  "Computer Modern"; Knuth, *Computer Modern Typefaces*, 1986). Low-level
  parameters include `dot_size`, `ess` (the s stroke), `beak`, `apex_corr`
  (CTAN parameter files).
- **The cautionary tale:** Knuth (1996): *"asking an artist to become enough of a
  mathematician to understand how to write a font with 60 parameters is too
  much."* And his "letter **S**" essay documents that the skeleton model's
  optical adjustments exceed what the geometry predicts — the S took him days
  (Wikipedia "Computer Modern"; Knuth "The Letter S", gwern.net mirror). **The
  lesson for us: parameters capture relationships, not intent. Some letters
  (S, the double-story g) resist the skeleton.**

**The contrast model — Noordzij's theory of the stroke.** Gerrit Noordzij
distinguishes three ways a stroke gets its thick/thin:

- **Translation** — a *fixed-angle broad nib*; contrast comes from stroke
  *direction*. (← **this is exactly our `Nib`.**)
- **Expansion** — a *pointed pen* that spreads under pressure; contrast comes from
  stroke *width* (the Didone model).
- **Rotation** — the pen angle itself turns.

(scannerlicker.net "The Art of Eyeballing — Stroke Modulation"; Noordzij,
*The Stroke*.) **Our `modulation` + `pen` genes are a translation pen; an
expansion mode is a future axis.**

- **Karow / IKARUS** (URW, from 1972) established spline outline description and,
  with Zapf, the **hz-program** for automated spacing/kerning (Wikipedia "Peter
  Karow", "Ikarus", "Hz-program").
- **Modern parametric tools** and the parameters they expose:
  **Prototypo** (30+ sliders: thickness, aperture, x-height, serif height/width/
  rotation, width, curviness, contrast, bracket curve); **Spectral** (the first
  parametric Google font); **Metaflop** and **Metapolator** (METAFONT/UFO sliders)
  (AIGA Eye on Design; spectral.prototypo.io; metaflop & metapolator on GitHub).

---

## 3. Construction features & stylistic alternates (the discrete genes)

These change a glyph's *skeleton*, so they are toggles, not sliders:

- **Single- vs double-story `a` and `g`.** Single-story `a` = a bowl + a vertical
  stem; double-story `a` = a bowl plus a stem with a finial arm creating an
  aperture above. Single-story `g` = one bowl with an open tail; double-story `g`
  = two bowls joined by a **link**, with a **loop** below the baseline and an
  **ear**. **Geometric sans (Futura, Renner 1927) use single-story; humanist and
  most text faces (Gill Sans 1928) use double-story** (creativepro.com "TypeTalk:
  Two-Story Type"; Wikipedia "Gill Sans", "Humanist sans-serif").
- **Terminals:** sheared/flat, **ball** (Bodoni, Clarendon), **lachrymal/teardrop**
  (Caslon, Baskerville), spur, finial (Wikipedia "Stroke ending", "Typeface
  anatomy").
- **Aperture:** open vs closed counters; **closed counters measurably impair letter
  recognition** (peer-reviewed; Wikipedia "x-height" on legibility;
  ScienceDirect "Closed letter counters impair recognition").
- **Stress / axis:** angled (calligraphic) vs vertical (rational) — our `pen` gene.
- **Serif structure:** bracketed/adnate (curved transition) vs unbracketed/abrupt
  (slab) (Wikipedia "Slab serif"; typography.guru).
- **Ink traps:** negative space at acute junctions (A, M) to stop ink pooling at
  small sizes — Bell Centennial (Carter, 1976) is the canonical case (Wikipedia
  "Ink trap"; Google Fonts Knowledge).
- **x-height, overshoot, joins, spine, bowl, counter, link, loop, ear** — the
  anatomy vocabulary (Monotype glossary; Wikipedia "Typeface anatomy").

OpenType ships these as **stylistic sets (`ss01`–`ss99`)** and **stylistic
alternates (`salt`)** (Pangram Pangram "OpenType Features").

---

## 4. Classification as a coarse genome

- **Vox-ATypI** (Vox 1954; ATypI 1962): ~11 classes — Humanist, Garalde,
  Transitional, Didone, Mechanistic (slab), Lineal (Grotesque / Neo-grotesque /
  Geometric / Humanist), Glyphic, Script, Graphic, Blackletter, Gaelic. **ATypI
  formally *de-adopted* it on 27 Apr 2021** as inadequate and Latin-centric
  (Wikipedia "Vox-ATypI"; atypi.org de-adoption notice). Useful as named regions
  of the space — the **archetypes** we want to correlate genes into.
- **PANOSE** (Bauermeister 1985): a literal **numeric genome** — a 10-number vector
  for Latin text fonts: (1) family kind, (2) serif style, (3) weight, (4)
  proportion, (5) contrast, (6) stroke variation, (7) arm style, (8) letterform,
  (9) midline, (10) x-height — so visual similarity is *Cartesian distance*
  between fonts (Wikipedia "PANOSE"; Monotype PANOSE guide; learn.microsoft.com
  `ns-wingdi-panose`). **This is the closest prior art to what we're building and
  a good checklist for axes we're still missing (arm style, midline placement).**

---

## 5. Where judgment is irreducible (do **not** fully automate)

These are the places the literature is unanimous that the designer's eye wins —
where our generator should offer good defaults but expect human correction:

- **Overshoot** (optical, form-dependent): round/pointed letters are drawn past the
  flat-letter bounds so they *look* the same height. Karow's *Digital Formats*
  recommends **~3% of cap height for O, ~5% for A** — but it "cannot be determined
  by fixed rules… form-dependent" (Wikipedia "Overshoot"; scannerlicker "Art of
  Eyeballing III"). Frere-Jones: round shapes read as too small because "the parts
  that are too short greatly outnumber the parts that are big enough" (Slate, 2015).
  *(We have an `overshoot` gene — but a single value can't be right for every
  letter.)*
- **Horizontal strokes drawn thinner than vertical.** A 2019 study (de Waard et
  al., *Vision*) found **verticals must be ~5.4% thicker to look equal**; in
  practice geometric faces overcorrect far more — **Futura ~13%, Avenir ~20%**
  (PMC6802759). *(Our broad-nib gets this for free from stroke direction — a nice
  validation of the model — but the exact ratio is a judgment.)*
- **Stroke-thinning at junctions / ink traps** — by eye, per letter.
- **Spacing & kerning.** Side-bearings and kerning are "an especially complex art";
  Phinney calls good kerning "one of the very most tedious tasks… a week or more"
  (632 adjustments). Auto-spacers (HT Letterspacer, iKern) "do **not** replace the
  eye of a master type designer" — they only set white-space-based side-bearings
  (typedesignclass.com; thomasphinney.com; letterspacer.htfonts.com). *(We do
  fixed side-bearings — fine for a toy, the known ceiling for quality.)*
- **Optical sizing:** small sizes want heavier hairlines, larger x-height, looser
  spacing — 500 years of metal-type practice (justanotherfoundry.com).

**Bottom line for the generator:** weight, width, x-height, slant, stress angle,
contrast/modulation, aperture, arch shape, bowl wrap, terminal style, serif
on/off, and single/double-story construction are all legitimately *parametric* —
expose them. Spacing, per-letter overshoot, junction correction, and the final
"does it look right" remain the eye's job; the honest design is to make the
machine roll the space fast and let a human steer.

---

## Coverage today

Latin upper + lower, figures 0–9, common punctuation (`! ? : ; ( ) / ' " + =`
plus `. , -`), accented Latin via base+combining-mark composition (acute, grave,
circumflex, caron, tilde, diaeresis, ring, cedilla → French/German/Spanish/
Portuguese/Czech coverage), and the Greek/Cyrillic letters that share a Latin
skeleton (a starter — the script-specific letters are a future batch). A single
TrueType font caps at 65,535 glyphs, so "all of Unicode" is by definition
multi-font; CJK and cursive/contextual scripts (Arabic/Indic) need their own
construction logic and a shaping engine, so they're out of scope for this
skeleton+pen approach.

## How this maps onto our genome today

Implemented (continuous, sliders): weight (`stem`), `modulation` (translation-pen
contrast), `pen` angle (stress), `width`, `slant`, `xheight`, `aperture`, `arch`,
`bar` height, `bowl` wrap, serif length/height.
Implemented (discrete, toggles): `serif`, `apex_flat` (A), **`two_story_a`**,
**`two_story_g`**, **`ball`** terminals.

Gaps worth adding next (from §2–§5): an **expansion** contrast mode (pointed pen)
alongside translation; **per-letter overshoot** instead of one global value;
**bracketed vs slab** serif structure; **terminal style** as a 3-way (sheared /
flat / ball / teardrop); **arm style & midline** (the PANOSE axes we lack); and —
the big one — **correlated archetypes** (Vox regions: humanist / geometric /
grotesque / didone) so one "style" control moves the independent genes together
into coherent designs rather than random combinations.
