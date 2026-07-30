# @lastnpcalex.agency

## Palette and type
No stated preference yet. Kit defaults throughout (dark surface, monospace);
`want-pairwise-2` added two extra accent colors (`--pole-a` cool blue,
`--pole-b` the kit amber) only because the site needed two distinguishable
poles for a two-handle comparison, not as a signal about palette taste.

## Layout
No pattern yet — one site so far.

## Features they reach for
First request: `want-pairwise-2`, a two-Bluesky-handle comparison tool. The
notable thing about the ask itself was the framing, not a UI feature — they
specified the underlying model in real physics terms ("derive coupling
constant from the pairwise correlation as two point correlation functions and
infer susceptibility from this"), not just "make it look sciencey." Built
literally: a genuine Pearson correlation over the two handles' interaction-
weight vectors, J = atanh(C) (the exact two-spin Ising identity), χ = 1/(1−J)
(Curie–Weiss mean-field, with an explicit "diverges past critical" case
rather than a fabricated number). Worth taking a request like this at face
value and reaching for the real formula rather than a decorative approximation
— this requester used precise technical vocabulary on the first ask.

Second request: `gibson-jackpot`, a mortality/survival calculator (country +
age + income/SES → proportional-hazards survival curve), with a specific
model term named again — "age-based proportional hazards" — not just "chance
of dying." Same pattern as the first ask: built the real thing (Gompertz–
Makeham hazard, log-linear relative-risk multipliers combined multiplicatively
like an actual Cox model), and explicitly disclosed which inputs were sourced
data vs. hand-guessed illustrative numbers rather than presenting guesses as
fact. Two-for-two on "uses precise technical/scientific vocabulary and means
it literally" — worth treating any future request from this requester the
same way: look for the real named model or formula before reaching for
anything decorative, and say plainly in the copy when a number is estimated
rather than sourced.

## Said no to
Nothing recorded yet.

## Notes
A near-identical request ("pairwise interaction circle for bsky... top n
accounts for interaction") landed the same day from a different requester
(`want-pairwise`, @minormobius.bsky.social) asking for a Venn-diagram
presentation instead of an Ising one. Same underlying data idea, different
requesters, different framing — treat these as two independent sites, not a
duplicate to reconcile.
