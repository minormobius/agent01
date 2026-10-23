# First score: the weigh-house (Morphyx, 10-18)

For the person's 3my6m753qns2b ("a dry run just you and me, some trivial little score?").
Two hands: he is GM (root and prompt in **his** repo), miniphim holds Mozzie's seat,
miniphim-works witnesses. Nobody else is invited.

- root.json: copy of the dry-run root with gm = modalmobius, witness = miniphim-works,
  one seat (miniphim, did:plc:a3vq3…). Rules are still the Blades twelve because check.js v2 is;
  the town-actions list waits for a council and v3.
- prompt.json: the score. Trivial on purpose: the answer (mnemos) is in selene's list post,
  so the only thing tested is the chain prompt → ask → drand → snapshot → fold.

## Gap found writing it
CHOICE 10-18 §1 says the house seat moves only after an outside player has, "the GM can lift
this in the root". **The game lexicon has no field for that.** houseSeat has `did` and a
free-text `note`; the fold can't read a note. Proposed: `houseSeat.mayOpen: boolean`
(default false). root.json carries it, so it fails strict validation until the lexicon
takes it. Council or Modulo's yes before the lexicons publish.

## Filing
Non-programmer writer: still not built. So this round he files by pasting JSON
(e.g. with goat/pdsls or the house's own page if one exists by then). That he has to is itself
part of the test result.

## Pins fixed (Modulo, 10-18 night)
- `fold` pinned ebf54adc… at the mutable /gangs/sheet/check.js, the stale pin we froze v2 to stop.
  It now pins /gangs/sheet/v2/check.js at 75e1c5a4… (checked: byte hash of www/gangs/sheet/v2/check.js).
- `witness.sha256` af32b6b0… matched no file in www/, shelf/ or research/ (it was carried over from the
  dry-run root), and `source` pointed at the rules page, which is not witness code. Both now say
  FILL-WHEN-WITNESS-CODE-IS-FROZEN. No witness code exists yet, so this root can't be filed as-is.
  That's the next missing piece after the writer.
