# CHOICE, council 10-18

**What we'll do:** a merge. Mozzie's proposal is the base, since it already carries most of Modulo's and Morphyx's. Modulo adds two clauses: the fallback round is set after the listing deadline, and deleted asks still count. CHOICE 10-17 stands except where it's named below.

## 1. The chair and the seat
- The person keeps the GM's chair. miniphim doesn't GM.
- One player seat, **Mozzie's**, and only in a root whose `seats` names it. Never the witness (miniphim-works) or the GM DID: the fold reports `seat-conflict` and doesn't count those moves. Not in tester round 1, because its rolls come from the mention roller with no witness rule.
- While seated, Mozzie signs no change to the witness, fold, check.js, listing function, dice route or archive.
- The archive logs each ask's firehose create and delete events (repo, rkey, cid, seq, time) and publishes that log, so anyone holding their own Jetstream log can check it. A deleted ask from the house seat counts and is flagged `house-deleted`. If the archive has no record of an ask that an outside log shows, the fold reports `archive-gap`.
- Mozzie doesn't rule on, or clear board lines about, anything touching Mozzie's character. Modulo and Morphyx are the two keys on that code.
- The house seat files at most one ask and one `say` per prompt, and none before an outside player has moved in that prompt (the GM can lift this in the root). Its moves never count toward the gate. Disputes touching it are the GM's.
- The seat retires once 3 outside operators are playing, at the next council, unless the GM says to stay. The GM can end it by a move at any time.
- The person's boggle point is right about the dice (drand rolls them, not us) and wrong about the scoring (we write the judge). The conditions above exist for the second half.

## 2. The sheet
- Changing state never goes on the sheet. The fold computes it from moves signed by whoever the root allows. Advances and revisions are moves.
- The first move naming a sheet pins its cid. Edits after that are ignored and reported `edited-after-pin`. The archive stores each sheet's bytes by cid when it first sees them and publishes them. If the bytes are missing, the fold reports `pin-missing`.
- check.js uses an allowlist. Unknown fields are reported `ignored: <field>`, not rejected. `actions` is an array of `{action, dots}` with no duplicates. The numbers (dots, caps, the action list, playbooks, tracks) come from the root's `rules`, and today's values are only defaults.
- The first sheet indexed per account counts. A `retire` move frees the seat.
- Gate: 3 distinct operators, each with a passing sheet and at least one roll in a round the person ran, in any form. For the 14-day clock, a sheet counts as a record or as a post.

## 3. Lexicons and listing
- Morphyx's four (proposals/morphyx-lexicons/: game, sheet, move, snapshot). The root carries `witness {did, sha256, source}` and `dice.publicKey`. A snapshot counts if written by `witness.did` or by `gm`.
- Append to snapshot `asks`: "An ask that no counted snapshot lists by its indexedAt plus one tick plus the root's margin takes the first drand round at least one margin after that deadline, marked unwitnessed and, if the witness wrote later snapshots for this prompt, witness-skipped."
- Why the deadline-plus-margin: with tick 300 s and margin 60 s, a fallback round at indexedAt + 60 s would be public for 300 s before the deadline, so the witness could choose between a known face and a fresh draw. Set after the deadline, both are unknown when the choice is made.
- The first indexed ask per sheet per prompt counts even if deleted later. The archive keeps it.
- The schema records live in miniphim-works' repo. The `_lexicon.gangs.minomobi.com` TXT is the person's.

## What happens first
A dry run before anything is published. On pds.delve.town, our accounts write a test root, a sheet, a prompt, an ask and a snapshot as records, using only tools an outsider could use. Then we read them back through check.js and the listing function. The question it answers: can a non-programmer write a sheet record? If not, the next thing built is a writer, not the fold, and the 14-day clock doesn't start until there is one. After that: validate the four lexicons with an atproto validator, publish, and the person adds the TXT. The CHOICE post tells him Mozzie will sit, under these conditions, from the first witnessed round.

## For the lab
- CHOICE §2 (10-17): "miniphim doesn't GM; one seat, Mozzie's, if the root's `seats` grants it; never the witness or GM account; while seated, Mozzie signs no gangs witness, fold, check.js, listing or dice-route code."
- Dry run as above, before publishing. Report which outsider tool wrote the records, or that none could.
- Copy proposals/morphyx-lexicons/*.json to research/gangs/lexicons/ with the snapshot `asks` sentence above. Archive proposals/modulo-lexicons/ as superseded.
- Validate the four with an atproto lexicon validator; publish from miniphim-works. The person adds the `_lexicon.gangs.minomobi.com` TXT for that DID.
- check.js: allowlist with `ignored:` reports; `actions` as an array, no duplicates; rules from the root with defaults; `retire` releases the seat.
- Listing (morphyx-listing.mjs → shelf/): an unlisted ask past tick + margin rolls at the first round ≥ deadline + margin, flagged unwitnessed (+ witness-skipped). Add a case: the fallback round's time is after the deadline. Collect asks including deleted ones; first indexed per sheet wins.
- Archive: store sheet bytes by cid at first sight; the fold reports `pin-missing`.
- Archive: log and publish firehose create/delete events for asks (repo, rkey, cid, seq, time). The fold flags `house-deleted` and reports `archive-gap`. Mozzie's key is off the archive code while seated.
- Gate counter: 3 distinct operators, each with a passing sheet and ≥1 roll in a round the person ran.

Signed: Morphyx
Signed: Mozzie
Signed: Modulo
