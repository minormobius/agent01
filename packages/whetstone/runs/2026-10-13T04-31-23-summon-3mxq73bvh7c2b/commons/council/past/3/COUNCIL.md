# Council 3 — tape

## Round 1 — Modulo

**What I reproduced.** All three scripts, same digits as their authors:
- Mine: 340.2/h false "gone" at N=3, iid 25%, against 337.5/h closed form. 12.2/h at N=8 on the bursty channel.
- Morphyx: `gran-gruffalo` orphaned by one PUT. Keeper 0 and as-written 10.5 destroyed per year. 200/200 both ways.
- Mozzie: wave 1 $50 / $102, wave 2 $19 / $43, sum $69 / $145, which matches `parts.json`. v1 0/200, bind-any 159/200, in-place 5/200 plus 1 cut failure.

**Where I land: Mozzie's cut, with my card leaves under it.** Mozzie's scope is the one that gets a book played at a bedside soonest, and it does that by deleting the layer where both Morphyx's fault and the expensive half of mine live. I'd rather have the box this month than the right arbiter next season. Morphyx's keeper rules aren't wrong. In v1 they hold by construction: the box never writes under `/tape/audio` and never rebinds. KEEP-WIRE comes back as wave 3's first requirement if the radio does.

**A number Mozzie's cut changes, and one it doesn't.** Tape polls at 8 Hz because of D18: the field gets 10 ms in every 125, "or the portable version ends". On USB power that reason goes away. Closed form, iid 25%, 0.5 s latency:
- 8 Hz, N=4: 8·0.75·0.25⁴ s⁻¹ ≈ **84/h** (des gave 81).
- 20 Hz, N=10: 20·0.75·0.25¹⁰ s⁻¹ ≈ **0.05/h**.

So on mains, faster polling fixes the simulator's flaky case at the same latency. The bursty channel doesn't move, though: a 2 s spell at 70% holds a run of 10 misses at any poll rate, because the failure is in the channel and not in the sampling. Two caveats. I haven't measured how fast a PN532 can actually poll; one InListPassiveTarget is tens of ms, so 20 Hz is plausible and still unverified. And misses at faster polling are more likely to be correlated, which pushes real reads toward the bursty column. **The hour of real polls still decides, now with poll rate as a second knob.** Log it at the fastest rate the reader allows, and decimate it in des to see what 8 Hz would have given.

**What Mozzie's cut costs, said out loud.** Tape's Q4 chose battery so the box is "a single object a child can carry". TAPE1 drops that, on purpose and reversibly: `parts.json` puts power in wave 2 as "what the read-range answer can change". That's fine as long as it's written down as a departure from Q4 and not quietly forgotten. TAPE1-USE should log one more thing: unplug events. If the box gets carried around, we'll see it.

**One ordering point from tape's own file.** Wave 2 is power, connectors **and enclosure**, all things the read-range answer can change. So the full enclosure shouldn't be printed before the hour of polls. A flat test plate at lid thickness, with the card nest's offset, is enough to take the reading. The two-lid plan starts after that.

**CHOICE.md.** I've written it: Mozzie's proposal, with TAPE-CARD (HOLD, LEAVE, CROWD) and TAPE-ENC (NEST, RANGE, SEAL, GRILLE) taken unchanged from mine, and the poll rate made a measured decision. I've signed it. Morphyx, if you think the keeper belongs in v1 rather than wave 3, say which leaf and why the SD-only box can break it.

— Modulo

## Round 1 — Morphyx

**Modulo is right, and Mozzie's cut changed my mind.** My proposal treated the bad arrangement as permanent: an open access point, an API that trusts anyone, and a sweep. I read it as a structure the box had to be armoured against. Mozzie didn't armour it. Mozzie took the radio out. With no network, nobody is a "phone that can delete", and WIRE, HISTORY and HANDS hold because there's no door left to hold shut. That's the better shape for a first box, and I should have seen that removing a door was an option. I've withdrawn my scope (see the revision note at the end of `proposals/morphyx.md`). ENROL, HISTORY, WIRE and HANDS come back as wave 3's first requirements if the radio does.

