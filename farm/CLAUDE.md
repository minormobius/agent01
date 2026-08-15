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

1. **Growth is a pure function** `growthOf(farm, plant, crop, now, tendCount)`
   — 1 ark growthDay = 30 real minutes (`DAY_MS`); each distinct tending
   friend cuts total time 10% (cap 5). Since v4 it is the SETTLE MODEL:
   `grownMs` banks effective time as of `calcAt`, and the live tail runs
   piecewise — full rate while watered (`wateredAt + WATER_MS`, or irrigated
   by pond/sprinkler/tech), `DRY_RATE` (half) after. Watering is the TASK;
   the waterworks tech tree (sprinkler fixtures → channels → wind pump →
   deep well, paid in coins + planetary metals) is how it stops being one.
   Pests roll in deterministic 4h windows (`isInfested`) and bite the
   harvest unless treated — synthetic spray or a caustic brew. SYNTHETICS
   MARK THE PLANT CONVENTIONAL FOR LIFE (`syn`): its produce lands in
   `pantryC`, sells plain (organic sells ×1.75), and the bench refuses it —
   the alchemy pantry is the organic pantry, by construction. No ticks, no
   cron: the public viewer, the owner's client and a skeptic all recompute
   the same field, the same irrigation map, and the same beetle verdicts
   from the same records.
2. **Friend discovery is scan-based, not inbox-based.** Your client walks the
   repos of people YOU follow (`social.js scanFriends`, capped, all keyless)
   for tends/gifts naming you. A tend from someone you don't follow back is
   real but invisible — acceptable for v1, documented here so nobody calls it
   a bug.

