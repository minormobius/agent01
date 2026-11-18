# misfortune — Wheel of Misfortune

`mino.mobi/misfortune/` — served by the **root** surface (`misfortune/**` in
root's registry paths and `deploy-root.yml`). Satire: a game-show wheel of
critical-infrastructure misfortune with a shareable card.

| file | holds |
|---|---|
| `data.js` | the 24 wedges and their order. **Read its header before adding one.** |
| `wheel.js` | spin physics, pure: drag + friction, a speed loss per peg, a spring-damped flapper, the rock-back off a peg at rest |
| `card.js` | the 1200×630 card (also renders `og.png`) |
| `app.js` | wheel drawing, the loop, drag-to-fling, WebAudio peg clicks and fanfare, reveal, share/save/copy, `?w=<id>` deep links |
| `misfortune.selftest.mjs` | data rules + physics: 24 wedges, real ones dated and sourced, fiction unsourced, landing = wedge under the needle, every wedge reachable, none favoured, spins 3–16 s |

## The rules that keep it satire

- **real** wedges are facts with a date and a source; the joke is only in the
  framing. Check every one against primary reporting: on 2026-11-18 two widely
  reported "attacks" (the FAA ground stop, the Microsoft 365 outage) were
  plain faults, and they are on the wheel as exactly that.
- **fiction** wedges are absurd *outcomes* at famous or generic institutions.
  Never small, specific, real facilities, never anything about how. It is a
  joke wheel, not a target list.
- Victims of real harm (hospitals, blood banks) are not wedges.

## Refreshing it

The real wedges age. To refresh: research the last month, verify each item
against primary reporting, replace the `real` entries in `data.js` (keep 6),
run the selftest, and regenerate `og.png` only if the title card changes.
`og.png` is the title card, not per-wedge: per-wedge previews would need a
server-side renderer.