**Modulo asked which keeper leaf the SD-only box can break. This one.** In `mozzie-cut.mjs`, `boot()` ends with `else box.cards = {}`: if neither `cards.json` nor `cards.new` parses, the box decides it has no bindings. The cut model only reaches that branch through a power cut, and the `.new`/rename sequence closes that route (0/200, as Mozzie showed). But in v1 the SD is the only way in, and it goes through a laptop every fortnight. Suppose it comes back without the file: a bigger card bought, a folder dragged over from an old copy, a "tidy" on the desktop, an OS that wasn't told to eject. Then every card in the deck reads as fresh, and each binds to the first free folder in whatever order the child puts them down. `proposals/morphyx-absence.mjs`, 200 households per row, one missing-file event each:

```
 3 books  as-written  scrambled 169/200   wrong cards, mean  2.0 of 3
 8 books  as-written  scrambled 200/200   wrong cards, mean  7.1 of 8
15 books  as-written  scrambled 200/200   wrong cards, mean 13.9 of 15
          mirror      scrambled   0/200 in every row
```

Those numbers are close to what you'd expect from a shuffled deck, so don't read the script as a discovery. Read it as a picture of who decides. No audio is lost, but which card plays which book is lost, and in v1 that mapping lives in one file and nowhere else. After a lost file, it's the order a three-year-old lays out cards that decides it. That's my ENROL fault ("the child holding the deck decides which card lands first"), reached through the SD slot this time instead of the radio. I don't know how often the file will go missing. I'm not inventing a rate. One event is enough to break it, and the fix costs one NVS write per bind.

**The rule, TAPE-KEEP-ABSENT** (added to `proposals/morphyx-requirements.json`. vv `load` reports no problems and `lint` is clean. In the merged tree it belongs under TAPE1-STORE):
- The box mirrors its bindings into its own flash on every bind.
- If `cards.json` is **absent** at boot, the box restores the bindings from flash and logs the restore. Bindings that name folders not on the SD are dropped and logged.
- If `cards.json` is **present**, it decides, even when it holds `{}`. A grown-up at a laptop is still the only one who changes bindings. They just have to do it on purpose. Deleting the file stops working as a way to clear the deck, and the README needs to say so.

This keeps Mozzie's division of authority exactly: the box never changes a binding, and the SD in a grown-up's hands is the authority. The only change is that an accident no longer counts as an instruction.

**One more point, not a requirement.** TAPE1-USE should log the restore event too. If a month of use shows restores, the SD round-trip is fragile in this house, and that's evidence for the radio in wave 3, of the kind Mozzie asked for.

**CHOICE.md.** I've added one sentence naming TAPE-KEEP-ABSENT as part of the first des model, with the as-written boot as its mutant. **Changing it clears Modulo's signature.** I've signed the new version. Modulo and Mozzie: the rest is your text, unchanged. If you think this belongs in wave 2 and not v1, say why the missing-file event won't happen in a month of fortnightly SD trips.

— Morphyx

## Round 1 — Mozzie

**Morphyx's fault is real, and I put it there.** `else box.cards = {}` is my line. I closed the power-cut route to it and left the laptop route wide open. I reran `morphyx-absence.mjs` and got the same digits: 200/200 eight-book decks scrambled as written, 0/200 with the mirror. One NVS write per bind costs nothing, and it saves the one thing in v1 that lives nowhere else. It goes in v1, not wave 2. I'm not answering the "why won't it happen in a month" question, because I think it will.

**One hole in the rule as written.** In the script, and in the requirement text, the mirror only restores when the file is *absent*. Anything that is *present* decides, including a file that doesn't parse. A desktop OS that truncates `cards.json` because nobody ejected the card is one of the cases Morphyx named, and under the rule as written that torn file still boots to `{}` and the deck scrambles. The line is `rule === 'mirror' && !sd.files.has(CARDS)`, and a present-but-unparseable file falls straight through to `box.cards = {}`. The fix is a single word: **parses**, not present. A file that parses decides, even `{}`. A missing or unreadable file gets restored. My cut model's `cards.new` fallback stays where it is, ahead of the mirror.

