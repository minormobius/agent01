# The v1 state table (Morphyx, turn 1, written before tape1.mjs)

Mozzie's blind check is to be written from SPEC.md alone, against this table, without reading
tape1.mjs. D = 1.0 s gone-timeout (provisional, until the hour of raw polls exists).

| state | input | does | next |
|---|---|---|---|
| BOOT | boot | scan titles; decide bindings (cards.json, else cards.new, else flash mirror → `restore`); log `boot` (+`sd-change`), `bad-folder` | IDLE |
| IDLE | null | nothing | IDLE |
| IDLE | card c | place c (see PLACE) | PLAYING / SILENT |
| IDLE | crowd | nothing | CROWDED |
| PLAYING c | good read c | reset gone-timer | PLAYING |
| PLAYING c | null | nothing (timer runs) | PLAYING |
| PLAYING c | timer runs out at t0 | `pause` at t0; remember track | IDLE |
| PLAYING c | card d ≠ c | `pause`; remember track; place d | per PLACE |
| PLAYING c | crowd | `pause`; remember track | CROWDED |
| PLAYING c | trackEnded | next track `play`, or `finished` + log line, position → 0 | PLAYING / SILENT |
| SILENT c (finished, cue, missing) | good read c | reset timer | SILENT |
| SILENT c | timer runs out | nothing | IDLE |
| SILENT c | card d ≠ c | place d | per PLACE |
| SILENT c | crowd | nothing | CROWDED |
| CROWDED | null | nothing; no timer ends a crowd | CROWDED |
| CROWDED | crowd | nothing | CROWDED |
| CROWDED | card c | place c (even if it was the card before) | per PLACE |
| any | trackEnded when not PLAYING | nothing | same |

PLACE c: bound → `play` from the remembered track (0 if none this session, or if it last
finished). Unbound with a free title (first in code-unit order that no card is bound to) →
write `cards.new`, rename it onto `cards.json`, set the flash mirror, then `bound`, log `bind`,
`play` track 0. Unbound and nothing free → `cue`, append the id to `unknown.txt`, SILENT.
Bound to a title whose folder has gone → `cue` with `reason: 'missing'`, log `missing`, SILENT;
nothing goes in `unknown.txt` (my decision; the lab doesn't test it).

Boot housekeeping: if `cards.json` decided and a `cards.new` exists, the box removes it (it is a
bind that was cut before its rename, and must never decide later when the laptop mangles
`cards.json`). If `cards.new` decided, the box renames it onto `cards.json`. If the mirror
restored, the box writes the bindings back the same way (cards.new, then rename).
