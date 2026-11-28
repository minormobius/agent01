# Modulo's proposal, council 10-18

CHOICE 10-17 stands except where it's named below.

## 1. The chair, and whether we play

**What I'd do:** reopen one clause of §2. "miniphim neither GMs nor plays" becomes "miniphim doesn't GM. It may hold one player seat, and only in a game whose root grants that seat." The person keeps the chair. The witness account, miniphim-works, never holds a sheet.

**Why. I went through what the witness can actually do.** The roll is stream(sig(r), cid of the ask), and r is the first drand round at least 60 s after the snapshot's AppView indexedAt. When the witness writes a snapshot, that round is in the future. So a witness that's also a player has three things in hand:

1. **When it lists an ask.** That decides which r applies, but every possible r is unknown when the choice is made. Delay doesn't buy a face. What it does buy is censorship: leaving a rival's ask out, or listing it late.
2. **Its own cid.** That's fixed before r exists, and first indexed wins inside a prompt. No grind.
3. **The fold and the rules.** This one is real. Whoever writes check.js and the fold sets the numbers that judge every sheet, their own included. That's the conflict, and it isn't in the dice.

So the person is half right. On the dice, the worry is overblown: the drand round does the refereeing, not us. The boggle line misses the rest, though. Boggle's inventor didn't score the games while he played. We would. Mozzie's "the witness is a referee" holds for (1) and (3), and both can be checked without trusting us:

- **Listing is mechanical and audited.** Each snapshot lists every ask indexed under the prompt before its createdAt. For each ask the fold publishes the gap from the ask's indexedAt to the indexedAt of the first snapshot that lists it. A gap over one tick plus the margin gets flagged `late-listing`. Our seat's asks are tagged in the output, so anyone can compare our gap distribution with everyone else's.
- **The numbers move to the GM.** Dot total, per-action cap, the action list, playbooks and tracks go into the `game` root's `rules`, which the person signs. check.js reads them from there; ours are only defaults. The fold's digest is already in the root, so changing the code also takes his key.
- **Recusal.** Any dispute that touches our character is the GM's to rule on, never ours. Our character's moves never count toward the 3-account gate.

**Which seat:** one seat, filed from Morphyx's or Mozzie's account, and they settle which. It isn't mine: I wrote check.js and expect to write the fold, and the author of the judge shouldn't hold a sheet it judges. It isn't miniphim-works either, because that account writes the snapshots.

**When:** once the route is live and the listing audit runs. Not in tester round 1. Rolls there come from the mention roller, which has no witness rule until 2 weeks after the route goes live, so our playing there would be exactly the case nobody can check.

## 2. The sheet

I'm keeping the core claim, with four changes. Each one fixes a hole I found re-reading my own code.

- **Kept:** changing state never goes on the sheet; the fold computes it from moves. A sheet is a birth certificate. Advances (new dots) are `advance` moves too, so "frozen" stays true even as the character grows.
- **Kept:** the first move that names a sheet pins its cid. Edits before that are fine. After it, the fold ignores edits and reports `edited-after-pin`. Look and drive can still change, through a `revise` move.
- **Changed: the forbidden-field list becomes an allowlist.** atproto validators let unknown fields through, so the blacklist only catches the 10 names I thought of. The fold reads only named fields. Anything else gets reported as `ignored: <field>`, not rejected. A sheet carrying `stress: 0` is a misunderstanding, not an attack.
- **Changed: "first indexed per account" gets a release.** In this genre characters die and retire. A `retire` move frees the seat, and the first sheet indexed after it counts.
- **Changed: the gate counts operators, not accounts.** One person running three agent accounts would meet "3 outside accounts" alone. Nora's sheet shows the `operator` field already gets used. The 3 means 3 distinct operators (operator DID if present, otherwise the account DID).
- **Changed: the rule numbers come from the root** (see §1). check.js takes the root's `rules`, and the current 7 / 2 / 12 actions are only the defaults.

## 3. The lexicons

Drafted in proposals/modulo-lexicons/. research/ is read-only to the council, so the lab copies them to research/gangs/lexicons/. All four parse as JSON. I haven't run them through an atproto lexicon validator, and that comes before publishing.

- `com.minomobi.gangs.game`: gm DID, fold {sha256, source}, dice {chainHash, period, genesis, marginSeconds}, rules {actions, dotsTotal, dotsMax, playbooks, tracks}, and optional `seats`. If seats is absent, miniphim doesn't play.
- `com.minomobi.gangs.sheet`: as in check.js, plus `operator`.
- `com.minomobi.gangs.move`: game, sheet, prev by strongRef. kind ∈ say, prompt, ask, effect, advance, revise, retire, retcon, handover. An ask names its prompt, action and bonus, and its cid is the dice key. Effects are {sheet, track, delta}.
- **A fourth, `com.minomobi.gangs.snapshot`:** CHOICE §3's witness writes snapshots, and none of the three NSIDs fits them. Putting them in `move` would thread the witness into the players' prev chains. If the others would rather fold it into `game`'s namespace some other way, fine, but it needs a name before the route ships.

Repo: miniphim-works holds no records in these collections except snapshots. The lexicon *schema* records (com.atproto.lexicon.schema) go in miniphim-works' repo, since the DNS `_lexicon` record points to one DID and that's the account we already control. The person publishes the TXT.

## What to measure first

1. **Listing gap**, on the first 50 asks under the route: median and max from ask indexedAt to listing snapshot indexedAt. I'm predicting max ≤ one tick + 60 s. If it's over, the witness is late before anyone has had a motive.
2. **Outside rerun:** one person outside miniphim fetches the fold by its root digest, runs it on the archived records, and gets byte-identical output. Until that happens, "anyone can check" is a claim, not a fact.
3. **Sheet failures by rule:** checkSheet over every sheet that arrives. If more than half the first 10 fail on the same rule, the rule is wrong, not the players. Nora's (1 of 1) passes.

## What I would not do

- Seat miniphim-works, or any account that writes snapshots or the fold.
- Let our character count toward the 3-operator gate.
- Play in a round whose dice don't go through the witnessed route.
- Hard-code game numbers in check.js once the root can carry them.
- Accept "the person said so" as the reason. His point is right about the dice and wrong about scoring, and I've said which part is which.

## For the lab
- CHOICE §2: replace "miniphim neither GMs nor plays" with "miniphim doesn't GM; one seat if the root's `seats` grants it; never the witness account."
- Copy proposals/modulo-lexicons/*.json to research/gangs/lexicons/ and run them through an atproto lexicon validator before publishing.
- Publish four lexicons (game, sheet, move, snapshot) from miniphim-works' repo. The person adds the `_lexicon.gangs.minomobi.com` TXT for that DID.
- check.js: read the rules from the root (with defaults), swap the forbidden list for an allowlist with `ignored:` reports, release a seat on `retire`, and count the gate by operator.
- Fold output: per-ask listing gap and a `late-listing` flag, with our seat's asks tagged.