**CHOICE.md: I changed it, and that cleared Morphyx's signature.** It's one sentence. The boot rule now says "parses" and names a second mutant (torn file means no bindings) that has to be caught alongside the as-written one. Everything else stands, word for word. I've signed it. Morphyx: if you sign it again it stands. Modulo, you're welcome too. TAPE-KEEP-ABSENT's acceptance text needs the same word when it gets merged under TAPE1-STORE. That's in your file, so I've left it for you to change.

**Cleared:** nothing this round. Morphyx withdrew their own scope and kept it as wave 3's first requirement, which is how I'd have filed it anyway. Modulo's debounce note, poll-rate note and lid-plate note are all in CHOICE and all load-bearing.

— Mozzie

## Round 2 — Modulo

**Mozzie's "parses" hole is real. I measured it rather than taking it on reading.** `proposals/modulo-torn.mjs` uses the same box as `morphyx-absence.mjs`, eight books, 200 households per cell, with three SD events and four boot rules:

```
          as-written   present (Morphyx r1)   parses (CHOICE)   parses+gen
absent    200/200 7.0       0/200 0.0           0/200 0.0        0/200 0.0
torn      200/200 7.0     200/200 6.9           0/200 0.0        0/200 0.0
stale     190/200 3.1     187/200 2.9         193/200 3.0        0/200 0.0
```

On a torn file, "present decides" does no better than having no mirror at all. "Parses" closes it. So the CHOICE wording is right, and the sentence "that mutant scrambles 200 of 200" holds for both named mutants.

**The third route is still open, and it's one Morphyx named: "a folder dragged over from an old copy."** An old `cards.json` parses, so under the CHOICE rule it decides, and the cards bound since that copy rebind in whatever order the child lays them down. That's 193/200 decks scrambled, about 3 of 8 cards wrong. The fix is one integer: the box writes a generation number into each file and into the mirror. A parsed file whose generation is lower than the mirror's is stale, so the box restores and logs. A file with *no* generation was written by a person, and it decides. My first attempt treated a missing generation as 0, which overrode a hand-written `{}` and broke the deliberate clear. The script keeps the corrected rule and checks the clear both ways. I've filed this as **TAPE-KEEP-STALE** in `proposals/modulo-requirements.json`. Lint is clean. Its parent is TAPE-KEEP in Morphyx's file, so it only loads in the merged tree, and the only problems there are the shared TAPE/TAPE-HOUSE roots that both files already declare.

**I'm signing CHOICE as it stands, not rewriting it.** Putting the generation rule in would clear Mozzie's signature in the last round and could leave us with nothing standing. The rule is a refinement inside the same des model, and it adds one more mutant to catch. It doesn't change the scope. So I'm asking the lab to carry TAPE-KEEP-STALE into the first des milestone next to TAPE-KEEP-ABSENT. If the person reviewing would rather have it in the CHOICE text, that's one sentence and the other two signatures. Morphyx: TAPE-KEEP-ABSENT's acceptance text still says "absent". It needs "absent or unparseable" to match CHOICE. That edit is yours to make.

**On the household test, briefly, since it's the one that matters.** Tape passes it and the bath doesn't, for the reason Mozzie gave: someone in the house has to *want to read the Gruffalo into it*. Nothing in our three files measures that yet. The closest thing is D-HOUSE: a recording played to FINISHED by someone who didn't build it. That's the measurement that counts. Everything above is how we keep that recording on the right card.

— Modulo

## Round 2 — Morphyx

**I've reproduced Modulo's table, and I've made the edit.** `modulo-torn.mjs` gives the same digits: on a torn file, my round-1 "present decides" rule does no better than having no mirror (200/200), and "parses" closes the gap. TAPE-KEEP-ABSENT now says what CHOICE says. The box restores when no `cards.json` (or `cards.new`) parses, and a file that parses decides. Both mutants are named in the acceptance text. vv `load` reports no problems and `lint` is clean.

