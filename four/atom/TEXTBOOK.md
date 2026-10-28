# The textbook: a plan (draft, for discussion)

ATOM⁴ grew in the order we found things out. Read front to back, it's a lab notebook: chapter 11 corrects chapter 10,
gravity turns up in the stars chapter, and crystals sit inside the gases chapter. This plan reorders it into a book
that teaches the universe, without losing the record of how we got there.

## What there is now

About 25,000 words. Of those, 17,500 are in the thirteen chapters; the rest are in the landing, `/start/`,
`/fields/`, `/table/`, Lumen⁴ and IRIS⁴. The chapters are very uneven:

| chapter | words | | chapter | words |
|---|---|---|---|---|
| 1 the force | 1,570 | | 8 forces between molecules | 1,620 |
| 2 light | 660 | | 9 pxygen and xater | 1,060 |
| 3 motion and spin | 810 | | 10 which water | 1,080 |
| 4 hydrogen | 390 | | 11 ten ways to meet | 2,100 |
| 5 the periodic table | 1,220 | | 12 gases | 2,820 |
| 6 the shapes | 310 | | 13 stars | 2,680 |
| 7 darbon | 500 | | | |

The interactive pages (`/fields/`, `/table/`, Lumen⁴, the 4D viewers) carry much of the teaching, but sit outside the
chapters.

## Principles

1. **Teaching order, not discovery order.** Laws, then atoms, then molecules, then bulk matter, then the sky.
2. **Every claim carries one of four tags**, as `/start/` already does: *a choice* (we decided it), *follows* (argued
   from the choices), *computed* (solved and checked), *open*. In the book they're margin marks.
3. **Every chapter has the same skeleton:**
   - what's different, in one paragraph;
   - the working;
   - **checked against**: the validations, each naming its selftest;
   - **open**: the questions the chapter leaves;
   - the toys, inline where they teach.
4. **Mistakes stay, as boxes.** "How we got it wrong" boxes: the miss (search), the ignition overclaim (stars), the
   salt sum that diverged. Showing them is part of the book's honesty.
5. **The choices are registered once, up front**, each with its cost: the 1/r pin, the lens vacuum, electrons as
   fermions, nuclei stable to 78, the weak force, and gravity's route.
6. **Numbers come from the bakes**, as now; nothing typed by hand.
7. **Cross-references are symbolic.** `ch('gas')` renders "chapter 15" with its link, so the book can be reordered
   without hunting for numbers. About 17 references are hard-coded today.
8. **The site is the book.** A printable edition comes later, with the paper's decisions (`WRITEUP.md`: pre-rendered
   maths, structured references).

## Proposed contents

Each chapter below names where its material lives now.

**Part I · The laws**
1. **Four dimensions, and one choice.** What the universe contains, why Gauss's 1/r² leaves no atom, and pinning at
   1/r. *(force §1–2, plus the weak force from stars)*
2. **Rewriting Maxwell: the lens vacuum.** The routes, their costs, the vacuum we chose, and changing the electron
   instead. *(force §3–4)*
3. **Fields.** Charges in a slice, flux, the neutral atom felt from outside, a current loop's B, and a charge turning
   in two planes. *(the `/fields/` toys, made a chapter)*
4. **Light.** Lumen⁴'s light, what matter feels of it, and the sky. *(light, with Lumen⁴'s toys inline; IRIS⁴ as the
   excursion)*
5. **Motion, turning and spin.** F = ma, rotation in planes, handed spin, tumbling, and twisting bonds. *(motion)*
6. **Gravity.** The same fork as charge, the six routes, and the lens assumed. Kepler under 1/r, and Gauss's unstable
   orbits. *(stars: gravity's routes; orbits: the nudge)*

**Part II · Atoms**

7. **Hydrogen.** *(hydrogen)*
8. **The periodic table.** Rows of 2, 10, 10, 28, 28, the names, partial screening, and how far to trust it. *(table,
   with `/table/` and the filling diagram)*

**Part III · Molecules**

9. **The shapes.** Polytopes, sp⁴ hybrids, and the lattices: A₄, D₄ and the 24-cell's. *(shapes, plus the lattices
   from gases)*
10. **Darbon.** *(darbon)*
11. **Forces between molecules.** *(forces)*
12. **Pxygen and Xater.** *(xater)*
13. **Which water.** The census and the properly searched pairs, as one answer, with the miss as a box. *(census, and
    search's correction)*
14. **Searching in four dimensions.** Ten ways to meet, funnels and mazes, and what a search can promise. *(search)*

**Part IV · Matter in bulk**

15. **Gases.** The ideal gas, B₂, held by the crowd, and the refrigerator. *(gases §1–4)*
16. **Liquids and solids.** Condensation simulated, a world of liquids, noble crystals, and salts (todium gluoride,
    Bl₂Px₃). *(gases §5–7, crystals.mjs, salt.mjs)*

**Part V · The sky**

17. **Stars.** Whether a star holds together, a star solved, lighting it, how big and how small, and the fuel.
    *(stars §2–6)*
18. **Planetary systems.** Orbits round a real star, planets in orthogonal planes, moons, formation (the nebula
    runs), and the light on a planet. This is the orrery's home. *(stars: orbits; the formation work under way)*

**Appendices**

- A. **The choices and their costs**, as a register.
- B. **Methods**: each solver, what it was checked against, and its selftest.
- C. **Open questions.**
- D. **Names and symbols**: the glossary.
- E. **Sources**: LITERATURE.md, moving to `refs.json`.

## Tidying, in order

1. **Done:** stale chapter counts (catalogue, CLAUDE.md), the catalogue's out-of-date boiling point, and the "world
   of liquids" open question, now that coexistence is simulated.
2. **Symbolic cross-references** in the generators, and a selftest that every one resolves.
3. **Retire `old-index.html`.** Chapters 1–7 are still cut from the old one-page version. Give every chapter its own
   source file, as 9–13 already have.
4. **Splits:** force → 1 + 2; stars → 6 + 17 + 18; gases → 15 + 16. Existing URLs keep working: old anchors get a
   one-line pointer to the new place.
5. **The skeleton:** tags, and the "checked against" and "open" boxes, chapter by chapter.
6. **`/start/`** gains the sky (gravity, stars, planets). It stops at gases today.
7. **The landing** groups its cards by part.

## Decisions wanted

1. **Order:** teaching order, as above, or keep discovery order?
2. **Splits:** 18 chapters, or keep 13 and only reorder?
3. **Name:** the book now reaches stars, so "ATOM⁴" names only part of it. Keep it, or name the whole?
4. **Mistake boxes:** keep them in the text (recommended), or move them to an appendix?