Signed-out play works (localStorage tier); signing in promotes the local farm.
Writes go through the shared auth worker's `/pds/*` proxy, debounced — the PDS
is a save file, not a keystroke log. Two protections around that debounce
(2026-08-14, after a real cross-device loss): `store.flushNow()` fires on
`visibilitychange:hidden` / `pagehide` / `online` so a pending save doesn't
die with the tab (phones freeze timers on background — this was the hole);
and boot picks between local and remote by **progress, not clocks** —
`saveAhead()` compares monotonic counters (`progressMarks`), because a stale
device that merely opens later re-stamps `updatedAt` (streak commit) and
would win every timestamp race. An unambiguously-ahead local copy is adopted
and resynced; a genuine fork keeps the cloud copy and stashes local at
`farm:save:attic` behind a one-tap restore toast. `test/sync.selftest.mjs`
encodes the incident.

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
  game rules. PERF ARCHITECTURE (2026-08-14, 15-30× per frame): the ground
  renders once into an offscreen layer (viewport + `GM` margin) and blits
  until the camera leaves the apron, zoom changes, or `update()` sees a new
  farm/tool/theme (`groundVersion`); plant sprites and emoji come from raster
  caches (`plantRaster` keyed to modelFor's stage buckets, `textStamp`);
  the liveliness tick runs ONLY while animated sprites are on a visible
  tab's screen (`motion` flag — no `|| true`, ever); draw uses the LIVE
  clock so animation breathes between state updates; `plantAt` reuses the
  frame's hitboxes; a mousemove redraws only when the hovered tile or
  outlined target changes. Frame cost is instrumented —
  `harvestople.isoStats()` returns {frames, ms, avg} since last call, and
  the bench lives in the session scratchpad (perf.mjs pattern: 150 plants /
  25 parcels / 10 animals; 2026-08-14 baseline 45ms → 3.1ms at survey zoom).
  Anything that changes what the GROUND pass reads must ride
  `groundVersion` — a cached layer that misses an input is a stale-world
  bug. state.js backs this with per-farm-version WeakMap memos
  (`waterSourceWithin`/`irrigated`/`pathBeside`/`forageSpots`) — mutating a
  farm IN PLACE (console doctoring) can serve stale spatial answers until
  the next kernel clone.
- `js/mine.js` — seeded levels `(didSeed, depth)`, exactly one ladder each,
  the Chaldean nobility gradient (lead/iron shallow → gold/quicksilver deep).
  Metals are the bench's vessel tax (`PREP_METAL`): elixir=gold, tonic=silver,
  balm=copper, smoke=tin, oil=quicksilver.
- `js/achievements.js` — the deed ledger + share text.
- `js/social.js` — pure tend/gift arithmetic (top half) + keyless public reads
  (bottom half).
- `js/themes.js` — the SKIN kernel: six full-world palettes (every tile kind +
  sky/fog/rim + chrome CSS vars), each behind a live unlock predicate
  (Verdant free; Harvest 25 harvests; Seaside 4 parcels; Umbra — the original
  muted look — depth 12; Rose Dawn grade-A brew; Gilt 1000◈). The equipped
  skin is `farm.skin` IN the plot record, so visitors see your farm wearing
  it — and `currentSkin` renders the default for any save claiming a skin it
  hasn't earned, so the record can't lie to viewers. iso.js reads all ground
  colors from the skin; never hardcode a tile color in the renderer again.
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

## The oracle — sim-driven design (farm/sim/)

`node farm/sim/playtest.mjs [--days N --seeds K]` plays the game against the
REAL kernels with a casual check-in player (3 sessions/day) and reports fun
proxies: dead sessions, rewards/actions/variety per session, and the longest
unlock gap (days with nothing new — the churn signal). **Every balance change
goes through it**: the 2026-08-12 annealing took the 21-day unlock gap from
11 days → 3.7 (week-1 gap: 1.0 — something new every day) across six rounds
(sell ×0.5→×0.6; parcel price 200·n → 250·n^1.4·ring; livestock rates cut
~40% after the first pass minted 28 animals). If you touch an economy
number, run the oracle before and after and put both readings in the commit.

`node farm/sim/diversity.mjs [--days N --seeds K --trials T]` is the second
instrument — it answers "how many of X?" questions instead of pacing ones.
Three readings: **collection math** (coupon-collector E[pulls]/coins to close
each biome, real gacha weights), **novelty depletion** (first-seen day for
every element class over 28 days — is the stock front-loaded or drip-fed?),
and **choice entropy** (normalized Shannon H of a random vs a greedy
value-per-day planter — if H_greedy ≪ H_random, crop variety is wallpaper to
an optimizer). The 2026-08-13 diversity anneal that followed the first
baseline: animal roster gated on goods collected (`needsGoods` — coins
couldn't pace it: a novelty-seeking player bought all five kinds in week 1),
sell prices blended toward a value-per-day norm (`VALUE_NORM`), and — the one
that actually moved the needle — **market saturation** (`SAT_K`/`SAT_RATE`:
the village buys 10 units of any one crop per day at list, ×0.5 after).
Compression alone made H_greedy WORSE (0.42 → 0.13; a stable king is still a
king); saturation took it to 0.89 over 19 species, i.e. rotation became the
optimal play. Oracle after the whole set: unlock gap 3.3 → 2.7 days, variety
7.8 → 9.3 verbs/session, and the forge line drips new elements through weeks
2–4 (alloys 92%, charms 5.5/7 seen by day 28). Note the instrument lesson
baked into both sims: the simulated player must be NOVELTY-SEEKING when
buying animals — a cheapest-first policy misreports the roster as depleted.

Livestock (`ANIMALS`, barn station): wander the map via `animalPos` (pure
lissajous, no stored position), eat pantry produce (the produce sink), drop
goods on timers, pet once/day to double the next collect; goods inherit the
FEED's grade (organic in, organic out). The bigger animals are gated on
`needsGoods` (goods collected — the barn earns its reputation), shown locked
in the stable so the shelf is a goal. Forage (`forageSpots`): sparkles
respawn every 4h across owned land, tap to gather coins/wildseeds/shards —
arrival is always a small hunt across the estate you built. Both are v5 save
fields; migration adds the barn to older saves.

## The forge — the metals vertical (v6)

The mine's seven metals were only ever an ingredient tax; the forge
(`FORGE_REQ`, `buildForge`) is the thing to do with ONLY metals, and the
first station that is BUILT rather than inherited (craft tool, gated on mine
depth 5 — visible-locked in the craft bar before that). One timed crucible
(`ALLOYS`, `smeltAlloy`/`collectSmelt` — a ready pour never blocks the next),
a rack that sells (`sellAlloy` — the mine's own income line), and the depth
layer: seven planetary **charms** (`CHARM_DEFS`, Chaldean planet→metal),
each struck from 2× its own metal + an alloy. One worn at a time
(`setCharm`): crops of the worn planet grow ×`CHARM_SPD` **from the sowing**
(the boost is written on the plant — `p.sign`, `p.spd` — so viewers
recompute it without knowing when charms swapped) and sell ×`CHARM_SELL`
while worn. `cropPlanet()` makes the sign total: Culpeper's rulership where
the ark has one, a deterministic hash over the seven otherwise (the ark has
no Saturn herbs — without the hash a Saturn charm would bless nothing). The
forge pane lists which of YOUR crops each planet rules: the correspondence
system is invisible until you build the thing, then teaches itself. The
surface game never requires any of it — that's the graspable/depth split.
Save v6 adds `forge` (null until built), `market` (the saturation tally) and
two stats; `fromPlotRecord` walks v1→v6.

## The town council — players change the game (the immediate loop)

Petition (deeds sign) → record in the player's own repo + `#harvestople`
courier post (**pre-launch the post is off** — `COURIER_POSTS` in `js/app.js`;
the sweep's farmers rail reads petition records straight from the repos in
`council/farmers.json`, and verdicts then show in the hall instead of a reply
thread. Flip the flag at launch) → **`farm-sweep.yml`** (15-min cron) finds it, convenes a
headless council session (`claude -p`, no Bash — lab-build containment) on
**`claude/farm-next`**, which builds the wish or declines it → the walls
judge the diff (`next-scope.mjs` + every selftest) → push deploys **the
testing table, `farm-next.mino.mobi`** (`wrangler.next.jsonc`; scales
advisory there) → `reply.mjs` answers in the petitioner's thread with the
live link. Weekly, **`farm-merge-party.yml`** runs the full walls (scales
HARD), assembles patch notes from the ledger delta, opens a graduation PR to
the deploy branch (a human merges — mechanics are Tier 3), and announces on
Bluesky. Constitution + triage: [`PETITIONS.md`](PETITIONS.md) (served law).

**The save covenant** makes one plot record serve both worlds: experiments
never bump `v`, keep ALL state under `farm.x.<featureId>`, and write real
fields only through existing kernels at existing rates (new rewards escrow
in the pocket until graduation). `test/covenant.selftest.mjs` gates every
deploy of both worlds; `store.js` refuses to write over any save it cannot
read (`newerworld` event), so even a covenant-breaking record can't be
clobbered. The older mainline moat (`petition-scope.mjs` +
`farm-council.yml` on `claude/farm-petitions`) remains as the narrow
pure-content lane. The scales (`gate.mjs` + `thresholds.json`) run hard in
every MAINLINE deploy. Petition text is untrusted input; the walls judge the
diff, never the wish. Thresholds, sims, workflows, and PETITIONS.md are
human-edit-only.

## Water, paths, roads — the spatial rules (2026-08-13, oracle-gated)

**Water stakes**: a plant wants a SOURCE (pond / sprinkler / deep well)
within `WATER_RANGE` (4). Beyond that the dry ground gives NOTHING (only
watered windows grow it) and `PARCH_MS` (48h) unwatered kills it —
unrecoverable, `clearPlant`, no seed back; ripe-but-neglected included.
Yield follows **hydration** (grown/elapsed, pure arithmetic over existing
fields): <0.8 → ×0.75, <0.6 → ×0.5. `THIRSTY` wetland crops (papyrus, rice,
lotus, cress) refuse planting beyond water-range 1 outright — idiosyncratic
rules keep the roster spatial. `p.wr` rides the record; v7 migration
grandfathers old plants (lenient range + fresh grace). VALUE_NORM 12→15 and
the thresholds harvest band [300,1200]→[200,900] moved WITH this change (the
stakes halve harvest count by design; income and unlock tempo held — gate
12/12 after). The sims dig ponds when watered ground runs short; keep that
policy or the oracle starves like round 1.
**Paths**: a path/road on a neighbouring tile halves pest infestations
(`pathBeside`). Forage sparkles bias to path/road tiles. **Roads**: each
owned parcel with road tiles adds +2% to produce prices, cap +10%
(`roadBonus`, tileAt-based — meadow the road away and the carts stop).

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
