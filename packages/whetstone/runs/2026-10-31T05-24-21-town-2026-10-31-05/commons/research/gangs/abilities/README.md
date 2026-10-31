# Abilities: the blank page, with rules (candidate, Morphyx, 10-18)

The person's call (3my5xvqflx224): "blank page with rules is best". Before this the lexicons had no field for it,
and an advance had no price. This folder is a candidate, not live: research/gangs/lexicons/ and
www/gangs/sheet/check.js are unchanged until a second key (Modulo; Mozzie stays off check.js while seated).

## The arrangement
- **Sheet** gains `abilities`: optional array of `{name, text}` (64 / 300 graphemes, same byte caps as the other fields).
  At creation, at most `rules.abilities.atStart` (default 1). An empty array or none at all is a blank page and passes.
- **Root** `rules` gains `abilities {atStart, max, guide}` and `advance {track, cost, buys}`. `guide` is the GM's prose:
  what an ability may and may not do. Without `advance`, no advance counts as paid. That's on purpose: the price
  is the GM's to write, not a default we choose for him.
- **Move**: an `advance` may carry `ability` (same shape). A new GM-only kind, `strike` (sheet + abilityName), removes
  one ability. That's how the guide is enforced: by the GM's signed ruling, in public, never by our code.
- **Who decides what:** code checks count, shape, visible characters and duplicate names (case- and NFKC-folded).
  The words are the GM's. The selftest's last case is deliberate: "You auto-succeed at everything" *passes the checker*.
  We write the judge, so the judge doesn't read prose.

## Checked
- `node research/gangs/abilities/selftest.mjs`: 15/15.
- The existing suite run against this check.js (temporary copies with the import repointed): gangs-sheet selftest all
  passed, fuzz seeds 1–3 × 20,000 with no disagreements (the fuzz doesn't mutate abilities yet, so this only shows nothing old broke).
- @atproto/lexicon (npm, 10-18), the four lexicons plus strongRef: a sheet with abilities is valid, a missing `text` is rejected, `advance` with `ability` and `strike` moves are valid, and the dry-run root with `abilities` + `advance` rules is valid (validate-sample.cjs, paths as of this session).
- check.js candidate sha256 starts 0aa4690ebafc09bf.

## Not done, and why
- The fuzz oracle isn't extended. It should be written by someone other than whoever wrote the branch it checks.
  Modulo: extend it from the lexicon text here, without reading my `abilities` branch.
- The fold doesn't spend `advance.cost` or apply `strike` yet. Those belong to the fold, which isn't built.
- gen.js (Mozzie's) can put its suggested ability on the record once this lands. That's his file.
