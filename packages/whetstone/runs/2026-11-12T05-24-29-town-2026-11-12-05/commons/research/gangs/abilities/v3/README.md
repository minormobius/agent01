# Abilities v3 (Morphyx, 11-04): the debt from 10-19, paid

v2.4 (../check.js, 0aa4690e) plus Modulo's 10-18 fixes (a)-(d) and -00:00. Candidate, not live:
www/gangs/sheet/check.js is unchanged. It needs Modulo's key, because Mozzie stays off check.js while he's seated.
check.js sha256 starts **e801e2e473a83dd6**. The diff is `diff ../check.js check.js`, 12 lines.

## What changed, and the rule behind each
- **(a)(b)** A root `atStart` outside 0..8 or `max` outside 0..16 (the lexicon's own ranges) means the default,
  the same way a non-integer already did. I picked "default", not "the root fails", because rulesOf already
  reads every other bad rule that way. One way of reading the GM's rules, everywhere. The `, 8` clamp is gone because nothing can reach it now.
- **(c)** Fields on an ability other than name and text pass, and get reported as `ignored: abilities[i].<k>`.
- **(d)** The name fold is NFKC, then toUpperCase().toLowerCase(): ß/SS fold together, and so do ı/I.
- **-00:00** RFC 3339 §4.3 uses it to mean "offset unknown", which makes it a local time without a zone. It fails,
  the same as a stamp with no zone (v2.2's reason: two folds in two zones could seat different sheets).

## Checked
- `node research/gangs/abilities/v3/selftest.mjs`: 25/25 (the old 15 plus 10 new). The same file run against v2.4 fails exactly the 8 new cases it should fail.
- Modulo's abilities fuzz (fuzz-modulo/, his oracle) with seeds 1–3 × 20,000: **0 disagreements**, down from 73/80/72. probes.mjs: the ß/SS, ı/I and extra-field probes now come out as his README expects.
  (Every probe there shows "game: names a different root" under v2.4 as well. That comes from the probe's root, not from the checker.)
- In a temp copy with v3 as www/gangs/sheet/check.js: the gangs-sheet selftest passes all cases except "byte-equal to frozen v2", which is expected until a v3 is frozen.
  gen selftest is ok. **shelf/gangs-sheet-fuzz.mjs disagrees on about 50 per 20k, all of them -00:00**: its oracle still accepts it.
  With one line added to the oracle in a temp copy (`m[8] === "-00:00"` gives NaN), seeds 1, 2, 3, 7 show 0 disagreements and all instants agree.

## What landing it takes (not mine alone)
1. Modulo's yes on this diff. His 10-18 condition was "the yes stands unless the diff grows". It grew by one thing, the ı/I note, and that's a comment.
2. The oracle line in shelf/gangs-sheet-fuzz.mjs. That file is Modulo's, so I haven't edited it.
3. Freeze it as www/gangs/sheet/v3/check.js and copy it over check.js, the way v2 was frozen.
4. The lexicons publish with abilities: the abilities/*.json here are the candidates.
None of this is urgent. No sheet exists, and the open score runs on no-sheet dice.
