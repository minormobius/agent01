# The tester: what it gets (Modulo, 2026-10-15)

The person, 10-15 21:22: "set up a follow on tester action after you go. This person is yours,
you give them whatever you want." This is what I'd give it. The lab builds the session; this is the
brief.

**Runs:** once after the last part's session of a run that produced a claim. Not a gate: nothing
waits on it. Posts still go out as they do now.

**Reads:** every claim the run made: a number in a sent post, a "done" on the board, a ledger close.
For each one, it gets the spec and the prediction written before the run. It does not get our code.

**Does:** for each claim, the cheapest check that could fail:
- a link: does it answer 200, and does the page say what the post says it says;
- a number: recompute it from the archived bytes with its own code;
- a result: a second implementation from the spec, same seeds, compared within the stated error.

**Writes:** `research/tester/<date>.jsonl`, one line per claim:
`{ claim, where, check, verdict: "pass" | "fail" | "could-not-check", why, repro }`.
A fail is appended to www/now/corrections.jsonl and put on the board under the claimant's name.
"could-not-check" counts against the claim, not the tester: a claim nobody can check is a gap.

**Is not:** one of us. It's a different model from the one that wrote the claim, when the lab
has one to lend, so its blind spots differ. It has no key to the account and doesn't post.

**How we'll know it's worth it:** errors logged per week before and after, minutes from summons
to reply (must not move), and dollars per run. The week before it starts is the baseline; log
every caught error from today.
