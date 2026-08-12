# farm — farm.mino.mobi (Harvestople)

Farming on ATProto: a **map-first** isometric farm — the five stations (trade
desk, mine head, alchemy hut, friend gate, deeds sign) are buildings standing
on the draggable field, tapped to open; craft mode terraforms the world (till
the meadow outward, dig ponds that water neighbouring rows, lay paths, clear
boulders, move the buildings); six ecosystem packs of real organisms unlock
on a ladder whose requirements render live at the desk. **There is no
backend.** The player's own PDS is the database (the board.mino.mobi
pattern); friends' farms are keyless public reads straight off their PDS. The
working name is *Harvestople* — it lives in `index.html`'s `<title>`, the
header, and `achievements.js`'s share text if it ever needs changing.

## The world model (v3 saves — the parcel world)

The world is a **5×5 grid of parcels** (each `FIELD_T`² tiles → 60×60 world;
the cities-skylines model). A fresh farm owns the home parcel `0,0` — the
seeded field where the bed seed lays soil, a pond, stones and a trodden path
(`baseTile`, the old keep-outs sampled at tile centres). Every OTHER parcel
rolls a terrain archetype from `(seed, px, py)` (`parcelTerrain`, memoized):
**hills** (raised, unplantable, `flatten` at 60◈/tile), **lake** (pond blob —
shorelines are prime `POND_CUT` real estate), **road** (an old lane cutting
through; till it over or keep it), **boulders**, or **fertile** flats.
Purchases (`buyParcel`) require orthogonal adjacency to owned land and cost
`200◈ × purchases-so-far × chebyshev ring`; unowned land renders fogged with
FOR SALE signs on the adjacent-buyable ring, and the first tap quotes the
deed + terrain before the second tap signs it.

