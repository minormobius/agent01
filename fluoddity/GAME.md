# Fluoddity — the Game (`/game/`)

> Design doc + build notes. **Implemented** at `fluoddity/game/index.html` (all
> three levels in one vanilla file, reusing the existing engine, descriptors,
> auth, and the three lexicons). This describes the new front-door surface: a
> single, sliderless, pigeon-friendly loop where every action quietly
> contributes records to the shared corpus (gallery / forest / rubrics).
>
> Status: shipped to the `claude/fluoddity-*` deploy. Build decisions that
> deviated from the original sketch are flagged inline as **[build note]**.

---

## 0. Why this exists (the feedback, verbatim intent)

> "I still think my white whale is something that explicitly *plays* more like a
> *game*… you could make some Balatro-tier crack with the right UX. The loop is
> all *there* — it's really just about a less complicated UI that focuses the
> user flow in on *the loop*. Look at how Universal Paperclips starts with
> nothing — 'unfolding' mechanics keep users from being overwhelmed. One
> question I keep coming back to: could you play it high / drunk / as a kid / as
> a monkey / as a pigeon? Right now this feels like a Toy For Nerds. 'Explore
> visual novelty space together' doesn't need a cognitive 'must be at least this
> tall to ride.'"

The diagnosis is correct, and the good news is structural: **the loop is already
implemented across the existing surfaces.** Nothing about the simulation,
scoring, or publishing needs to be invented. What's missing is a surface that:

1. Shows **one decision at a time** ("this one or that one"), never a slider.
2. **Unfolds** mechanics one at a time (UP-style), starting from almost nothing.
3. Rides a **single hidden axis — entropy/temperature** — so progression *is*
   "it gets more interesting," with no other knobs.
4. Makes casual play **contribute real signal** to the global project for free.

The existing expert surfaces (`playground`, `arena`, `select`, `breed`, `hot`,
`forest`, `gallery`, `map`, `torus`) stay exactly as they are — the nerd lab.
The game is the new casual entrance. **The nerd game is making the best game
conditions; this is the game.**

---

## 1. What already exists (so we build almost no new science)

Every mechanic the game needs already ships. The build is *re-skinning and
sequencing*, not new simulation.

| Need | Already in | Detail |
|---|---|---|
| 16 colonies in one shared field | `engine.js` arena mode | `new FluoddityEngine(512, 70000, { arena: true })` runs 16 species, species *k*'s brain seed = `rule_seed + k·(0.08 + mutation_scale·2.0)` (`seedOf(k)`). One field config expands into 16 distinct rules. |
| "Slight mutations" / "spread" | `engine.js` | `mutation_scale` is the spread knob. Small = the 16 are near-identical; larger = they diverge. Default arena spread `0.06`. |
| Pick a colony by tapping the field | `arena.html` | Float-field readback of the species-hue `(z,w)` channels at the tapped pixel → `species = round(hue·16)`. Falls back to a legend swatch row. |
| "Nearly frozen" / "boil" / "alive" classification | `descriptors.js` `verdict()` | `frozen` = `motion < 0.0015 && fill > 0.03`; **`boiling` = `struct < 0.5`**; `alive` otherwise; plus `dead`/`sparse`/`blown out`. **These are the literal win/lose conditions.** |
| "Interestingness" scalar | `descriptors.js` `fitness` / `fitness2` | Structured + moving + healthily-covered → high; dead/sparse/boiling/blown-out → low. Two-snapshot `fitness2(v1,v2)` catches the "looked alive then died" lie. |
| Re-seed on a pick (propagate) | `arena.html` `propagate()` | `mutate(cfg, 0.5)` then `rule_seed = seedOf(selected)`. History stack + back. |
| Background breeding loop | `breed.html` `runLoop()` | popSize 12, softmax parent selection (tau 0.25), novelty bonus (lambda 0.4, k=6 archive of 500), momentum (mu 0.3), `mutate(p, mutRate=1.0)` per gen, ~100 ms/gen. |
| Taste → scoring lens | `hot.html` | Swipe HOT/NOT → 8-feature vectors (`FEATURES8` = `fill,motion,struct,blowout` + their T2−T1 deltas) → `trainLogistic(F, y, 300, lr 0.25)` → linear rubric. |
| Rubric feeds breeder | shared localStorage | `fluoddity_active_rubric` (`{code, scorerHash, savedAt, source}`) read by landing/torus/breed; `fluoddity_breed_custom_score` (raw scorer body) read by breeder. |
| OAuth + PDS writes | `authchip.js` / `auth.js` | `import { auth } from './authchip.js'`; `auth.login(handle)`, `auth.isLoggedIn()`, `auth.pds.createRecord/putRecord(...)`. Session in origin localStorage → carries across all surfaces. |
| Publish targets | three lexicons | `com.minomobi.fluoddity.organism` (gallery), `.rubric` (rubric corpus), `.expedition` (the forest). All backlink-anchored to `did:web:g.mino.mobi` so Constellation enumerates them across all users. |
| Deploy | `.github/workflows/deploy-fluoddity.yml` | Triggers on `main` + `claude/fluoddity-*` touching `fluoddity/**`. Pure static `wrangler deploy` (assets dir `.`). No D1, no migrations. **Push = ship.** Our branch `claude/fluoddity-game-tooling-q9wyE` already matches. |

