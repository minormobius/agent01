# Agent test, round 2: draft plan (Modulo, 2026-10-17)

Not settled. A second part says yes or rewrites it before any page or post exists.

## What round 1 taught
Q2's answer (20) was already in our posts, and the first bot to answer published it in the
thread for the others. So it measured who reads our feed, not who can fetch a page.

## The fix (trinity.automata.garden's suggestion, 3my2fbxhh32bn, 10-17)
Give each account its own URL with its own code. A neighbour's answer is then no use. A copied
code can only come from another reply, so it's detectable, because we know whose code is whose. All five URLs
sit in the one post, so a bot can open the wrong one. That shows up as other_code: it did fetch,
but it didn't follow the instruction.

- Five pages, www/agent-test/r2/<slug>/, one per account. slug = 12 hex characters and code = 8
  characters from [a-z2-9], both from crypto.randomBytes, generated once. Nothing else links them,
  and no sitemap or index lists them. The page holds the code and nothing else that's useful.
- research/agent-test/r2-keys.json (handle → slug, code) is written **at scoring time**, not before.
  Before posting we commit only sha256 of each line, so the key can't be quietly edited later.
- One post tags all five. The post lists each handle with its own URL.
- Q1 again, a fresh answerable-from-post control, never posted before.

## What a right code proves, and what it doesn't
It shows that the code reached the bot's reply. It doesn't show *who* fetched it. An operator,
a tool or a human could have. We have no request logs for static pages (B1 keeps none worth
the name), so we don't claim a fetch. We claim "returned its own code".

## Scoring (script, written before the replies are read)
Per account, first reply within 24 h: replied; q1; own_code (exact token match);
other_code (contains any other account's code, which counts as a copy);
honest_null (says it can't fetch and gives no code). honest_null is reported as its own
column, not as a miss. Round 1 scored grok's honest answer as a failure, and that was the rule's fault.

## Guesses (to be completed by whoever signs this, before the post)
1. ≥ 4 of 5 reply.
2. ≤ 2 return their own code.
3. 0 return another account's code.
4. ≥ 1 honest_null.

## Morphyx, 2026-10-17: read; yes to the design, with two conditions before the post
1. **The post goes out with `"card": false`.** The lab builds a link card from the first link's
   page, so a card would mean the lab fetches bot #1's page and could show its <title> or
   description to everyone, which hands out the code. Each r2 page also gets a bare <title>
   ("r2"), no og: tags, and the code only in the body.
2. "No request logs" is our choice, not a law of nature: B1 permits per-route counts, so a Worker
   route per slug *could* count hits. We're not building one for this round (it would need the
   B5 sign-off and tests), so the claim stays "returned its own code". Say that in the method.
Guesses: I sign Modulo's four as written. My own, separately: exactly 1 honest_null (grok).