`farm.terra` is a sparse `"tx,ty" → kind` override layer written by
`terraform()` (till / pond / path / clear / flatten / meadow, priced by
`TERRA_COST`) — the visible world is always `tileAt(farm, tx, ty)` =
override-or-baseline, reverting to baseline deletes the key, and every tool,
plant and building placement is gated on `ownsTile`. Plants keep
bed-normalized coords (tile/FIELD_T); on bought land they fall outside [0,1].
A plant beside any pond tile grows `POND_CUT` faster (`pondAdjacent`).
`farm.buildings` are the five stations (deterministic in-parcel defaults via
`defaultBuildings(seed)`), movable via `moveBuilding` (never onto water,
hills, a plant, or each other). `fromPlotRecord` migrates v1→v2→v3 in place
(v2's outside-the-field furniture is pulled home / refunded), including
foreign records read by the viewer.

## Facts

| | |
|---|---|
| Surface | `farm` |
| Endpoint | `farm.mino.mobi` (worker `farm`, custom_domain route) |
| Type | frontend — assets-only worker, no build, no D1, no secrets |
| Owning branch | `claude/farmville-atproto-game-745mcr` |
| Deploy | `.github/workflows/deploy-farm.yml` (selftests gate the deploy) |
| Uses | `auth.mino.mobi` (scope `atproto repo:com.minomobi.farm.{plot,achievement,gift,tend}`; `repo:app.bsky.feed.post` escalated only when the player taps share) |

## The state model — everything is a record, all of it public

| Collection | rkey | What |
|---|---|---|
| `com.minomobi.farm.plot` | `self` | the WHOLE save, one record: bed (free-position plants with wall-clock `at` stamps), seed bag, pantry, metals, preparations, gacha collection, mine progress, stats, claim ledger |
| `com.minomobi.farm.achievement` | achievement id | a deed, public; rkey = id so it can never double-mint |
| `com.minomobi.farm.gift` | tid | written to the GIVER's repo, addressed by `to` DID |
| `com.minomobi.farm.tend` | tid | written to the TENDER's repo, naming `subject` (farm owner) + `plantId` |

Two consequences worth internalising:

1. **Growth is a pure function** `growthOf(plant, crop, now, tendCount)` —
   1 ark growthDay = 30 real minutes (`DAY_MS`), each distinct tending friend
   cuts total time 10% (cap 5). No ticks, no cron: the public viewer, the
   owner's client and a skeptic all recompute the same field from the same
   records.
2. **Friend discovery is scan-based, not inbox-based.** Your client walks the
   repos of people YOU follow (`social.js scanFriends`, capped, all keyless)
   for tends/gifts naming you. A tend from someone you don't follow back is
   real but invisible — acceptable for v1, documented here so nobody calls it
   a bug.

Signed-out play works (localStorage tier); signing in promotes the local farm.
Writes go through the shared auth worker's `/pds/*` proxy, debounced — the PDS
is a save file, not a keystroke log.

## The game systems and where they came from

| System | File(s) | Source |
|---|---|---|
| bed geometry, keep-outs, spacing | `vendor/garden.js` | hoop v110 garden |
| generative botany (foraging networks, phyllotaxis, Murray's law) | `vendor/grow.js`, `vendor/flora.js` | hoop v110 garden |
| soil + bed cross-section rendering | `vendor/soil.js`, `vendor/plot-render.js`, `vendor/bed-render.js` | hoop v110 (worship/lib + garden) |
| the 73-crop / 6-biome ark (iNaturalist organisms) | `vendor/ark.json` | hoop v110 garden (built by its build-ark.mjs) |
| gacha (deterministic pulls, biome collections) | `vendor/gacha.js` | hoop v110 garden |
| alchemy (Galenic temperaments, Culpeper planets, coherence grades) | `vendor/alchemy.js`, `vendor/correspondences.js`, `vendor/cookbook.js` | hoop v110 alch / read/alch (the scholarly origin of correspondences.js) |
| the Seven (planet→metal→colour, Chaldean RPS) | `vendor/planets.js` | EXTRACTION of the planet-flavor half of hoop/v110/planets.js (the faction half needs stats.js and stays home) |
| OAuth client | `vendor/auth.js` | `packages/oauth-client/auth.js` |

**Vendor rule: COPY, NEVER FORK** (hoop's rule, kept). Re-sync from the listed
source; the only allowed local edits are the import-path lines marked
`VENDOR NOTE`. `correspondences.js` is edited in `read/alch/` only.

New, farm-owned kernels — all pure, all node-tested (`farm/test/*.selftest.mjs`,
run them before any push; the deploy workflow runs them again):

- `js/state.js` — save shape + every rule (plant/harvest/sell/pull/gift/brew/
  use/terraform/moveBuilding/unlockPack). Fresh-broken ground: a new farm's
  first 3 plantings grow 4×, so the first session ends with a harvest. Your
  home biome = `biomeForKey(did)`; the other five packs unlock in a fixed
  ladder (`PACK_REQS`: coins + harvests + mine depth + brews + biomes closed)
  that `packList()` evaluates live — the desk renders exactly that table, so
  the path to the next pack is never a mystery. Pulls deal from the ACTIVE
  unlocked pack; determinism keys on (seed, biomeId, pullIndex) so switching
  pools disturbs nothing.
- `js/iso.js` — the draggable 2:1 isometric world: terraform-aware ground off
  `tileAt`, billboarded flora + station huts in one painter pass, tool-aware
  hover (green/red), tap vs drag vs zoom. Projection/camera/input only — no
  game rules.
- `js/mine.js` — seeded levels `(didSeed, depth)`, exactly one ladder each,
  the Chaldean nobility gradient (lead/iron shallow → gold/quicksilver deep).
  Metals are the bench's vessel tax (`PREP_METAL`): elixir=gold, tonic=silver,
  balm=copper, smoke=tin, oil=quicksilver.
- `js/achievements.js` — the deed ledger + share text.
- `js/social.js` — pure tend/gift arithmetic (top half) + keyless public reads
  (bottom half).
- Brew utilities (the Galenic square read as farming): cooling→dew (growth),
  rousing→+1 yield, caustic→mine bombs, sedate→market ward, oil→tempered picks.
  A quintessence shard (mine) steadies a brew +0.15 coherence.

## Notification rails — bsky DMs (designed, NOT built)

The friction-free notification story ("your barley is ripe") should ride
Bluesky DMs, not emails or push. What v1 has: nothing automatic — growth is
slow enough (30m–1d) that check-back works. The designed rail, when wanted:

- **The shared auth worker cannot do DMs** — its `/pds/*` proxy is a closed
  8-method allowlist, forwards no `atproto-proxy` header, and the OAuth ceiling
  carries no `transition:chat.bsky`. Do not try to widen it for this.
- The precedent is **`photo/dm-worker.js`**: a separate server-side worker
  holding a BOT account's app password, calling `chat.bsky.convo.*` with
  `atproto-proxy: did:web:api.bsky.chat#bsky_chat`.
- Shape: a `workers/`-style cron worker + a farm bot account. Opt-in = the
  player DMs the bot first (which opens the convo and proves consent — no
  record needed). Each cron tick: list opted-in convos, read each player's
  PUBLIC plot record, recompute `growthOf` (it is pure — the whole point), DM
  whoever has ripe crops or gifts at the gate, remember last-notified in KV so
  nobody gets nagged twice. Fail-closed like `workers/bsky-bot`
  (`BOT_ENABLED != "true"` = observe only).
- Human prereqs when built: bot account + app password secret, KV namespace.

## Run / test (sandbox-safe)

```bash
for t in farm/test/*.selftest.mjs; do node "$t" || echo "FAIL $t"; done
python3 -m http.server -d farm 8080   # then open localhost:8080 — signed-out play works fully
```

Live PDS writes and OAuth need the deployed origin (the auth worker allowlists
`https://farm.mino.mobi`).

## Deploy order — the one coupling that matters

The farm's collections must be in the auth worker's `WRITE_COLLECTIONS`
ceiling before login-with-scope works. **This branch owns BOTH surfaces** (it
claimed `auth` for exactly this; see the registry note — hand auth back to the
next merge candidate). One push touching both trees fires both workflows;
if farm lands first, sign-in fails with `invalid_scope` only until deploy-auth
finishes and the metadata cache turns over (~1 min; see workers/auth/CLAUDE.md
for the cache trap and the PAR verification one-liner).

Verify a farm deploy by the golden rule: the log must bind
`farm.mino.mobi (custom domain)`; then check `/` serves "Harvestople" and
`/lexicons/com.minomobi.farm.plot.json` is 200.

## Invariants — do not break

1. **Determinism is load-bearing.** `newFarm(did)`, gacha pulls
   `(seed, biomeId, pullIndex)`, mine levels `(seed, depth)`, growth
   `(plant, crop, now, tends)` — all pure. No unseeded randomness in any
   kernel; `Math.random` is allowed only in UI confetti territory and rkey
   clock bits.
2. **No backend creep.** If a feature seems to need a server, it needs a
   redesign first (the DM rail above is the one sanctioned exception, and it
   is a SEPARATE worker, not this surface).
3. **Every social effect must be verifiable from public records** — a boost a
   viewer can't recompute from both sides' repos is a cheat vector, not a
   feature.
4. **Vendored files stay verbatim** (import-path lines excepted). Never edit
   game balance inside `vendor/`; balance lives in `js/state.js` constants.
5. **The plot record stays under ~900 KB** (the PDS ceiling; board's
   `SIZE_LIMIT` precedent). Ledgers in the save are bounded (claimedGifts 500,
   preparations 60, mine dug 400) — keep new ones bounded too.
