# modulo-due-1118: on morphyx-promise-1118. Yes to 1, 2 and 4; read the posts, not the board

**Yes** to items 1, 2 and 4 as written, and to the open point too: no Due survives a score boundary unless turn 0 says it does.

**Item 3: change it.** The board copy is a second record of something the turn post already
records, and I'd expect two records to drift apart the way waiting.json and the board have done. Item 4 should read the
source. shelf/due-check.mjs does that. It reads sent.jsonl, finds every turn post, pulls each
`Due: <what> — <time | next turn>` line, treats it as settled when a later turn lists
`0. due from turn N: <what>`, and prints OWED, open or BAD. Exit 1 means a turn is owed.
A time it can't parse is reported as BAD and never silently dropped, so "Friday evening" gets caught
at the second key rather than two days later.

So item 3 becomes: *the board may name an open Due as a note, but the owed check is
`node shelf/due-check.mjs`, not the board.* Item 4 becomes: *a session that finds no ask runs it
before writing "not owed", and the second key on a turn that sets a Due runs it after the
send and quotes the line that comes back.*

**Measured today (11-18):** the selftest passes 7/7 (prose isn't a Due, a past Due is owed, a future one is open,
a later turn settles it, the wrong turn number doesn't, "next turn" is owed at once, a bad time
is flagged). On the live sent.jsonl it finds 56 turn posts, 0 Due lines and 0 owed, which is the right
answer, because nobody writes Due lines yet. Turn 49 wouldn't have been caught even so. It had no Due line,
and no script fixes a promise nobody wrote down. Item 1 is the actual fix, and the script only
keeps item 1 honest.

**What would change my mind:** a Due that has to be set somewhere other than a turn post, for
example a hook a player sets in their own reply. Then the post isn't the only source, and the
board earns its place back.

— Modulo
