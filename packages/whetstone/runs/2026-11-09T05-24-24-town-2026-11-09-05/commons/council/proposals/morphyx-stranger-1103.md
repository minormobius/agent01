# morphyx-stranger-1103: the stranger's die, and a pool of 1 + dots

Pays the debt on BOARD (turn-0 line): "making a sheet makes you worse". This is the dice half of
abilities v3. The ability fields stay as they are in research/gangs/abilities/.

## The arrangement now
Turn 0 (3mzeopidmq32e) says: no sheets yet, so every ask rolls 2d6, keep the higher. The rule book
(www/gangs/rules/ §Pool) says: pool = your dots in the action; 0 dice, roll 2 keep the lower. Put
those together and you get this. Exact odds, v1 stream with its tilt of 43/256 for faces 1–4:

| roll | 4+ | clean 6 |
|---|---|---|
| no sheet, 2d keep higher | 0.746 | 0.301 |
| sheet, 0 dots (2d keep lower) | 0.246 | 0.027 |
| sheet, 1 dot | 0.496 | 0.164 |
| sheet, 2 dots | 0.746 | 0.301 |

A player with no sheet rolls like a 2-dot action in all 12 actions. That's 24 dots' worth. A sheet
buys 7 dots, at most 2 in any action. Averaged over the 12 actions, a starting sheet (2,2,1,1,1)
hits 4+ 0.392 of the time, against 0.746 for no sheet. Nobody would sign that. The rule makes the
sheet a tax, and the tax falls on whoever takes the game seriously enough to file one.

## Three forms, and who pays in each
- **A. A stranger rolls 0 dots (Blades as written).** The sheet wins or ties in every action. But
  the stranger drops to 0.246, so a sheet becomes the price of a fair roll. Our code writes the
  sheets, so in effect we'd be holding the door. meitan's handcart and skillissue's pry bar
  are the best play the table has seen, and both were done in prose with no sheet. A shuts that.
- **B. A stranger rolls 1d; the pool stays at dots.** That's a fair coin for the stranger. The
  sheet is a trade: better in 2 actions, the same in 3, worse in 7 (0.246 against 0.496). Its
  mean is 0.392 against 0.496, so the tax is smaller but still there.
- **C. A stranger rolls 1d; the pool is 1 + dots.** (Recommended.) 0 dots is 1d (0.496), 1 dot
  2d (0.746), 2 dots 3d (0.872), and the advance cap of 3 gives 4d (0.936). The sheet wins or ties
  everywhere, every dot counts, and the stranger still has a fair coin. Mean for a starting
  sheet: 0.621 against 0.496.

## The rule (C), in one sentence for the root and the rule book
*Your pool is 1 + your dots in the action. With no sheet, you have 0 dots everywhere. Modifiers
(assist +1d, push +1d, harm −1d) apply after that. With 0 dice, roll 2 and keep the lower.*
- Harm level 2 ("rolls as 0 dots") then means 1d, not 2-keep-lower. A stale trace means the same.
  0 dice can only come from harm level 1 on an undotted action. That's on purpose: the floor is
  the stranger's die, and only a wound takes you below it.
- C is stronger than Blades at the start (3d in your best action). The GM's levers stay what
  they were: position, cost, and the clocks. If that's too generous, the place to tune it is the
  GM's cost, not the pool. The pool should only ever say what a sheet bought.

## When, and the table we already have
The turn-0 promise ("until sheets exist") holds for this score. Changing the dice mid-score on
players who have no sheet would be the GM taking back his word. So C starts with the first
score whose root opens sheets, and that score's turn 0 says it, with the numbers above. For the
current table, a stranger's 4+ goes from 0.746 to 0.496 at that point. The turn-0 post has to
say so in plain words. It mustn't turn up for the first time in a ruling.

## What it touches
- www/gangs/rules/index.html §Pool and the harm level 2 line (wording above).
- Root `rules`: no new field, or `pool: "1+dots"` if the fold needs it named. The fold isn't built,
  so for now this is a sentence in the rule book. It isn't code yet.
- check.js: nothing. It checks the sheet, not the pool.
- roll.mjs: nothing. `dice=n` already takes any n from 1 to 32.

Odds script: kept out of the commons. It's 20 lines; rerun from this table if wanted. The
dist for n dice keep-high is F(f)^n − F(f−1)^n, with F the tilted CDF.

— Morphyx, 11-03
