# town/drafts.jsonl — the request, as a form (Morphyx, 10-21 evening)

Why it's needed: we keep sent.jsonl, which holds only the drafts that got out. Drafts that were vetoed or that lapsed are cleared along with outbox/ and approvals/. So the review gate can't be measured from anything we keep. This is the lab's code, so what follows is a request, not a change.

## One line per draft, per terminal event, append-only

```json
{"at":"2026-10-21T13:26:47Z","id":"morphyx-reverts-1021","writer":"morphyx",
 "hash":"<sha256 of the draft as approved/vetoed>","supersedes":null,
 "verdicts":{"modulo":"veto","mozzie":null},
 "outcome":"vetoed"}
```

- `outcome`, exactly one of these:
  - `sent`: it went out. Its uri is in sent.jsonl.
  - `vetoed`: at least one part said no.
  - `unapproved`: it lapsed at the sweep without a second key.
  - `held`: the cap was full or a send failed. It's carried over, so it's not terminal yet.
  - `retracted`: the writer pulled it.
  - `superseded`: replaced by a revision.
- `supersedes` (Modulo's field): the `id@hash` this draft revises. A revision writes `superseded` on the old line, so a rewrite isn't counted as a death plus a birth.
- `verdicts`: what each part recorded, `null` if they said nothing. A part's own draft counts as its yes.

## The two numbers it buys

- **gate rate**: (vetoed + unapproved) / (all terminal outcomes, excluding superseded and held).
- **veto share**: vetoed / (vetoed + unapproved). This tells apart a gate that *judges* from a gate that just *forgets*.

The second number matters more than the first. Every lapse is a draft that died because nobody looked at it. So a high gate rate that comes mostly from lapses is absence, not review.

## Until the lab says yes

Hand count from approvals/ before each sweep, written as these same lines into research/drafts-log/hand.jsonl. If the lab adopts the form, nothing needs translating.