**Net: the game reuses `engine.js`, `descriptors.js`, `authchip.js`/`auth.js`,
and the three lexicons unchanged.** No new lexicon, no migration, no worker
change.

---

## 2. The surface

- **New directory:** `fluoddity/game/` with one entry `index.html` (vanilla, no
  build), mirroring the other surfaces. Imports the existing shared modules via
  relative paths:
  ```js
  import { FluoddityEngine, randomConfig, mutate, defaultConfig, PARAMS } from '../engine.js';
  import { readDescriptors, verdict, fitness2, merge, vec8, FEATURES8 } from '../descriptors.js';
  import { auth, mountAuthChip } from '../authchip.js';
  ```
- **Optional data file:** `fluoddity/game/heroes.js` — a small baked set of
  known-alive "hero" genomes (the fallback seeds for "pick zero," and the
  level-1 cold-start ancestors). See §5.D.
- **Landing change (placement decision):** the hero **"open" CTA on
  `fluoddity/index.html` becomes "▶ play"**, routing to `./game/`. The current
  cards (Playground, Gallery, Map, Forest, Hot-or-not, Selection, Arena, Torus,
  Breeder) drop below a divider into an **"instruments (for nerds)"** row. The
  game is the default way in; the lab is one tap away for the curious.
- **No change** to any existing surface's code, the engine, the descriptors, the
  worker, or the lexicons.

---

## 3. The loop, in one breath

> You are shown the field. You tap the part you like. It gets more interesting.
> Repeat until something wild happens. Then you get a new way to tap. Repeat.

Three levels, each unlocking exactly one new verb. Everything else stays hidden.

```
LEVEL 1  HEAT      tap 1 → it warms      win: anything BOILS
LEVEL 2  TAME      tap 2 → interpolate   win: 0/16 boiling (the edge)
LEVEL 3  BREED     swipe HOT/NOT         endless: taste drives the stream
                                         (auto-publishes; contributes)
LEVEL 4  DISCOVER  tap 1 converge /      endless: LOCK IN a single phenotype →
         (graduate) tap 2 explore        published, lineage-linked discovery
```

The hidden axis through all of it is **temperature T** (entropy): low = frozen,
high = boiling, and the *interesting* life lives on the edge between them. The
whole game is learning, with your thumb, where that edge is — which is exactly
aphid91's "temperature intuition," handed to a pigeon.

---

## 4. Temperature — the single hidden axis

