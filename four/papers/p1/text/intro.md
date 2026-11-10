# Introduction (draft)

<!-- Source. Every {{token}} is filled by papers/p1/build.mjs. The abstract and the title are left to the end (the PI's call). -->

## 1 · Introduction

Why does space have three dimensions? Ehrenfest [-@ehrenfest1917; -@ehrenfest1920] turned the question into physics. He asked what in the
laws of physics would change with the number of dimensions, and found, among other things, that under the
inverse-power force Gauss's law gives in $D$ dimensions, no planetary orbit is stable for $D > 3$. @tangherlini1963
carried the argument into general relativity and into quantum mechanics: the hydrogen atom with Gauss's potential has
no stable states above three dimensions. The usual conclusion is that a world with more than three large dimensions
has no atoms. @callender2005 points out what that conclusion leans on, that the laws carry over to other dimensions
unchanged.

They needn't. The literature on the hydrogen atom in $D$ dimensions [@nieto1979; @aljaber1998] and on dimensional
scaling [@herschbach1992; @loeser1986hf; @loeser1986hp; @ghosh2020] keeps the potential at $1/r$ in every $D$,
mostly as a convention that keeps the problem solvable. @negadi1996 used the $D$-dimensional hydrogen atom to extend
Madelung's filling rule [@madelung1936] to any dimension; applied to four, it gives rows of {{nk.rows}}. @pyykko1991
solved the atoms of a two-dimensional world by Hartree–Fock. Above three dimensions there are self-consistent atoms,
but not a table: Hartree–Fock for two-electron atoms in any $D$ [@loeser1986hf], the Thomas–Fermi atom in $n$
dimensions [@kventsel1981], and many-electron models from the limit of large $D$ [@loeser1987atomic; @loeser1994]. To
our knowledge this paper is the first shell-resolved self-consistent survey of the neutral atoms through $Z = 140$ in
four Euclidean dimensions, for a pairwise $1/r$ interaction and electrons with two spin states, with local exchange,
no correlation and a first-order correction for open subshells' terms, cross-checked by Hartree–Fock. Nor, to our
knowledge, has anyone asked what the choice of $1/r$ itself does to the atoms.

This paper does both. Part I treats the law as a choice: why one has to be made, why $1/r$ exactly, and what it costs
in four dimensions (section 2). Part II solves every neutral atom to $Z = 140$ under it (sections 3 and 4) and finds
that four-dimensional space breaks Hund's first rule (section 5). Part III solves the table again with the shell
theorem forced back on, to find which of its features the law decides (section 6), and gives the pull between neutral
atoms that later work on molecules starts from (section 7). The appendices, in the [supplement](supplement.html), hold the arguments and methods in full,
every check of every method against our own world, and the starting data for chemistry: valence states, the atoms'
response, and a test of the valence rule. Every number in the text is recomputed from the code and its data whenever
anything changes, and checked against a ledger of {{ledger.n}} claims. The solvers, with their known-answer tests and a
script that solves the paper's atoms again, are released under the MIT licence at
tangled.org/morphyxmino.bsky.social/four-atom; the data and the paper's making are public at four.mino.mobi/papers.
