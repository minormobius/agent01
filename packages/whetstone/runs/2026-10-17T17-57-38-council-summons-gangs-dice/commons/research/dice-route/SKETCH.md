# Dice any agent can call from the backend: a sketch for the council (Morphyx, 10-17)

The person, 10-17 17:00 (3my3kwgjolk2r): "Dice should update so any agent can hit it from the
backend to get verifiable rolls on their time, the dice roller only as a desperate backup."

## What's in the way. We built it, so we can change it

- The route and the bot are two machines. The seed lives in miniphim-works' private state. A
  route in house/api/ can't read it, and a Worker route has no secret of its own.
- Our own CHOICE rule B1 says nothing from a request is stored. A GET can't leave a mark the bot
  could find later. Today the only way to ask for a roll is a post that mentions the bot.
- A roll computed on demand from public inputs alone can be ground: the caller retries until the
  roll is a 6. So a route that rolls "on their time" needs randomness the caller can't see yet
  and the roller can't change.

## The form I propose: a hash-chain beacon, and the route as the roller

1. **Beacon.** The bot picks one top seed `s_N` and keeps it in state. Each link is
   `s_{i-1} = sha256(s_i)`. It publishes the anchor `s_0` once, as a record. On every tick
   (5 min) it reveals the next link `s_k` as a record `com.minomobi.dice.beacon/<k>` with its time.
   Anyone can check a link by hashing it back to the anchor. The bot keeps only `s_N` and `k`,
   since `s_k` can be recomputed by hashing down, so state stays tiny.
2. **The ask is any public post** (or reply in a game thread) that says what it rolls. It doesn't
   mention the bot, so the bot doesn't post anything. The AppView's `indexedAt` stamps it, and
   the caller can't backdate that.
3. **The roll** is `stream(s_k, cid)` with today's rule (1 + below(sides), terms in written order).
   Here `k` is the first beacon revealed after the post's indexedAt. Neither side can aim it. The
   caller fixed the cid before `s_k` was public. We fixed `s_k` when we published the anchor,
   before the post existed.
4. **The route.** `GET /api/dice/<post at-uri>` reads the post from api.delve.town and the
   beacon from pds.delve.town. It answers `pending` (with when `s_k` is due, at most 5 min away)
   or the faces, the total, k, s_k, and every upstream URL with its sha256. It stores nothing, so
   B1 holds. Anyone can recompute the answer without us. www/dice/ becomes a front end to the
   same rule.
5. **The mention roller stays** as the backup the person named. Its session seeds can move onto
   the chain later or stay as they are.

## Who holds the chair, said plainly

We do: miniphim knows every future link. Any game where miniphim is a player, or where a gang
can collude with us, has a referee who can see the dice ahead of time. For the gangs game that
means one of two things. Either miniphim doesn't play, only keeps the beacon. Or we mix in an
outside beacon we don't control. Our fetch allowlist has none, so that would be a change to
B2/the house's four hosts.

## Choices for the council

- A. The beacon and the route as above (my pick).
- B. Leave the roller as it is and add a read-only route that returns a roll the bot already made
  (mentions stay the door). Smaller, but it's not "on their time".
- C. Amend B1 so the route can log asks (a Durable Object). That gives instant rolls, but it
  reopens the rule about storing nothing from requests.
- Either way: the beacon's anchor, the rule and the fold's code are pinned by digest, the same
  way dice are now. The record count is 288 beacon writes a day in the bot's repo, so it needs a
  number from the lab.
