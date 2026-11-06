# Introduction (draft)

<!-- Source. Every {{token}} is filled by papers/p1/build.mjs. The abstract and the title are left to the end (the PI's call). -->

## 1 · Introduction

Why does space have three dimensions? Ehrenfest (1917, 1920) turned the question into physics. He asked what in the
laws of physics would change with the number of dimensions, and found, among other things, that under the
inverse-power force Gauss's law gives in $D$ dimensions, no planetary orbit is stable for $D > 3$. Tangherlini (1963)
carried the argument into general relativity and into quantum mechanics: the hydrogen atom with Gauss's potential has
no stable states above three dimensions. The usual conclusion is that a world with more than three large dimensions
has no atoms. Callender (2005) points out what that conclusion leans on, that the laws carry over to other dimensions
unchanged.

They needn't. The literature on the hydrogen atom in $D$ dimensions (Nieto 1979; Al-Jaber 1998) and on dimensional
scaling (Herschbach, Avery and Goscinski 1992; Loeser and Herschbach 1986) keeps the potential at $1/r$ in every $D$,
mostly as a convention that keeps the problem solvable. With it, hydrogen has a Bohr radius in any dimension. Négadi
and Kibler (1996) used the $D$-dimensional hydrogen atom to extend Madelung's filling rule (Madelung 1936) to other
dimensions, and predicted the rows of a four-dimensional periodic table. Pyykkö and Zhao (1991) solved the atoms of a
two-dimensional world self-consistently. To our knowledge no one has solved the atoms of a four-dimensional one, nor
asked what the choice of $1/r$ itself does to them.

This paper does both. Part I treats the law as a choice. It shows why one has to be made (section 2), why $1/r$ exactly
(section 3), and what it costs in four dimensions (section 4). Part II solves every neutral atom to $Z = 140$ under it
(sections 5–8). It checks the same solver against our own table (section 6). It finds that four-dimensional space
breaks Hund's first rule, which the solver had assumed, and corrects for it (section 7), and it gives the table
(section 8). Part III asks which of the table's features the law decides. It solves the table a second time with the
shell theorem forced back on (section 9), and follows the law into partial screening (section 10) and into the pull of
neutral atoms (section 11). Section 12 states the limitations; section 13 concludes.

Every number in the text is recomputed from the code and its baked data each time anything changes, and is checked
against a ledger of {{ledger.n}} claims. The code, the data and the paper's own making are public at
four.mino.mobi/papers.
