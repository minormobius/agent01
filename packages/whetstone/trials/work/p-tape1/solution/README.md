# tape wave 1, the reference

The lab's own reference for SPEC.md. It exists so the checker is known to be passable; it is not
the souls' design and isn't shown to them.

The box is a des Sim that each input advances to its time. A card is placed at its first good read;
every good read restarts a one-second des timer, and when the timer fires the card is gone and any
playback pauses. A crowded poll pauses at once and forgets the card on the pad, so the next single
good read counts as a placement. Bindings live in /tape/cards.json, written cut-safe as cards.new
and then renamed, so a power cut leaves the old file or the new one, never half of one. Every bind
and every accepted boot copies the bindings into flash. At boot, cards.json decides if it parses,
then cards.new; if neither parses and flash holds a mirror, the box restores the mirror and logs it.
A new card binds to the first title, in name order, that no card is bound to; with none left it
plays a cue and appends the card's id to /tape/unknown.txt. The use log is tab-separated: time,
kind, details. A boot is marked sd-change when the set of titles differs from the last boot's,
which flash remembers.

The harness is a tagged JSON: non-finite numbers become {"$": "NaN"} and every key that begins with
"$" gets one more, so nothing a caller writes can be mistaken for a tag.
