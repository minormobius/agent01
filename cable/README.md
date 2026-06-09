# Cable — progressive cable-drawing solver

Live at **cable.mino.mobi** (mirrored at **cable.ascential.work**).

A custom instrument cable is the bridge between a board's connector and a
component's connector, with a run of cable in the middle terminated by a pin set
at each end. A finished cable drawing answers seven coupled questions:

1. **Component** — the field-side device and the signals it carries
2. **Connector** (component side)
3. **Pin set** (component side) + crimp tool
4. **Cable** — #conductors · gauge/conductor · stranding · twist · shield · length
5. **Pin** (board side)
6. **Connector** (board side)
7. **Board** — the fixed end that presents a defined header

They are *coupled*: the component fixes how many signals flow and the worst-case
current; that current together with the two connectors' contact families fixes
the wire gauge; the gauge feeds back into both pin sets and the cable
construction; the board fixes the board-side connector. This site picks the two
ends, propagates the constraints across all seven layers, and renders the
drawing, a wire list, a BOM, and the warnings it raised on the way.

## Architecture (pure static, no build)

```
index.html ─┬─ catalog.js   parts library: components, connectors, contacts,
            │                crimp tools, boards, AWG/strand/twist reference
            ├─ solver.js     CABLE_SOLVER.solve(catalog, input) → resolved stack
            ├─ drawing.js    CABLE_DRAW.render(solution) → blueprint SVG
            └─ app.js        wires controls ↔ solver, paints stack/drawing/tables
worker.js                    serves assets + hardening headers (no D1/AI/secrets)
```

Each module attaches to `globalThis`, so the solver runs unchanged in node:

```js
import "./catalog.js"; import "./solver.js";
const sol = globalThis.CABLE_SOLVER.solve(globalThis.CABLE_CATALOG, {
  componentId: "encoder_diff", boardId: "daq_24bit", lengthM: 5,
  flex: "continuous-flex", env: "industrial",
});
console.log(sol.summary, sol.warnings);
```

## The solver, briefly

- **Conductor count / current / pairs / shield** come from the component's signal
  lines. Differential pairs are flagged for twisting; analog/required-shield
  components or harsh environments get a shield + drain.
- **Connectors** are the smallest position count in a family that houses the
  conductors. The component side is the component's ranked preference (override-
  able); the board side is whatever header the chosen board presents.
- **Gauge** is the finest wire that *both* contact families can crimp (their AWG
  windows intersected) and that carries the worst-case current with 1.5× margin.
  Non-overlapping windows or an under-rated contact raise a warning.
- **Cable** stranding follows the routing class; twist tightness follows the
  signal's data-rate band; round-trip voltage drop is computed on the heaviest
  power line and flagged when it gets large.

## Reference data, not gospel

Ampacity figures are conservative chassis-wiring references and contact gauge
windows are typical, not exhaustive. Verify against the applicable electrical
code and the manufacturer datasheets before cutting copper.

## Deploy

`.github/workflows/deploy-cable.yml` → `npx wrangler deploy` on push to the
owning branch (see `deploy-registry.json`) touching `cable/**`. The worker name
`cable` owns both custom domains declared in `wrangler.jsonc`.
