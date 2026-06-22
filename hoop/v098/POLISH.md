# v098 — the home stretch (polish punch-list)

v098 = v097 + the rumor-mill verdict feed wired into the live load path. The big systems are in
and tested; what remains is *feel*. This is the living checklist for the final pass.

## Automated testing — the simulated player
- [x] `test/playthrough.selftest.mjs` — generates REAL worlds (`solveChunk`), walks a synthetic
      traveller room-to-room over the actual nav mesh, and drives the real engine at each place
      (crystallize / fight / trade / socket gems), writing save records mid-walk and reloading them
      to prove recall survives. Asserts connectivity, no-repeat, save round-trip, coins ≥ 0, and
      **determinism** (same seed ⇒ identical transcript). ~1.6 s for 3 worlds + 2 re-runs.
- **It already surfaced a balance signal:** the synthetic (greedy-AI, starting-gear) traveller
  **loses most deck-0 hazard fights** (≈2 wins of 7 across the worlds). Either creeps are over-tuned
  at deck 0, the baseline character needs better starting gear, or the player AI is too naive — worth
  a look during the combat-balance pass. The harness makes this measurable: win-rate is now a number.
- [ ] follow-ons: multi-chunk worlds (stitch the walk graph across `ports`), property-style fuzzing
      over many seeds (assert invariants, not exact transcripts), drive the verdict/replenish loop
      *over a live walk*, and a CI Playwright lane for the actual DOM/canvas (the one thing node can't).

## The content loop (backend ⇄ client) — wired + pinned
- [x] backfill → draw → mint/save → crystallize → deplete → replenish → verdict → redraw
      (`test/hypothecation.selftest.mjs`, 31 assertions)
- [x] verdict consumer (`story/verdicts.js`) wired live: sweep on save-load, tab-refocus, 60 s poll
- [ ] **verdict notices** — currently one `#busy` toast (multiple stomp). Want a small notice **log**
      (a dismissible stack) + a "what changed" panel on a retcon, not a flash.
- [ ] **pulse** (`story.pulse`) — the cross-player rollup is never shown. An ambient line ("31
      travellers have met the Keeper") on the auth pill or a corner would close the loop's last leg.
- [ ] verdicts need a signed-in DID (they're DID-tagged) — anonymous players get none. Intended,
      but surface it (a hint in the auth pill: "sign in to receive the Tabard's changes").
- [ ] records page (`/v098/records`) — note that the verdict feed is now consumed live.

## Combat (arena → world) — shipped, needs balance
- [ ] creep frequency: are `store`/`move` hazard rooms too dense / too sparse? tune `CREEP_ROLES`
- [ ] deck scaling (`encounter.js` deck multiplier) — does depth feel meaner without feeling unfair?
- [ ] defeat penalty (−25 hp / −10 food + wake-at-bed) — right magnitude?
- [ ] battle board on touch: tap targets, sprite scale, the flee affordance

## Shop + Lapidary (economy) — shipped, needs balance
- [ ] price curve (`shop.js` `PRICE_K=0.1`) vs. combat spoils — is the one-treasure-per-shelf right?
- [ ] gem pull cost (10) vs. socket payoff — does pulling feel worth a coin sink?
- [ ] **only worn gear's gems fight** — the `⚔ worn` marker helps; consider an "equip to benefit"
      nudge, or surface gem bonuses on the equip screen itself.
- [ ] grow UX: hint which lattices you already hold 3+ of (a ready-to-grow cue).
- [ ] are `mend` (Lapidary) rooms common enough to find one? widen roles if not.

## Durability / save — foundation laid this session
- [x] pack is durable (`pack.items` fact); combat/shop/gem state rides the existing `story.save`
- [ ] save size: items carry full genomes; a deep pack + gem satchel is sizeable JSON. Watch the
      100 KB `stateJson` ceiling on heavy saves; consider trimming item genomes to a re-roll seed.

## Mobile (audit pass — done)
- [x] bottom HUD was 5 buttons on hardcoded `right:` offsets (~430px) → overflowed phones. Now a
      wrapping flex **`#dock`** that collapses to icon-only ≤640px / coarse pointer.
- [x] `viewport-fit=cover` had no padding → safe-area insets added to top HUD, bottom links, dock.
- [x] touch targets bumped to ≥40px on coarse pointers; `:active` feedback added (hover is dead on touch).
- [x] `touch-action: manipulation` on the canvas (kills double-tap-zoom + tap delay on tap-to-walk).
- [x] fixed two pre-existing bugs surfaced by the audit: `#arch` was unpositioned + unclickable
      (`.hud` is `pointer-events:none`); `#newgame` overlapped `#pack` at bottom-right. Title v096→v098.
- [ ] still to verify on-device: landscape phones, the battle board's tap precision at small `ts`,
      and overlay `max-height: vh` vs the URL-bar (consider `dvh`).
- [ ] `title=` tooltips (27) are invisible on touch — fold the important hints into visible copy.

## Cross-cutting
- [x] **unified notice feed** — `notify(text,{kind,ms})` + a capped, dismissible `#notices` stack.
      All `flash*` + the inline `#busy` writers route through it; kind auto-derives from the leading
      glyph (◈ coin · ⚔ combat · ⬡ gem · ✦ tier · ✶ verdict · ✒ quest · ❀/✚ life · "not enough" warn).
      Each verdict now gets its own card (no more stomping). `#busy` is left to the generation spinner
      + the weave status only.
  - [ ] follow-on: a tap-to-open **history drawer** (the feed only shows the last 5 live); persist
        recent notices so a missed verdict/level-up is recoverable.
- [ ] first-run onboarding: the new surfaces (⚔ creeps, ⇄ wares, ⬡ Lapidary) have no tutorial beat.
