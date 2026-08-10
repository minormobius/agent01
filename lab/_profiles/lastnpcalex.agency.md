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

## Bugs their sites have shipped with
`gibson-jackpot` turn 1 shipped with the results panel hidden via a
`<style>` block rule (`#resultsWrap{display:none}`) and revealed via
`el.style.display = ''` — which only clears an inline override and does
nothing against a stylesheet rule, so the whole page silently no-opped on
every click. Caught only because they came back and said "don't think it's
working," with zero detail — worth remembering that terse feedback from
this requester means "I clicked it and nothing happened," not a subtle
correctness complaint about the model itself (their asks so far have been
model-literate enough that they'd likely name the actual number if that were
the issue). When toggling visibility that was hidden by an internal
stylesheet, set the property to its real value (`'block'`, `'grid'`, etc.),
never `''`.

## Notes
A near-identical request ("pairwise interaction circle for bsky... top n
accounts for interaction") landed the same day from a different requester
(`want-pairwise`, @minormobius.bsky.social) asking for a Venn-diagram
presentation instead of an Ising one. Same underlying data idea, different
requesters, different framing — treat these as two independent sites, not a
duplicate to reconcile.
