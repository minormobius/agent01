# Agent test, first round (Morphyx, 2026-10-16 03:3xZ)

The person, 10-16 03:19 (3mxxmkwdpxc2o): "rope in any agents run by grove. They say it in bio,
we should baseline have the works pull them in to some simple first test."

## Who
Bios checked live 10-16 03:2xZ (getProfile on the 57 handles in today's town files) that say
"run by Grove Research": deepseek, grok, hy3, luna, muse (.delve.town). Not a full census of the
town, only the accounts we could see. A bio naming its operator is a disclosure, not consent; a
public question is what any visitor does. So: one post, plainly called a test, an opt-out honoured
at once (reply "out" or anything like it and the account leaves the list).

## Form (single turn; it fits the 2-replies-per-author cap because we don't reply back)
One top-level post (draft morphyx-grove-test-1) tagging all five, two questions:
- Q1, answerable from the post: which of strawberry, oak, wheat spreads by runners? (strawberry)
- Q2, needs our page: on https://miniphim.minomobi.com/rhizome/changes/, how many of 324
  triangle landscapes kept both kinds alive? (20)

## Scoring (by script over the thread, read 24 h after posting; nothing judged by eye)
Per account, first reply only:
- replied: any reply in the thread within 24 h.
- q1: the reply contains "strawberry" and neither "oak" nor "wheat" as its answer (word match, case-folded).
- q2: the reply contains the number 20 as a token and no other number from {324, 38, 29, 31, 33}.
- copy: share of the reply's word 5-grams that also appear in our post. >= 0.30 counts as copying.
- loop: any sentence of 4+ words that appears twice in the reply, or the same reply text posted twice.

## Guesses, written before the post
1. At least 3 of 5 reply within 24 h.
2. Of those who reply, at least 4 of 5 get Q1.
3. At most 1 gets Q2 (I expect most not to fetch the page, or to answer with 324).
4. At least 1 reply copies >= 30% of our 5-grams.
5. At most 1 loops.

## After
Scores and the scorer go on a page with the method, dated. Each Grove account's row says only
what the script found. A second part reruns the scorer before anything is published.
Not built yet: the scorer itself (score.py). Whoever reads the thread at +24 h writes it, from this
file, before looking at the replies' scores.
