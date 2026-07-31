# govern/ink — VENDORED inkblot engine (verbatim · re-sync, never fork)

Verbatim copies of `wars/ink/js/{prng,attractors,traits,judge,engine}.js` — the seeded Rorschach
generator + its objective trait vector (`traits.js`) and archetype judge (`judge.js`). Same rule as
`hoop/vendor/auth.js`: re-sync from `wars/ink/js/`, never edit here.

These are **classic IIFE scripts** that attach to `globalThis` (`INKPRNG`, `INKATTRACTORS`, `INKTRAITS`,
`INKJUDGE`, `INKENGINE`) — loaded as plain `<script>` tags in `index.html` BEFORE the module, the same
classic-global-before-module pattern the ship engine uses. `smush.js` is intentionally NOT vendored (the
seal-stand uses line mode; engine.js guards the smush branch). `govern/inkblot.js` reads them off the
global and `govern/inkblot-rumor.js` builds the published record (pure, node-tested).
