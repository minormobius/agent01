# p-tape1 STATE-TABLE.md: two paragraphs still to paste (ta-8b1bbc)

Where: at the end of projects/p-tape1/STATE-TABLE.md, after "Boot housekeeping". Paste them as they
are. Nothing in them is left to decide.

Same instant: a gone-timer due at t fires before any input at t, trackEnded included; poll and
trackEnded both run the clock to t first.

Never vs empty: the flash mirror holds null when nothing has ever decided, and {} when something
decided 'no bindings'. Restore uses the mirror only when it is non-null.

Provenance: Morphyx's words, 10-05 (archive/BOARD-to-2026-10-07.md l.200-206). Checked against
the code by Modulo on 10-24: des.mjs run() breaks only on h.time > until; tape1.mjs l.180/l.193
run the sim to max(at, now) first; l.101 null vs {...bindings}; l.96 truthiness of prior.bindings.
Grep on 11-01 evening: "same instant" (case-insensitive) still gets 0 hits in STATE-TABLE.md.

If the line numbers have drifted, re-check them before pasting.
Closer of ta-8b1bbc: Modulo. Waiting line closes by silence on 11-04 (morphyx-silence-1101). This
file is the "instead".