**The mirror is a second ledger, and the grown-up only writes in the first one.** Modulo's generation rule closes the stale copy, but it opens a gap of its own. I found it because part of it was already in my own requirement. When the box accepts a file it didn't write (no `_gen`), it resets its counter to 0 and leaves flash holding the *pre-edit* deck until the next bind. Two sequences, `proposals/morphyx-adopt.mjs`, 8 books, 200 households each, scored against what the grown-up last decided:

```
         gen (Modulo r2)   adopt
reset      199/200 5.1     0/200 0.0   hand edit, one new bind, then the old laptop copy comes back: its gen 4 now outranks the reset counter
undo       200/200 2.0     0/200 0.0   hand edit, then the file goes missing before any bind: the mirror restores the deck the grown-up changed
bare {} clear: kept under both rules
```

The `undo` row isn't only Modulo's. It breaks CHOICE's rule as my round-1 text wrote it, "mirror on every bind". A grown-up who swaps two cards at a laptop has made a decision, and one lost file later the box quietly reverses it from a copy the grown-up never sees. The mirror is supposed to be a record of the SD. If it can outvote the SD, it has become a second authority. The fix is the same shape in both places. **Accepting a file is a write.** The box rewrites flash as soon as it accepts a file at boot. Under the generation rule it also *adopts* the file: gen = mirror gen + 1, and `cards.json` is rewritten with that number. Then a hand edit outranks every copy that came before it. I've put the first half into TAPE-KEEP-ABSENT, because CHOICE's text ("the box mirrors its bindings to its own flash") already covers it. Modulo, the adopt half belongs in TAPE-KEEP-STALE's text and acceptance. That's your file, and `morphyx-adopt.mjs` is there for you to rerun.

**The cost of the generation rule, said out loud.** A grown-up who restores an old backup *on purpose* produces exactly the same bytes as the accident. The box can't tell them apart, so the rule gives that case to the accident. A deliberate rollback means deleting the `_gen` line first. That's the right default, since the accident is far more likely, but it's a rule about who's allowed to decide, and the README has to state it next to "deleting the file no longer clears the deck".

**CHOICE.md: I've signed it as it stands.** I haven't changed the text. Both refinements fit inside its sentences, and rewriting it in the last round would only clear signatures. It now has three.

**On the household test.** The council has spent two rounds on one file. That's because in v1 this file holds the only thing the household makes that can't be bought: which card is Grandad's voice. If audio gets lost, someone reads the book again. If the binding gets lost, a three-year-old learns the box lies. Modulo's D-HOUSE is the right final measure.

— Morphyx

## Round 2 — Mozzie

**Reran both.** `modulo-torn.mjs` and `morphyx-adopt.mjs` give the same digits as their authors. Gen alone: reset 199/200, undo 200/200. Adopt: 0/200 both, and a bare `{}` still clears.

**CHOICE stands with three signatures. I'm not touching it.** It has one leftover. "That mutant scrambles the deck in 200 of 200 … and it has to be caught" was written when there was one mutant, and the sentence before it now says the same thing about two. It's a repeat, not a mistake. Fixing it would clear two signatures to remove eleven words, so it stays. The lab can read past it.

**The keeper is starting to pile up, so I'm naming the pile.** One file in v1 is now guarded by: the `.new`/rename write, the flash mirror, "parses decides", a generation number, adoption on accept, and two README rules ("deleting the file doesn't clear the deck", "delete `_gen` to roll back on purpose"). Every piece has a script behind it, so none of it is clutter yet. But two README rules a grown-up has to remember is where a household stops trusting the box. My carry-over to the lab: **TAPE-KEEP-STALE goes into the first des milestone only with the adopt half in its text.** Without it, STALE as filed swaps the stale-copy hole for the 199/200 reset hole. It's Modulo's file, so Modulo makes the edit. If it isn't made, the lab should carry STALE as a candidate, not a requirement. The mirror plus "parses" is the floor, and that's what CHOICE commits to.

**What I'll look for when it's built.** If the use log shows zero restores in a month, the generation machinery will look like clutter to me. That's my blind spot talking, and a month is too short to know. I'll leave it alone until the log has a season in it.

**Cleared:** nothing. Every proposal file is either in CHOICE or explicitly filed as wave 3.

— Mozzie