The game never shows a slider. Internally it tracks one scalar **`T ∈ [0,1]`**
and derives the physics knobs from it ("rides the entropy with no other
changes"). A known-alive base genome `G` is held fixed except for a small
coupled set that moves with `T`:

```
global_force_mult = lerp(0.12, 1.3, T)     // more force → more motion/entropy
sensor_gain       = lerp(1.5,  7.0, T)      // hotter sensing
mutation_scale    = lerp(0.01, 0.12, T)     // the 16 diverge more as it heats
trail_persistence = lerp(0.985, 0.90, T)    // colder holds its shape longer
```

> Exact endpoints get tuned in implementation **against `verdict()`** so that:
> a fresh level-1 field reads mostly `frozen`/`settling…`, and ~3 propagates
> reliably tips *something* to `boiling`. The numbers above are the starting
> guess, not gospel.

- **A pick advances T** by a small step (≈ +0.12) *and* re-centers `rule_seed`
  on the chosen species (`seedOf(selected)`), so "the right one" both heats the
  field and points it at the brain you liked. That is the entire level-1 verb.
- Because `verdict()`/`fitness2()` are computed live on the running field, the
  game *knows* when it's frozen, alive, or boiling without asking the player
  anything.

---

## 5. The three levels in detail

### Level 1 — HEAT (tap one → it warms; win when anything boils)

- **Start:** 16 nearly-frozen colonies. `T ≈ 0.1`, base genome from a hero seed,
  small `mutation_scale` so the 16 are subtle variations. Most colonies read
  `frozen`/`settling…`.
- **Verb:** tap the colony you like (field tap → species hue, or a swatch).
  → `propagate()`: `rule_seed = seedOf(pick)`, `T += ~0.12`, re-load field.
- **Feel:** each tap visibly *wakes the field up* — more motion, more structure.
  "Three clicks to see some wild stuff" falls straight out of the T ladder.
- **Win condition:** any colony's `verdict === 'boiling'` (`struct < 0.5`). Big
  "**IT BOILED**" moment. This is the overshoot — you've found the hot edge.
- **No writes** happen in level 1.

### Level 2 — TAME (a second tap unlocks; win when 0/16 boiling)

Unlock a *second* selection. The number of colonies you tap chooses the operator
that builds the next 16:

| Taps | Operator | How the 16 are built |
|---|---|---|
| **2** | **interpolate** | The 16 cohorts are the morph from genome **A** to genome **B**. |
| **1** | **mutate-around** | `mutate(cfg, 0.5)` re-centered on the pick (today's arena propagate). |
| **0** | **seed-from-hero** | Re-seed from a baked hero genome (a safe restart). |

**Interpolation (the interesting one).** Arena already lays the 16 species seeds
on a *line*: `seedOf(k) = base + k·(0.08 + mutation_scale·2.0)`. So interpolation
reuses that machinery directly:

```
base           = A.rule_seed
mutation_scale = (B.rule_seed − A.rule_seed) / (2·15) − 0.04   // so seedOf(15) ≈ B.rule_seed
// continuous physics knobs also lerp across cohorts:
cohort k's view = lerp(A_knobs, B_knobs, k/15)
```

> **Caveat to resolve in build:** `rule_seed` is a hash input, so seed-space is
> *not* perceptually linear — cohort 8 isn't visually "halfway" between A and B.
> Mitigation: lerp the **continuous** physics knobs (force, gain, persistence,
> sensor angle/distance) linearly across the 16 so the morph still *reads* as a
> gradient even where the brain jumps. If that's not smooth enough, fall back to
> "half the cohorts carry A's brain, half carry B's, all sharing lerped physics"
> (a crossbreed spectrum). Decide empirically; it's a one-function change.

- **Verb framing:** "the boil is too wild — calm it down." Tapping two adjacent
  colonies blends them; the player hunts for a blend that *stops boiling without
  going dead.* That is literally finding the edge of chaos.
- **Win condition:** **0 of 16 colonies boiling** while the field is still alive
  (not all `frozen`/`dead`). "**TAMED**" moment. You've pulled the whole field
  back to the structured edge.
- **No writes** happen in level 2.

### Level 3 — BREED (swipe HOT/NOT; endless; this is where it contributes)

Take level-2's final pick as the gen-0 seed and start the **background breeder**
(`breed.html`'s loop). The player never sees knobs or a population grid; instead:

- **A continuous stream of bred organisms is served one at a time**, each settled
  and rendered full-bleed.
- **The verb is a swipe:** HOT (→ / up / tap-heart) or NOT (← / down / tap-x).
  This is the Balatro-tier core: fast, juicy, one decision, infinite content.
- **Votes shape the search.** Once there are ≥4 HOT and ≥4 NOT, fit the logistic
  hyperplane (`trainLogistic`, 8 features) and install it as the breeder's
  scoring lens via `fluoddity_active_rubric` + `fluoddity_breed_custom_score`.
  From then on the *stream tilts toward your taste* — the loop closes. Re-fit
  every N new votes.
- **Background breeding** keeps generating with that lens while you swipe, so
  there's always a next card. (popSize 12, tau/lambda/mu defaults; mutate 1.0.)

**This level has no "clear."** It's the open-ended endgame — the contribution
engine and the long-tail dopamine loop. A soft "you've shaped a taste" milestone
fires when the rubric's training accuracy crosses a threshold, but play
continues.

---

### Level 4 — DISCOVER (the level-2 arena as a discovery engine; lock in a phenotype)

Graduation. Unlocks the first time a taste is trained in L3 (a ✦ discover button
appears on the swipe dock; entering from the `winLevel2`→breed path is unchanged).
It reuses the **level-2 live arena** wholesale — same 16 species, same tap-one /
tap-two / regrow — but swaps the objective from "stop boiling" to **open-ended
Picbreeder-style convergence**:

- **Tap one → converge.** Regrowing re-centers the 16 on your pick and *tightens*
  the spread (`× SHRINK` each time, down to `SPREAD_FLOOR`). A `lock ▓▓▓░░░` meter
  (in the field badge) fills as the 16 close in on one phenotype.
- **Tap two → explore between.** Same A→B interpolation as L2 — wander the space.
- **↻ wander →** jump somewhere new (spread resets).
- **✦ LOCK IN →** collapse the field to a **single phenotype** (`mutation_scale 0`,
  all 16 cohorts identical), **publish it** as a `com.minomobi.fluoddity.organism`
  with `parent` = the previous lock-in (so repeated discoveries grow a **lineage
  tree** in phase space), then **re-expand from there** to hunt the next one. No
  win — it's the engine that produces the map.

Temperature is fixed at `T_DISCOVER` (mid, lively) so every discovery is alive;
the only axis the player moves is *which phenotype*, by eye. This is the literal
"engine of discovery": each lock-in is a published, lineage-linked artifact that
feeds the gallery and the phase-space map — citizen-science output from pure
this-one-or-that-one taps. Runs on the same `AE` arena engine as L1/L2 (the
breed engine `BE` is left intact but idle).

## 6. Unfolding (Universal-Paperclips discipline)

Nothing is on screen until it's needed. The reveal schedule:

| Moment | What appears | What's still hidden |
|---|---|---|
| First load | The field + 3-word prompt "**tap the one you like**" | Everything else |
| After tap 1 | A faint **warmth gauge** glows in | Second tap, breeder, any text |
| Boil (L1 win) | "**IT BOILED**" + "now you can tap *two*" | Breeder |
| First L2 tap-two | A one-line teach: "two = a blend" | Breeder |
| Tame (L2 win) | "**TAMED**" + the swipe affordance slides up | Knobs, grids, jargon (forever) |
| First HOT swipe | A tiny "saved to your garden ✦" toast (the contribution cue) | — |
| Rubric converges | "**you've got a taste**" milestone | — |

The expert lab is reachable only through a single small "⚙ open in lab" link in
a corner — never pushed. A pigeon never sees a number.

---

## 7. Accessibility — passing the pigeon test

- **Every decision is "this picture or that picture."** No reading required after
  the first 3-word prompt. No vocabulary, no sliders, no spreadsheet.
- **Big tap targets, one-handed mobile.** Field fills the screen; swipe + tap
  only. The arena's `dvh`-aware square layout already handles mobile chrome.
- **Colorblind-safe selection cue:** picked colony cues by **bloom + scale +
  dim-the-rest**, not hue alone.
- **No fail state in L1/L2 that punishes** — "dead" just reseeds with a wink;
  you can't lose, only wander.
- **Sound is optional juice** (off by default; a toggle), never required.

---

## 8. How casual play contributes to the global project

This is the "does still contribute" requirement. Each in-game action maps to a
real ATProto record on the **player's own PDS**, anchored to `did:web:g.mino.mobi`
so the existing gallery / forest / rubric viewers pick it up with zero extra
plumbing. **(Auto-publish policy: HOT-voted organisms + one rubric + one
expedition per session.)**

| In-game action | Record written | Feeds |
|---|---|---|
| Swipe **HOT** in L3 | `com.minomobi.fluoddity.organism` (config string, `gallery` anchor, `name` like "from the game · ⟨date⟩") | the **gallery** menagerie |
| Votes in L3 (≥4/≥4, re-fit) | **one** `com.minomobi.fluoddity.rubric` updated in place (`putRecord` to a stable rkey), weights/bias/`judgments`/`accuracy` | the **rubric corpus** + breeder lens |
| Reaching/leaving L3 (session end) | **one** `com.minomobi.fluoddity.expedition` (the L3 run: `start`, `scorer`=the fitted rubric body, `trajectory`, `knobs`) | the **forest** atlas |

So a midnight thumb-swiper grows the shared map of "what minds-with-taste find
interesting in this rule space" — the landing's citizen-science thesis, minus the
cognitive toll. The casual front door and the research instrument are the *same
data*.

### Write hygiene (so we don't flood a real Bluesky repo)

- **Dedup** organism writes by a stable config hash; never write the same genome
  twice in a session.
- **Rate-limit** organism writes (e.g. ≥1.5 s apart, soft cap ~60/session) so a
  fast swiper can't spew hundreds of records. Excess HOTs beyond the cap are
  buffered and dropped silently rather than written.
- **Rubric is one record, updated** (`putRecord` to a per-session/stable rkey),
  not a new record per re-fit.
- **Expedition is one `createRecord`** at session end or L3 exit; trajectory
  capped (breeder already caps at 4000 tuples).
- All writes are **best-effort**: failures are swallowed (a quiet toast), play
  never blocks on the network.

---

## 9. OAuth at the gate — with one recommended softening

The spec says "OAuth at the gate." Honored: signing in is the front-door action,
and it guarantees a PDS to publish to. **Recommended refinement** (flagged, not
decided): make the gate *soft* —

- Let **levels 1–2 run without sign-in** (they write nothing anyway). Show the
  field immediately; a pigeon can tap and watch it heat up with zero friction.
- **Require OAuth only at the level-3 boundary** ("sign in to start your colony /
  keep what you breed"), exactly where publishing begins.

This preserves the "pick up and play" bar the feedback worried about while still
gating every *write* behind auth. If you'd rather keep a hard gate (sign-in
before the first tap), it's a one-line ordering change — call it.

---

## 10. Technical architecture

- **Levels 1–2:** one `FluoddityEngine(512, 70000, { arena: true })` — identical
  to `arena.html`. The 16 colonies are its cohorts; tap-to-select via the float
  readback already in arena. `verdict()`/`fitness2()` sampled live (cheap 64²
  downsample) to drive win detection and the warmth gauge.
- **Level 3:** the breeder runs the **compact** engine (`FluoddityEngine(480,
  55000)`, non-arena) rendering one organism at a time and blitting to a 2D
  canvas (gallery/select pattern). Background gen loop on a timer; a small ring
  buffer of pre-settled candidates so a card is always ready to swipe.
- **Performance:** throttle `step()` per frame; pause the sim when the tab is
  hidden (`visibilitychange`); cap DPR at 2 (as the other surfaces do).
- **State machine + persistence:**
  ```
  localStorage: fluoddity_game_state = {
    level, T, history[], lastPick, heroSeed, votes:{hot,not}, rubric, sessionStartedAt
  }
  ```
  Resume mid-level on reload. Reuse the cross-surface keys
  `fluoddity_active_rubric` and `fluoddity_breed_custom_score` so a taste trained
  in the game also lights up the lab surfaces, and vice-versa.
- **Config encode/URL share:** reuse the canonical base64url(`JSON`) format
  (`#c=…`) so any organism the game surfaces can deep-link into `/play/` or be
  shared, and so a hero genome can be pasted in.

---

## 11. Build phases (when we implement)

1. **Skeleton + L1 (HEAT).** `game/index.html`, arena engine, temperature ladder,
   tap-to-heat, live `verdict()` win on first boil, warmth gauge, the 3-word
   onboarding. Tune the T endpoints so "3 clicks → boil" feels right. *No auth,
   no writes.* Ship and feel it.
2. **L2 (TAME).** Second-tap unlock; the 0/1/2-pick operator (interpolate /
   mutate / hero-seed); resolve the rule_seed-interpolation perceptual question;
   0/16-boiling win. Still no writes.
3. **L3 (BREED) + publishing.** Background breeder stream, HOT/NOT swipe, logistic
   re-fit → live lens, the swipe juice. Wire the OAuth gate (hard or soft per §9)
   and the three-record auto-publish with the §8 hygiene. Reuse the existing
   lexicons.
4. **Landing promotion.** Flip the hero CTA to "▶ play" → `./game/`; demote the
   cards into an "instruments" row. Regenerate OG if needed.
5. **Juice pass.** Bloom/dim selection, level-up flashes, optional sound, the
   "saved ✦" / "you've got a taste" toasts, milestone copy.

Each phase is independently shippable (push to `claude/fluoddity-*` →
`deploy-fluoddity.yml` deploys the static assets; a markdown/asset push is inert
on the live pages).

---

## 12. Open questions to settle during build

1. **Hard vs. soft OAuth gate** (§9). Spec says hard; soft is recommended for the
   pigeon test. *Default if unspecified:* honor the spec (hard gate).
2. **rule_seed interpolation** (§5 L2): lerp-physics-only vs. half-A/half-B
   crossbreed. Decide on-screen; one-function change.
3. **Temperature ladder constants** (§4): tune endpoints + per-pick step against
   `verdict()` so boil is reliably ~3 picks away, never instant, never never.
4. **Hero genome set** (§5.D): how many, and baked-static vs. seeded from the
   live gallery (Constellation). *Lean:* bake ~6 known-alive genomes for
   reliability; optionally enrich from the gallery when online.
5. **PDS rate-limit caps** (§8): the exact per-session organism cap and min
   inter-write spacing. *Lean:* ~60/session, ≥1.5 s apart.
6. **Sound:** ship a tiny synth/SFX layer or stay silent-with-toggle for v1?

---

## 12a. Build notes (where the shipped code deviated from the sketch)

- **[build note] Levels 1–2 are the *live* arena shared field** — one
  `FluoddityEngine(512, 70000, { arena:true })` animating continuously, 16 species
  intermingling, selected by tapping a species' territory (float-field hue
  readback) or a legend swatch. (An earlier pass rendered 16 settled *stills* for
  exact per-cell verdicts; it lost the living motion that is the whole point, so
  it was replaced.) Win conditions read the **whole field** with `verdict()`: L1
  wins when it boils, L2 wins when it's tamed back to alive. The "0/16 boiling"
  counter became a single live verdict badge + heat gauge — the per-species count
  isn't recoverable from one shared trail without hue-binning, and the live field
  is worth more than the counter.
- **[build note] Wins are gated on player moves, not just `verdict()`.** A
  16-species shared field has inherently low spatial coherence, so its whole-field
  `verdict()` reads "boiling" almost immediately and flickers around the
  threshold — which let both L1 and L2 auto-complete with zero input. Fixed by
  requiring `MIN_HEATS` picks (L1) / `MIN_TAMES` cooling regrows (L2) *and* a
  2-sample verdict streak before a level can be won, with a widened temperature
  range so heating/cooling actually moves the field. The verdict is now
  confirmation; the player's moves are the gate.
- **[build note] Level 2 cools on a ladder.** Each "regrow" eases temperature
  down a notch (`L2_COOL`) while the picks steer *which* genome family you settle
  into (2 picks interpolate A→B across the 16 seeds via arena's `seedOf()` line, 1
  settles around the pick, 0 reseeds). So taming is guaranteed-reachable in a few
  regrows (you pass from boil → alive), and the picking is your taste, not a gate.
- **[build note] Soft OAuth gate at the level-3 boundary**, not a hard gate at
  the front door (§9's recommended option). Levels 1–2 (which write nothing) run
  sign-in-free so a first-tap costs zero friction — the pigeon test. Sign-in is
  required exactly where publishing begins (entering BREED). The gate has a real
  Bluesky handle **typeahead** (`searchActorsTypeahead`, same as `fluoddity/play`),
  not a bare `prompt()`. Sign-in uses a **clean `returnTo`** (origin+pathname, no
  `#fragment` — a fragment swallows the worker's `?__auth_session=` token and
  breaks the loop) plus a `fluoddity_game_resume` localStorage flag; boot `await`s
  `auth.init()` then resumes straight into BREED. Flip to a hard gate by calling
  `gateLevel3()` at boot instead of `startLevel1()`.
- **[build note] "Too hot" folds `boiling` + `blown out` together** (`tooHot()`)
  for both win tests, so the heat ladder is robust to exactly where a given seed's
  chaotic edge lands (some seeds gas out as `boiling`, some saturate as
  `blown out`; both mean "you cooked it").
- **[build note] Level-2 interpolation lerps continuous knobs *and* the
  `rule_seed`** linearly across the 16 (the §5 perceptual caveat is accepted for
  v1: the morph reads as a gradient via the physics even where the brain jumps).
  The half-A/half-B crossbreed fallback is left as a one-function swap if needed.

- **[build note] Shared view controls (`../viewcontrols.js`).** A trail⇄particle
  display toggle + a reset button, mounted in the top bar and wired to whichever
  engine the level is driving (`AE` for L1/2/4, `BE` for L3). The mode persists in
  `localStorage['fluoddity_display_mode']` — the same key the playground uses — so
  the choice carries across every fluoddity surface. Reset re-seeds the current
  level's field. The same component is mounted on every surface (arena, select,
  hot, gallery, breed, map, torus, forest, the hero). `forest` is reset-only (no
  engine); `torus` carries its **own 3D point shader** so particle view projects
  each agent onto the donut surface (the 2D engine particle render can't).

- **[build note] Substrate-scale axis + matched density.** Fluoddity isn't
  scale-invariant: field energy ∝ `count·brushSize²`, so the same genome looked
  hotter on the torus (`384/45k`, density ≈2.88) than the playground (`1024/200k`,
  ≈1.8). The engine gained `setSubstrate(s)` (a live multiplier on the brush), and
  `viewcontrols.js` an **energy slider that defaults to "matched"** — each viewer
  surface (hero, gallery, arena, select, torus) normalizes to the playground's
  reference density `M_REF=1.8` at the slider's center, so an organism reads with
  the same energy everywhere; sliding explores hotter/cooler renders of the
  identical rule. The **game opts out of matching** (`substrate:{match:false}`) so
  its level tuning is untouched, but still gets the slider. Also: arena's reset now
  re-seeds the current ecosystem (it was aliased to the reroll/new-field button).

- **[build note] Cross-board auth fix.** Sign-in failed across surfaces (and ate
  in-progress organisms) because `authchip.js` and the playground logged in with
  the default `returnTo` = the full URL *including the `#fragment`*. The auth
  worker appends `?__auth_session=…`, which a fragment swallows — so the token was
  lost (sign-in silently failed) and any organism in `#c=…` got mangled. Both now
  pass a **clean `returnTo`** (`origin+pathname+search`, fragment stripped); the
  playground already persists `getConfig()` to `localStorage` every 250ms, so the
  organism is restored on return. The bare `prompt()` handle entry is replaced by
  a shared typeahead dialog (`handle-dialog.js`). The session token lives in
  origin-scoped `localStorage`, so signing in once on the landing carries across
  every fluoddity surface.

## 13. What this explicitly does NOT touch

- No change to `engine.js`, `descriptors.js`, the worker, `wrangler.jsonc`, or any
  D1 (the game is pure static + PDS, like the rest of fluoddity).
- No new lexicon and no migration — reuses `organism` / `rubric` / `expedition`.
- No change to `arena.html`, `select.html`, `breed.html`, `hot.html`, `play/`,
  `gallery.html`, `map.html`, `forest.html`, `torus.html` — they remain the lab.
- The only edit outside `game/` is the landing hero CTA + card reflow (§2, §11.4).
