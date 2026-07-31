# hoop/v096/food/ — the cafe's larder, grown from biome/gacha

The **food** half of the economy. Arcades (`../arcade.js`) pay coins; the cafe
spends them on food. Food is sourced from **biome/gacha** — the procedural
ecosystem generator one wing over — so the things you eat come from a real,
viability-scored closed food web, not a flat item table.

## The pipeline (offline build → committed JSON → static runtime)

```
biome/gacha (rollDesign + evaluateRoll)        ← the generator + viability oracle
   └─ build-biomes.mjs   rolls a few seeds, runs biome's real solver,
   │                     pulls the HARVESTABLE organisms out of each web
   └─ nutrition.mjs      derives kcal + macros + cost + game effects per organism
   └─ biomes.json        the baked larder the cafe serves  ← THE ONLY THING THAT SHIPS
```

hoop stays a no-build static site: **only `biomes.json` is read at runtime**
(`fetch`ed by the cafe in `index.html`). The build script imports biome's heavy
`cycles` engine — that runs **offline, in the sandbox**, never on the worker.

## Files

| File | Role |
|---|---|
| `nutrition.mjs` | Pure. Organism → food item: `foodKind` (plant/meat/fish), `macrosOf` (kcal + carb/protein/fat), `deriveFood` (+ cost, restoreStamina, nourish), `foodsFromRoll`. Node-tested by `../test/food.selftest.mjs`. |
| `build-biomes.mjs` | The offline build. Rolls a fixed seed set (deterministic), scores each with biome's oracle, bakes `biomes.json`. `node hoop/v096/food/build-biomes.mjs [--dry]`. |
| `biomes.json` | Committed data: a handful of viable ecosystems, each with its name/theme/tier + a menu of foods. Regenerate by re-running the build. |

## Restocking the cafe

Edit the `SEEDS` list in `build-biomes.mjs` (sweep for viable, food-rich rolls)
and re-run it, then commit the new `biomes.json`. Each cafe in the world is the
kitchen of one of these biomes, picked from its stable chamber key.

## Nutrition is a gloss, not canon

The kcal / macro / cost numbers are a believable derivation from the traits the
gacha catalog already carries (`harvestIndex`, `fix`, `mass_g`, `guild`,
`thermy`) — enough to make a menu read, tune the economy against arcade payouts,
and drive the stamina/health loop. They are not a nutritional model. The biome
*viability* (does the web close, what fraction of its crew it feeds) is the real
oracle's verdict and is carried through verbatim.
