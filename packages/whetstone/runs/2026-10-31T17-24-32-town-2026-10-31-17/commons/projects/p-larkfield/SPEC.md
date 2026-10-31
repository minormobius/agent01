# Larkfield moderation service

The town decided against automatic mutes by report count (see `reports.csv`: two accounts were
reporting every newcomer). It wants a small library instead, `mod.mjs`, plus a command-line tool,
built to this spec. Six milestones; each is tested on data you haven't seen. This is more than a
day's work. The folder carries over between days.

Town weeks are numbered from 1, starting on the town's start date: days 0–6 after the start are
week 1, days 7–13 week 2, and so on. All dates are `YYYY-MM-DD`, UTC, no time zones.

**M1 — parsing.** `parseReports(text)` → `[{date, reporter, reported, reason}]` and
`parseResidents(text)` → `[{handle, kind, joined}]`, in file order. Columns may come in any
order (use the header). Ignore blank lines; accept `\r\n` line endings.

**M2 — weekly counts.** `weekOf(date, start)` → the week number. `weekly(reports, start)` →
`{ "<week>": { "<handle>": { "reports": n, "reporters": [distinct reporters, sorted] } } }`,
covering only weeks and handles that have reports.

**M3 — mutes.** `mutes(reports, start, { minDistinct = 3 } = {})` → `[{week, handle}]`: a handle
is muted in a week when at least `minDistinct` *different* people reported it that week. Sorted
by week, then handle.

**M4 — rings.** `rings(reports, residents, { minReports = 6, minOverlap = 0.8, joinedWithinDays = 1 } = {})`
→ an array of groups, each a sorted array of handles. Two reporters are *linked* when each has
filed at least `minReports` reports in total, the Jaccard overlap of the sets of handles they
reported is at least `minOverlap`, and they joined within `joinedWithinDays` days of each other.
A group is a connected set of linked reporters (size ≥ 2). Groups sorted by their first handle.

**M5 — appeals.** A muted resident can appeal. `appealJudge({handle, week, reporters}, residents, start)`
→ the handle of the resident who decides it: never the muted one, never one of its reporters,
and never someone who joined after the last day of that week (`start` + 7 × week − 1 days). Among those eligible, the one with the
lowest `fnv32(judgeHandle + ':' + handle + ':' + week)`, ties broken by handle. `fnv32` is the
32-bit FNV-1a hash of the string's UTF-16 code units (offset basis 2166136261, prime 16777619,
unsigned). Export `fnv32` too. `null` if nobody is eligible.

**M6 — the tool.** `node cli.mjs <reports.csv> <residents.csv> <start-date>` prints one JSON
object: `{"weeks": <number of the last week with a report>, "mutes": [...], "rings": [...],
"judges": [{"week", "handle", "judge"}]}`, where `judges` gives the appeal judge for every mute
(its reporters being those who reported it that week), in the order of `mutes`.

`node test.mjs` should run your tests.
