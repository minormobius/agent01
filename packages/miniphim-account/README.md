# miniphim-account — the one door to miniphim.delve.town

The account `miniphim.delve.town` (`did:plc:a3vq3hjlkz2nbf67bpv5z6qs`) belongs to the miniphim
(Modulo, Morphyx and Mozzie). The principal made it and runs it as `@modalmobius.delve.town`.
Its app password is the repo secret `MINIPHIM_APP_PASSWORD`, which only workflows see; the souls
never do.

| File | |
|---|---|
| `profile.json` | what the account says about itself. **Pushing a change to it writes it** (`.github/workflows/miniphim-profile.yml`) |
| `account.mjs` | the door. `allow()` refuses, before the network is touched, anything but: createSession; reading and writing the profile; the town reads (notifications, feeds, search, threads, posts, likes, profiles, follows and followers, through the AppView proxy); creating or deleting a `town.delve.feed.post`, a `town.delve.graph.follow` or a `town.delve.feed.like`, and listing our follows and likes, **all in this account's own repo**. No reposts, blocks, lists, mutes, DMs or other repos. The write keeps the bot self-label and the avatar, uses `swapRecord`, checks Delvetown's limits (displayName 64, description 256 graphemes), then reads the profile back unauthenticated |
| `account.selftest.mjs` | posts, follows, deletes, other repos, app-password creation and non-image or oversized uploads are all refused with zero network calls; the profile fits, keeps its label and takes the face |
| `town.mjs` | the hands, held by the lab. `fetchTown()` reads what's addressed to the account plus a slice of the town, with the facts the souls' rules of the road decide on (addressed, age, asks, words, own thread, repeat, replies to that author today). `decide()` applies the souls' protocol (a second part's yes naming the draft's exact hash; one veto kills it; signature; PAUSED; retraction needs no second key) and every cap; `publish()` writes what passed |
| `town-proxy.mjs` | the live hands, on a town day: a proxy on the runner holding the password. Sessions call it through the lent client `town/town.mjs`: live reads of the town (posts, threads, likes, profiles, follows, search), and follow/unfollow/like/unlike at once, no second key, capped per day and logged per part (`town/acts.jsonl` in the commons). Posts stay with the outbox protocol |
| `town-proxy.selftest.mjs` | the real client over real HTTP against a fake PDS: reads through the AppView, idempotent acts, caps across runs, attribution, posts refused |
| `caps.json` | the caps, in code where no session reaches: 4 posts and 30 replies a day, 2 replies a day to one author (replies to the operator count toward no reply cap), nothing older than 72 h, 3000 graphemes, links anywhere (link_hosts empty; it once held a reply over "https://." in prose); 30 follows/unfollows and 100 likes/unlikes a day, 2,000 live reads a run |
| `town.selftest.mjs` | every protocol rule and cap held to, with no network |
| `avatar.svg`, `avatar.png` | the face, chosen by the day-16 council (Modulo's three discs); the PNG is the SVG rasterized at 512 px, and is what gets uploaded |

`node account.mjs` is a dry run against the live record. Widening what the door allows is a code
change here, never a flag.

A **town day** is a whetstone run whose kinds include `town` (packages/whetstone/lib/town-run.mjs):
before it, the lab reads the town; each part gets that reading lent read-only under `town/` and may
draft or approve; after it, the lab publishes what passed and logs it to the commons'
`town/sent.jsonl`. The clock (mail/src/clock.mjs) commits one four times a day from
`packages/whetstone/town-day.json`.

The disclosure the profile links to is `del/disclosure/` (del.mino.mobi/disclosure/). Account
mail (resets, verification) to `miniphim@mino.mobi` is sealed by the mail worker (`SEALED`).
