# goss — the civic web viewer + the social-drama substrate

Live at **tide.mino.mobi/goss**. The hoop/chunkroller line of work turned sideways: instead of
looking at the **map**, look at the **web** — every NPC and their relationships to the places,
rendered as a force-laid graph, with the machinery for reading *social dramas* off that web.

Pure static, no build, zero deps. The model kernel (`gossip.js`) is pure + node-tested; the page
(`index.html` + `app.js`) only draws what `buildGoss(seed)` returns. Same seed ⇒ same town, same
names, same tribes, same gossip, forever.

```bash
node tide/goss/test/gossip.selftest.mjs   # 38 checks
```

## What's underneath

The town substrate is the **econ kernel** (`vendor/econ/` + `vendor/paint/` — verbatim copies of
`hoop/v099/econ/econ.js` + `hoop/v099/paint/voronoi.js`, the repo's copy-never-fork vendor rule:
re-sync from source, never edit the copy). `buildWorld` breeds the places, `buildSociety` lays
the people-with-many-hats over them — the exact society the chunkroller's civic readout scores.
The civic-vitality number on the rail is the same `scoreSociety` oracle `/econ` and
`/chunkroller` use.

## The design decisions (the questions this build answered)

**Is faction assigned at the NPC level?** No — nowhere in the engine. The nave's factions
(Rindwalker · Continuant · Drift) are *ward-level roleMix biases*; a person has no faction field.
goss therefore lets **tribes emerge from the web itself**: deterministic label propagation over
the tie graph (no randomness, no assignment — pure structure). Finding: at default scale the town
settles into 3–6 tribes, and their totems are almost always **parishes** — nearest-chapel
assignment makes communities geographic, i.e. literal parochialism. Emergent, not designed.

**Do we establish genders / ages / demographics?** The engine doesn't (no gender, age, or kinship
in `stats.js` / `crew.js` / `econ.js`). goss derives a **goss-local demographic layer**, seeded
off stable person identity: age (child/adult/elder mix), pronouns (she/he/they), household
surname + unique given name, and kinship read off the household age structure (head · partner ·
child · sibling · kin). Nothing is written back into the engine; if hoop later adopts
demographics, this module lifts out whole.

**Who does the naming — us or hoopy?** Naming has always been procedural hoop code, not hoopy
(the engine picks from a 30-name pool with constant collisions; `stats.js#nameCharacter` does
"Vex-7" crew names). goss does its own deterministic naming: household surnames make kinship
legible ("the Marrow household"), and places get speakable names ("the Fogline Fiber Canteen") so
gossip can *say where things happen*. Hoopy remains the bible/story author — if hoopy ever wants
naming authority, these banks are one file to swap.

## The layers (`gossip.js`)

1. **DEMOGRAPHICS** — `enrichPeople`: age, pronouns, names, households, kinship.
2. **TIES** — `weaveTies`: the person↔person weighted graph projected from co-membership,
   weighted by how binding the context is (partner 4.0 > household 3.0 > co-work 2.0 > co-worship
   1.5 > club/sport 1.2 > weak-tie 0.8). Every tie carries its evidence (`via` places).
3. **TRIBES** — `findTribes`: emergent label-propagation communities; totem place + generated
   name + role-profile per tribe.
4. **ROMANCE** — `findRomance`: established partners (from kinship) + new **sparks** (seeded
   attraction over strong non-household ties, adults only), flagged cross-tribe / affair-risk;
   triangles where two sparks share a soul.
5. **TENSION** — `findTension`, the two big axes:
   - **Tribalism**: polarization (share of tie weight that stays in-tribe — typically ~85–95%,
     the web is *very* clumpy), contested places (tribe-composition entropy), defectors (souls
     whose ties pull outward).
   - **Narcissism of small differences**: per tribe pair, `nsd = similarity × (1 − link)` where
     similarity is the cosine of the tribes' role-profiles and `link` compares actual cross-tie
     weight to the **configuration-model expectation** (modularity's null). The signature result:
     tribes ~95–99% identical in composition, stitched at ~10% of what random mixing predicts.
     Person-level: same-role coworkers with near-identical webs = **rivals** for the same regard.
6. **DRAMAS** — `findDramas`, the **proto-oracle**: typed seeds instantiated from graph patterns,
   ranked by heat — FEUD (near-twin tribes), SCHISM (contested third place), STAR-CROSSED
   (spark across the coldest boundary), AFFAIR, TRIANGLE, RIVALS, DEFECTOR, MATCH.

## Toward the real oracle (the theory isn't settled — this is the scaffold)

The drama layer is deliberately cheap to reshape: every drama carries its **evidence** (the
people/places/tribes and the numbers that fired it), so a future scorer can re-weigh or replace
the templates without touching layers 1–5. Candidate directions:

- **Time.** Everything here is a snapshot. Run the seed forward (ties strengthen with shared
  seasons, sparks resolve into households or grudges) and dramas become *arcs*.
- **The two tensions as one dial.** Tribalism and NSD are both functions of `(similarity, link)`
  per pair — a 2-D tension field. The oracle may be a phase diagram: high-sim/low-link = feud,
  low-sim/low-link = mere strangers, high-sim/high-link = one tribe about to schism.
- **Chunk fidelity.** The substrate here is econ's `buildWorld`; the same kernel runs unchanged
  over a real chunk record via chunkroller's `fieldFromRooms` adapter (rooms → places). Wiring a
  solved chunk (or the nave, with its designed wards vs these emergent tribes — a lovely
  contrast) in as an alternative substrate is a small adapter, not a redesign.
- **hoopy.** The drama seeds are structured JSON with prose sketch lines — exactly the shape an
  LLM pass (the borges/v096 pattern: procedural bones, model retelling, frozen per seed) could
  expand into actual scenes.

## Files

| File | Role |
|---|---|
| `gossip.js` | the kernel — all six layers, pure, zero-DOM |
| `index.html` + `app.js` | the viewer — force-laid web, lenses (⛺ tribes · ♥ romance · ⚔ tension · ☷ raw web), dossiers, the goss feed. `?seed=` permalink |
| `vendor/econ/econ.js` | verbatim `hoop/v099/econ/econ.js` — re-sync, never fork |
| `vendor/paint/voronoi.js` | verbatim `hoop/v099/paint/voronoi.js` — same rule |
| `test/gossip.selftest.mjs` | 38 checks — determinism, demographic sanity, emergent tribes, romance invariants, both tension axes, evidence-bearing dramas |
