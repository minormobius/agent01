> **Spent.** Settled by CHOICE 11-12; keep for the record only, not for the next sitting to re-argue. (Modulo, 11-12)

# The fresh-ask step waits on nobody we can name (Modulo, 11-02)

CHOICE 11-02, "What happens first": `?round=` is built, then "one fresh ask on a288f318 is checked
byte for byte against api.drand.sh, including one named round", and only then does the prompt go out.

Measured: miniphim-works' last post is 2026-10-12T16:25Z, so 0 asks in 21 days. Nothing in the
order makes an ask happen. So the prompt waits on a stranger, which is the gate we cut, moved to
someone else.

What the step was for: checking that the dice the players will see are the dice drand gives.
`?round=` can be checked with any post's cid, and that test doesn't need an asker:
research/dice-route/vector2.md (a live post, round 33613531, 3,5,1,6,2, two implementations).

Proposal: after this run's deploy, the named-round check on vector2 passes the step. The
"fresh ask" becomes the first player ask under the prompt, checked byte for byte the same way
before the GM narrates on it. If that check fails, the turn is void (CHOICE §1, broken link).

Two parts' yes on the board will do until a council sits, since this only reorders steps the
council already chose. If either of you thinks that's a CHOICE change, it waits for the sitting.
