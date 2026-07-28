# v100 — the home stretch (polish punch-list)

v100 = v097 + the rumor-mill verdict feed wired into the live load path. The big systems are in
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
- [x] **pulse** (`story.pulse`) — wired. `loadPulse` reads the morphyx rollup singleton; the auth
      pill shows a "◍ N travellers" chip (tap → panel) and the new **story-status panel** (` / ⓘ dock)
      shows the full "N travellers · M have met the Keeper" line. Best-effort, public, fully guarded.
- [x] **story-status / debug panel** — toggleable read-only overlay proving the save-loop end to end:
      identity (@handle/DID), save (world key, cloud ✓/failed/dirty + uri, or local), pool source+count,
      tiers (deck/rev/pow/xp + hoopy learned/needed), census (seen/placed, inv/pack, gems/coins, verdict
      cursor), and the pulse line. Refreshes every 2 s while open.
- [ ] verdicts need a signed-in DID (they're DID-tagged) — anonymous players get none. Intended,
      but surface it (a hint in the auth pill: "sign in to receive the Tabard's changes").
- [ ] records page (`/v107/records`) — note that the verdict feed is now consumed live.

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
- [x] **multi-profile saves + world loader** — each ship seed is a separate save (PDS record keyed by
      seed + a per-world local buffer, `hoop:v107:story:<seed>`, migrated off the legacy global). Boot
      resumes the last-played world (`hoop:v107:lastseed` / `?seed=N`). The ⟲ "worlds" dock button opens
      a picker that lists profiles (local ◍ + cloud ☁, merged), resumes/deletes them, and starts fresh
      worlds (✦ new world = the "fully new game"; ↻ restart = the old wipe).
- [ ] save size: items carry full genomes; a deep pack + gem satchel is sizeable JSON. Watch the
      100 KB `stateJson` ceiling on heavy saves; consider trimming item genomes to a re-roll seed.

## Mobile (audit pass — done)
- [x] bottom HUD was 5 buttons on hardcoded `right:` offsets (~430px) → overflowed phones. Now a
      wrapping flex **`#dock`** that collapses to icon-only ≤640px / coarse pointer.
- [x] `viewport-fit=cover` had no padding → safe-area insets added to top HUD, bottom links, dock.
- [x] touch targets bumped to ≥40px on coarse pointers; `:active` feedback added (hover is dead on touch).
- [x] `touch-action: manipulation` on the canvas (kills double-tap-zoom + tap delay on tap-to-walk).
- [x] fixed two pre-existing bugs surfaced by the audit: `#arch` was unpositioned + unclickable
      (`.hud` is `pointer-events:none`); `#newgame` overlapped `#pack` at bottom-right. Title v096→v100.
- [ ] still to verify on-device: landscape phones, the battle board's tap precision at small `ts`,
      and overlay `max-height: vh` vs the URL-bar (consider `dvh`).
- [ ] `title=` tooltips (27) are invisible on touch — fold the important hints into visible copy.

## Render performance — the per-frame draw budget
- [x] **movement = its own setTimeout(24ms) loop that drew independently of RAF** → walking janked to
      ~20fps (two unsynced loops + per-step fog canvas allocs). Folded movement into the single RAF
      loop (`advanceWalk`, dt-interpolated, frame-rate independent), one draw/frame, cap raised to 60fps.

The static scene is already cheap (baked chunk raster + WebGPU cell fills, blitted once). The cost is
per-frame OVERLAYS redrawn every frame while residents animate. Five candidates, lowest-hanging first:
- [x] **fog blur** — was `ctx.filter = blur()` over each visible chunk EVERY frame (the costliest op).
      Now pre-blurred once in `bakeFog` (on reveal); the blit is plain. Done.
- [ ] **`drawNPC` society web** — every route + edge re-stroked each frame (static, fog-gated). Cache to
      an offscreen keyed on `(seen.size, deck, camera)` and blit. Likely the next-biggest win.
- [ ] **`drawPainted` raster blit** — large smoothed `drawImage`/chunk each frame; drop smoothing at
      scale ≤ 1, or pre-scale per zoom bucket.
- [ ] **`drawGpuCells` seam lines** — per-cell outline vertices every frame; skip the line pass below a
      zoom threshold (sub-pixel when zoomed out).
- [ ] **static/dynamic layering** — when the camera is still, only the player + residents need repaint;
      hold the world+overlays on a cached layer so a populated idle scene stops re-rendering everything.

## Cross-cutting
- [x] **unified notice feed** — `notify(text,{kind,ms})` + a capped, dismissible `#notices` stack.
      All `flash*` + the inline `#busy` writers route through it; kind auto-derives from the leading
      glyph (◈ coin · ⚔ combat · ⬡ gem · ✦ tier · ✶ verdict · ✒ quest · ❀/✚ life · "not enough" warn).
      Each verdict now gets its own card (no more stomping). `#busy` is left to the generation spinner
      + the weave status only.
  - [ ] follow-on: a tap-to-open **history drawer** (the feed only shows the last 5 live); persist
        recent notices so a missed verdict/level-up is recoverable.
- [ ] first-run onboarding: the new surfaces (⚔ creeps, ⇄ wares, ⬡ Lapidary) have no tutorial beat.
